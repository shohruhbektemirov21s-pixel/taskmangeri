"""Takliflar API.

KO'RINISH QOIDASI (`get_queryset`):

  * boshliq — hammasini ko'radi (ochiq ham, yopiq ham);
  * qolgan hamma — barcha OCHIQ takliflarni va O'ZINING yopiq takliflarini.

TARTIB. Avval JAVOB KUTAYOTGANLAR, keyin qaror qilinganlar - bu qoida
tanlangan tartibdan qat'i nazar ishlaydi (`ordering_for`). Tasdiqlangan
yoki rad etilgan taklif - yopilgan ish, u ro'yxatning boshini egallab
turmasligi kerak.

Har guruh ICHIDA esa ovoz bo'yicha: `qo'shilaman` dan `qo'shilmayman`
ayiriladi va kattasi yuqorida turadi. Teng chiqsa ko'proq
qo'llab-quvvatlangani, undan keyin yangisi oldinga o'tadi. Shu sabab
boshliq ro'yxatning boshiga qarasa - jamoa eng ko'p kutayotgan va hali
javobsiz o'zgarishni ko'radi.

NEGA `related_count`. Db2 `GROUP BY` ichida CLOB ustunini qo'llamaydi,
`Suggestion.body` esa aynan CLOB. Oddiy `annotate(Count(...))` tashqi
so'rovga `GROUP BY` qo'shadi va `SQL0134N` bilan yiqiladi - tafsiloti
`apps/core/queries.py` da. Shuning uchun sanoq ichki so'rov orqali olinadi.
"""
from django.db.models import (Case, Count, F, IntegerField, OuterRef, Prefetch,
                              Q, Subquery, Value, When)
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework import viewsets

from apps.core.periods import due_span
from apps.core.queries import related_count
from apps.core.uploads import check_uploads

from .models import (Suggestion, SuggestionFile, SuggestionScope, SuggestionStatus,
                     SuggestionVote, VoteChoice)
from .serializers import (DecisionSerializer, SuggestionFileSerializer,
                          SuggestionSerializer, VoteSerializer)
from .services import notify_decision, notify_new


