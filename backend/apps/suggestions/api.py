"""Takliflar API.

KO'RINISH QOIDASI (`get_queryset`):

  * boshliq — hammasini ko'radi (ochiq ham, yopiq ham);
  * qolgan hamma — barcha OCHIQ takliflarni va O'ZINING yopiq takliflarini.

TARTIB. Ro'yxat ovoz bo'yicha saralanadi: `qo'shilaman` dan `qo'shilmayman`
ayiriladi va kattasi yuqorida turadi. Teng chiqsa ko'proq qo'llab-quvvatlangani,
undan keyin yangisi oldinga o'tadi. Shu sabab boshliq ro'yxatning boshiga
qarasa - jamoa eng ko'p kutayotgan o'zgarishni ko'radi.

NEGA `related_count`. Db2 `GROUP BY` ichida CLOB ustunini qo'llamaydi,
`Suggestion.body` esa aynan CLOB. Oddiy `annotate(Count(...))` tashqi
so'rovga `GROUP BY` qo'shadi va `SQL0134N` bilan yiqiladi - tafsiloti
`apps/core/queries.py` da. Shuning uchun sanoq ichki so'rov orqali olinadi.
"""
from django.db.models import F, IntegerField, OuterRef, Prefetch, Q, Subquery
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework import viewsets

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
        )

        scope = self.request.query_params.get("scope")
        if scope in SuggestionScope.values:
            qs = qs.filter(scope=scope)

        state = self.request.query_params.get("status")
        if state in SuggestionStatus.values:
            qs = qs.filter(status=state)

        if self.request.query_params.get("mine") in ("1", "true"):
            qs = qs.filter(author=me)

        return qs.order_by(*self.ordering_for(self.request.query_params.get("sort")))

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
        return self.SORTS.get((key or "").strip(), self.SORTS["top"])

    #: Doskaning bitta ustuniga bir marta nechta taklif tushadi.
    BOARD_PAGE = 10

    #: Doska ustunlari. «Barchasi» - qolgan uchtasining yig'indisi, ya'ni
    #: ustunlar bir-birini INKOR QILMAYDI: tasdiqlangan taklif «barchasi»
    #: da ham turadi. Bu Kanban emas - bitta ro'yxatning kesimlari.
    BOARD_COLUMNS = ("ALL", SuggestionStatus.PENDING,
                     SuggestionStatus.APPROVED, SuggestionStatus.REJECTED)

    @action(detail=False, methods=["get"])
    def board(self, request):
        """Doska ko'rinishi: barchasi, ko'rilmoqda, tasdiqlandi, rad etildi.

        Ro'yxat ko'rinishi (`list`) O'Z JOYIDA qoladi - `?status=` bilan
        bitta kesim so'raladi. Doska esa to'rttasini bir javobda beradi,
        aks holda sahifa to'rtta alohida so'rov yuborardi va ular
        bir-biridan ajralib ketishi mumkin edi (biri eski, biri yangi).

        HAR USTUN O'ZI SAHIFALANADI - `?page_all=2`, `?page_approved=3`.
        Bitta umumiy raqam yaramaydi: ustunlar uzunligi har xil va
        «tasdiqlangan» ning uchinchi sahifasi bo'lganda «rad etilgan»
        niki allaqachon tugagan bo'lardi.

        Tartib va `?mine=1` butun doskaga qo'llanadi - ular
        `get_queryset` dan keladi.
        """
        base = self.get_queryset()
        ctx = self.get_serializer_context()

        columns = []
        for key in self.BOARD_COLUMNS:
            qs = base if key == "ALL" else base.filter(status=key)
            total = qs.count()
            pages = max(1, -(-total // self.BOARD_PAGE))
            asked = request.query_params.get("page_{}".format(key.lower())) or 1
            try:
                page = min(max(1, int(asked)), pages)
            except (TypeError, ValueError):
                raise ValidationError({"page": "Sahifa raqami butun son bolsin."})
            start = (page - 1) * self.BOARD_PAGE
            columns.append({
                "key": key,
                # Sarlavhadagi son - ustundagi JAMI taklif, kelgan
                # kartalar soni emas: u sahifadan sahifaga o'zgarmasin.
                "count": total,
                "page": page,
                "pages": pages,
                "items": SuggestionSerializer(
                    qs[start:start + self.BOARD_PAGE], many=True, context=ctx).data,
            })
        return Response({"columns": columns})

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

        existing = SuggestionVote.objects.filter(suggestion=obj, user=request.user).first()
        if existing and existing.choice == choice:
            existing.delete()
        elif existing:
            existing.choice = choice
            existing.save(update_fields=["choice", "updated_at"])
        else:
            SuggestionVote.objects.create(suggestion=obj, user=request.user, choice=choice)

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

        Har holat alohida `count()` bilan olinadi, bitta `GROUP BY` bilan
        emas: Db2 guruhlash ichida CLOB ustunini (`Suggestion.body`)
        qo'llamaydi - modul izohiga qarang.
        """
        base = self.visible(request.user)
        data = {
            "open": base.filter(scope=SuggestionScope.OPEN).count(),
            "closed": base.filter(scope=SuggestionScope.CLOSED).count(),
            # Filtr nishonlari: «Barchasi», «Ko'rib chiqilmoqda», ...
            "all": base.count(),
            "mine": base.filter(author=request.user).count(),
        }
        for value in SuggestionStatus.values:
            data[value] = base.filter(status=value).count()
        # Boshliq uchun: navbatda nechta qaror kutyapti. Yon paneldagi
        # nishon shunga qaraydi, shuning uchun u faqat boshliqda to'ladi.
        data["pending"] = data[SuggestionStatus.PENDING] if request.user.is_boss else 0
        return Response(data)