class SuggestionViewSet(viewsets.ModelViewSet):
    serializer_class = SuggestionSerializer

    def visible(self, me):
        """Odam KO'RA oladigan takliflar - filtrlarsiz, sanoqlarsiz.

        Ro'yxat ham, `counts` ham shu yerdan boshlanadi. Ajralib qolsa
        nishondagi son bilan ochilgan ro'yxat bir-biriga to'g'ri kelmasdi:
        «Tasdiqlangan 6» deb yozilib, ichida to'rttasi turardi.
        """
        qs = Suggestion.objects.all()
        if not me.is_boss:
            # Yopiq taklif - faqat egasiga. Boshliq bu shartdan tashqarida.
            qs = qs.filter(Q(scope=SuggestionScope.OPEN) | Q(author=me))
        return qs

    def get_queryset(self):
        me = self.request.user

        qs = self.visible(me).select_related("author", "decided_by").prefetch_related(
            # `suggestion` ham qo'shildi: fayl serializeri anonimlikni
            # taklifdan o'qiydi va busiz har fayl uchun alohida so'rov ketardi.
            Prefetch("files", queryset=SuggestionFile.objects
                     .select_related("uploaded_by", "suggestion")))

        qs = qs.annotate(
            for_count=related_count(SuggestionVote, group_by="suggestion",
                                    choice=VoteChoice.FOR),
            against_count=related_count(SuggestionVote, group_by="suggestion",
                                        choice=VoteChoice.AGAINST),
            neutral_count=related_count(SuggestionVote, group_by="suggestion",
                                        choice=VoteChoice.NEUTRAL),
            # O'z tanlovi - tugmalardan qaysi biri bosilganini ko'rsatish uchun.
            # Boshqalarning tanlovi hech qachon so'ralmaydi.
            my_vote=Subquery(
                SuggestionVote.objects
                .filter(suggestion=OuterRef("pk"), user=me)
                .values("choice")[:1]),
        ).annotate(
            score=Coalesce(F("for_count") - F("against_count"), 0,
                           output_field=IntegerField()),
            # QAROR QILINGANLAR PASTGA. Javob kutayotgan taklif - ish,
            # tasdiqlangani yoki rad etilgani esa natija: u o'qilgan va
            # yopilgan. Ilgari ikkovi aralash turardi va ovoz bo'yicha
            # saralanganda yopilgan taklif ro'yxatning boshida qolib
            # ketardi - boshliq har safar uni oshirib o'tishga majbur edi.
            #
            # Bu HAMMA tartibda qo'llanadi (`SORTS`): «eng yangi» ni
            # tanlagan odam ham avval javob kutayotganini ko'radi.
            # Holat bo'yicha filtrlanganda esa ta'siri yo'q - u yerda
            # hamma qator bir xil guruhda bo'ladi.
            decided_last=Case(
                When(status=SuggestionStatus.PENDING, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            ),
        )

        scope = self.request.query_params.get("scope")
        if scope in SuggestionScope.values:
            qs = qs.filter(scope=scope)

        state = self.request.query_params.get("status")
        if state in SuggestionStatus.values:
            qs = qs.filter(status=state)

        if self.request.query_params.get("mine") in ("1", "true"):
            qs = qs.filter(author=me)

        qs = self.searched(qs, self.request.query_params.get("search"))
        qs = self.on_dates(qs, self.request.query_params.get("date"),
                           self.request.query_params.get("period"))

        return qs.order_by(*self.ordering_for(self.request.query_params.get("sort")))

    def searched(self, qs, needle):
        """Qidiruv: sarlavha, matn va MUALLIF ismi.

        ANONIM TAKLIF ISM BO'YICHA TOPILMAYDI. Aks holda anonimlik shu
        yerdan buzilardi: ro'yxatda muallif ko'rsatilmaydi-yu, odamning
        ismini qidiruvga yozib, uning yozganini topib olish mumkin bo'lardi
        - ya'ni «hech kimga ko'rsatilmaydi» va'dasi qidiruv orqali chetlab
        o'tilardi. Sarlavha va matn esa hammaga ochiq, ular bo'yicha
        qidirish anonimlikka tegmaydi.

        Matn (`body`) Db2 da CLOB, lekin LIKE unga qo'llanadi - guruhlash
        bilan adashtirmang (modul izohi).
        """
        needle = (needle or "").strip()
        if not needle:
            return qs
        return qs.filter(
            Q(title__icontains=needle)
            | Q(body__icontains=needle)
            | Q(is_anonymous=False, author__full_name__icontains=needle))

    def on_dates(self, qs, date_raw, period):
        """«Sana» va «Davr» kesimi - taklif QACHON yozilgani bo'yicha.

        Oraliqni `apps/core/periods.py` hisoblaydi: «shu hafta» bu yerda
        ham dushanbadan yakshanbagacha, ya'ni vazifalar ro'yxatidagi bilan
        BIR XIL hafta. Aniq sana berilsa u davrdan ustun turadi.
        """
        span = due_span(date_raw or "", period or "")
        if span is None:
            return qs
        return qs.filter(created_at__gte=span[0], created_at__lt=span[1])

    #: Ro'yxat tartibi. STANDARTI - ovoz bo'yicha: boshliq ro'yxatning
    #: boshiga qarasa jamoa eng ko'p kutayotgan o'zgarishni ko'radi (modul
    #: izohiga qarang). «Eng yangi» esa boshqa savolga javob beradi -
    #: «bugun nima taklif qilindi», shuning uchun u tanlov bo'lib qoladi,
    #: standart bo'lib emas.
    SORTS = {
        "top": ("-score", "-for_count", "-created_at"),
        "new": ("-created_at",),
        "old": ("created_at",),
    }

    def ordering_for(self, key):
        """Tanlangan tartib - lekin QAROR QILINGANLAR har doim pastda.

        `decided_last` birinchi kalit: javob kutayotganlar tepada qoladi,
        tanlangan tartib esa har guruh ICHIDA ishlaydi.
        """
        return ("decided_last",) + self.SORTS.get((key or "").strip(), self.SORTS["top"])

    # --------------------------------------------------------------- yozish

    def perform_create(self, serializer):
        obj = serializer.save(author=self.request.user)
        # Taklif javob kutib turadi - boshliq uni ro'yxatni ochib
        # tekshirmasdan, qo'ng'iroq orqali bilsin.
        notify_new(obj)

    def _mine_or_403(self, obj):
        if obj.author_id != self.request.user.id:
            raise PermissionDenied("Taklifni faqat uni yozgan odam o'zgartira oladi.")

    def perform_update(self, serializer):
        obj = serializer.instance
        self._mine_or_403(obj)

        # Matn o'zgarsa qaror kuchini yo'qotadi: boshliq boshqa narsani
        # tasdiqlagan bo'lardi. Tafsiloti - `Suggestion.clear_decision`.
        changed = any(serializer.validated_data.get(f, getattr(obj, f)) != getattr(obj, f)
                      for f in ("title", "body", "scope", "is_anonymous"))
        if changed and obj.is_decided:
            obj.clear_decision()
            serializer.save(status=SuggestionStatus.PENDING, decided_by=None,
                            decided_at=None, decision_note="")
            return
        serializer.save()

    def perform_destroy(self, instance):
        self._mine_or_403(instance)
        instance.delete()

    # --------------------------------------------------------------- amallar

    @action(detail=True, methods=["post"])
    def vote(self, request, pk=None):
        """«Qo'shilaman / qo'shilmayman / betarafman».

        Qayta bosilsa ovoz ALMASHADI, o'sha tugma qayta bosilsa OLIB
        TASHLANADI - odam fikridan qaytishi ham mumkin.
        """
        obj = self.get_object()
        if obj.scope != SuggestionScope.OPEN:
            return Response({"detail": "Yopiq taklifga ovoz berilmaydi."},
                            status=http.HTTP_400_BAD_REQUEST)

        form = VoteSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        choice = form.validated_data["choice"]

        # `update_or_create` - `filter().first()` keyin `create()` EMAS.
        #
        # Ikkita so'rov orasida oyna bor edi: tugmani ikki marta bosish
        # yoki ikkita ochiq oyna ikkala tomondan ham «yozuv yo'q» degan
        # javob olib, ikkovi ham `create()` chaqirardi.
        # `unique_together (suggestion, user)` ni buzib, foydalanuvchi
        # 500 ko'rardi. `update_or_create` buni bitta amalga jamlaydi.
        deleted, _ = SuggestionVote.objects.filter(
            suggestion=obj, user=request.user, choice=choice).delete()
        if not deleted:
            # O'sha tugma qayta bosilmagan - ovoz qo'yiladi yoki almashadi.
            SuggestionVote.objects.update_or_create(
                suggestion=obj, user=request.user, defaults={"choice": choice})

        return Response(self.get_serializer(self.get_queryset().get(pk=obj.pk)).data)

    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        """Tasdiqlash, rad etish yoki izoh qoldirish — faqat boshliq."""
        if not request.user.is_boss:
            raise PermissionDenied("Taklif bo'yicha qarorni faqat boshliq qabul qiladi.")

        obj = self.get_object()
        form = DecisionSerializer(data=request.data)
        form.is_valid(raise_exception=True)

        note = form.validated_data.get("note", "").strip()
        new_status = form.validated_data.get("status")

        if new_status:
            obj.status = new_status
            obj.decided_by = request.user
            obj.decided_at = timezone.now()
        if note or new_status:
            obj.decision_note = note
        obj.save(update_fields=["status", "decided_by", "decided_at",
                                "decision_note", "updated_at"])

        # Qarorni muallif kutib turadi. Bo'sh so'rov (na holat, na izoh)
        # hech narsani o'zgartirmagan - unga xabar ham kerak emas.
        if new_status or note:
            notify_decision(obj, actor=request.user, status_changed=bool(new_status))

        return Response(self.get_serializer(self.get_queryset().get(pk=obj.pk)).data)

    # ---------------------------------------------------------------- fayllar

    @action(detail=True, methods=["get", "post"], url_path="files",
            parser_classes=[MultiPartParser, FormParser, JSONParser])
    def files(self, request, pk=None):
        """GET — fayllar ro'yxati; POST — fayl biriktirish (multipart/form-data).

        Yuklashni faqat MUALLIF qiladi: taklif uniki, fayl ham unga qo'shimcha.
        """
        obj = self.get_object()

        if request.method == "GET":
            return Response(SuggestionFileSerializer(
                obj.files.select_related("uploaded_by", "suggestion"), many=True,
                context=self.get_serializer_context()).data)

        self._mine_or_403(obj)
        uploads = request.FILES.getlist("file") or request.FILES.getlist("files")
        if not uploads:
            raise ValidationError({"file": "Fayl tanlanmagan."})
        check_uploads(uploads)

        created = []
        for f in uploads:
            form = SuggestionFileSerializer(data={"file": f},
                                            context=self.get_serializer_context())
            form.is_valid(raise_exception=True)
            created.append(form.save(
                suggestion=obj, uploaded_by=request.user,
                content_type=(getattr(f, "content_type", "") or "")[:120]))

        return Response(SuggestionFileSerializer(
            created, many=True, context=self.get_serializer_context()).data,
            status=http.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path="files/(?P<file_id>[^/.]+)")
    def delete_file(self, request, pk=None, file_id=None):
        obj = self.get_object()
        self._mine_or_403(obj)
        item = get_object_or_404(SuggestionFile, pk=file_id, suggestion=obj)
        item.file.delete(save=False)
        item.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="counts")
    def counts(self, request):
        """Yon paneldagi raqam, bo'limlar va FILTR NISHONLARI uchun sanoq.

        Nishondagi son ekrandagi qatorlardan chiqmaydi: ro'yxat
        sahifalangan va birinchi sahifada o'ntasi turadi. Shuning uchun u
        ham shu yerdan - ro'yxat bilan BIR XIL ko'rinish shartidan
        (`visible`). Ajralib qolsa «Tasdiqlangan 6» deb yozilib, ichida
        to'rttasi turardi.

        BITTA SO'ROV. Ilgari bu yerda yettita alohida `count()` turardi -
        hammasi AYNI BIR jadvalni, ayni bir ko'rinish shartidan o'tib
        o'qir, faqat filtri boshqacha edi. Ya'ni Db2 ga yettita
        borib-kelish, har safar `visible()` dagi shart qayta hisoblanib.

        `aggregate()` esa `GROUP BY` QO'SHMAYDI - u butun to'plam ustidan
        bitta qator qaytaradi. Shu sabab Db2 ning CLOB cheklovi
        (`Suggestion.body`) bu yerda qo'zg'almaydi: cheklov guruhlashga
        tegishli, shartli sanoqqa emas. Naqsh `apps/panel/api.py` da
        ilgaridan ishlatiladi.
        """
        base = self.visible(request.user)
        me = request.user

        sums = {
            "open": Q(scope=SuggestionScope.OPEN),
            "closed": Q(scope=SuggestionScope.CLOSED),
            "mine": Q(author=me),
        }
        for value in SuggestionStatus.values:
            sums[value] = Q(status=value)

        data = base.aggregate(
            # Filtr nishonlari: «Barchasi», «Ko'rib chiqilmoqda», ...
            all=Count("id"),
            **{key: Count("id", filter=cond) for key, cond in sums.items()},
        )
        # Boshliq uchun: navbatda nechta qaror kutyapti. Yon paneldagi
        # nishon shunga qaraydi, shuning uchun u faqat boshliqda to'ladi.
        data["pending"] = data[SuggestionStatus.PENDING] if me.is_boss else 0
        return Response(data)
