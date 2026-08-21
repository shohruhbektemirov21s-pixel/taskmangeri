from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Exists, OuterRef, Q, Sum
from rest_framework import filters, generics, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.models import GlobalRole
from apps.activity.services import log
from apps.projects.permissions import (IsPlatformAdmin, sees_all_projects,
                                       visible_projects_q)
from apps.tasks.models import TaskStatus

from .specialties import Seniority, Specialty, specialty_catalog
from .serializers import (AdminCreateUserSerializer, ChangePasswordSerializer,
                          MeSerializer, RefreshSerializer, RegisterSerializer,
                          TokenSerializer, UserAdminSerializer, UserBriefSerializer,
                          UserListSerializer)

User = get_user_model()


@api_view(["GET"])
@permission_classes([AllowAny])
def specialties(request):
    """Royxatdan otish sahifasi uchun mutaxassisliklar katalogi."""
    return Response({
        "specialties": specialty_catalog(),
        "seniority": [{"value": v, "label": l} for v, l in Seniority.choices],
    })


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/  -> {access, refresh, user}

    Parol topishga urinishlarni cheklaymiz: throttle_scope="auth".
    """

    permission_classes = [AllowAny]
    serializer_class = TokenSerializer
    throttle_scope = "auth"
    throttle_classes = [ScopedRateThrottle]


class RefreshView(TokenRefreshView):
    """POST /api/auth/refresh/ - muddati o'tgan access o'rniga yangisini beradi.

    Standart view emas, chunki seriyalizator almashtirilgan - sababi
    `RefreshSerializer` da.
    """

    serializer_class = RefreshSerializer


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ - ommaviy hisob ochishdan himoyalangan."""

    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer
    throttle_scope = "auth"
    throttle_classes = [ScopedRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log(actor=user, verb="user.registered", target=user,
            summary="{} platformada royxatdan otdi".format(user.full_name))

        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": MeSerializer(user, context=self.get_serializer_context()).data,
        }, status=status.HTTP_201_CREATED)


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/auth/me/"""

    serializer_class = MeSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        return self.request.user


class AvatarView(generics.GenericAPIView):
    """POST/DELETE /api/auth/me/avatar/ - o'z rasmini qo'yish, almashtirish, o'chirish.

    Nega alohida endpoint: rasm `multipart/form-data` bilan keladi, o'chirish esa
    bo'sh qiymat yuborish bilan emas - aniq DELETE bilan bo'lishi kerak. Aks holda
    profil formasi rasm maydonini yubormay qolsa, rasm bexosdan o'chib ketardi.

    Eski fayl har safar diskdan olib tashlanadi - almashtirilgan rasmlar
    media papkasida yig'ilib qolmasin.
    """

    serializer_class = MeSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    MAX_BYTES = 5 * 1024 * 1024
    ALLOWED = ("image/jpeg", "image/png", "image/webp", "image/gif")

    def post(self, request):
        image = request.FILES.get("avatar") or request.FILES.get("file")
        if not image:
            raise ValidationError({"avatar": "Rasm tanlanmagan."})
        if image.size > self.MAX_BYTES:
            raise ValidationError({"avatar": "Rasm hajmi 5 MB dan oshmasligi kerak."})
        content_type = (getattr(image, "content_type", "") or "").lower()
        if content_type and content_type not in self.ALLOWED:
            raise ValidationError({"avatar": "Faqat JPEG, PNG, WEBP yoki GIF rasm bo'lishi mumkin."})

        user = request.user
        if user.avatar:
            user.avatar.delete(save=False)
        user.avatar = image
        user.save(update_fields=["avatar"])
        return Response(MeSerializer(user, context={"request": request}).data)

    def delete(self, request):
        user = request.user
        if user.avatar:
            user.avatar.delete(save=False)
            user.avatar = None
            user.save(update_fields=["avatar"])
        return Response(MeSerializer(user, context={"request": request}).data)


def revoke_refresh_tokens(user):
    """Foydalanuvchining barcha refresh tokenlarini bekor qiladi.

    Access token JWT - u imzo bilan tekshiriladi va serverdan so'ramaydi,
    ya'ni o'z muddati (`ACCESS_TOKEN_LIFETIME`) tugaguncha ishlaydi. Lekin
    refresh bekor qilinsa yangi access olinmaydi: sessiya shu muddat ichida
    o'z-o'zidan uziladi.
    """
    from rest_framework_simplejwt.token_blacklist.models import (BlacklistedToken,
                                                                 OutstandingToken)

    count = 0
    for token in OutstandingToken.objects.filter(user=user):
        _, created = BlacklistedToken.objects.get_or_create(token=token)
        count += int(created)
    return count


class LogoutView(APIView):
    """POST /api/auth/logout/  {refresh}

    Ilgari chiqish faqat brauzerda bo'lardi: token localStorage dan
    o'chirilar, lekin serverda amal qilishda davom etardi. Endi refresh
    token bekor qilinadi.

    `all=1` bilan - hamma qurilmadan chiqish.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from rest_framework_simplejwt.exceptions import TokenError
        from rest_framework_simplejwt.tokens import RefreshToken

        if str(request.data.get("all", "")).lower() in ("1", "true"):
            return Response({"revoked": revoke_refresh_tokens(request.user)})

        raw = request.data.get("refresh")
        if not raw:
            # Token yuborilmasa ham chiqish muvaffaqiyatli hisoblanadi:
            # brauzer tomonda tozalash allaqachon bo'lgan, serverga esa
            # ayta olmadi. Xato qaytarish foydalanuvchini "chiqa olmadim"
            # degan holatda qoldirardi.
            return Response({"revoked": 0})
        try:
            RefreshToken(raw).blacklist()
        except TokenError:
            # Muddati o'tgan yoki allaqachon bekor qilingan - natija bir xil.
            return Response({"revoked": 0})
        return Response({"revoked": 1})


class ChangePasswordView(generics.GenericAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        if not request.user.check_password(s.validated_data["old_password"]):
            return Response({"old_password": ["Joriy parol xato."]}, status=400)
        request.user.set_password(s.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        # Parol almashtirilgan sessiyalar bekor qilinadi: aks holda "parolimni
        # o'zgartirdim" degani hujum oynasini yopmasdi - eski refresh token
        # 14 kun yangi access token olib turardi.
        revoke_refresh_tokens(request.user)
        refresh = RefreshToken.for_user(request.user)
        return Response({
            "detail": "Parol yangilandi.",
            # Joriy qurilma chiqib qolmasin - unga darrov yangi juftlik.
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        })


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """Foydalanuvchilar ro'yxati. Rolni faqat admin o'zgartira oladi."""

    serializer_class = UserAdminSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["full_name", "email", "skills", "job_title"]
    ordering_fields = ["date_joined", "full_name"]
    ordering = ["-date_joined"]

    def get_serializer_class(self):
        # Ro'yxatda qisqa ko'rinish: shaxsiy kontakt ma'lumotlari (bio,
        # telegram) faqat odamning o'z sahifasida chiqadi.
        if self.action == "list":
            return UserListSerializer
        return UserAdminSerializer

    def get_queryset(self):
        from apps.core.queries import related_count
        from apps.projects.models import ProjectMember
        from apps.tasks.models import TaskAssignment

        qs = User.objects.annotate(
            project_count=related_count(ProjectMember, group_by="user", is_active=True),
            open_tasks=related_count(
                TaskAssignment, group_by="user", is_active=True,
                task__status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS,
                                  TaskStatus.IN_REVIEW]),
        )
        # O'chirilgan hisoblar ro'yxatda turmaydi - ular na qidiruvda, na
        # odam tanlash oynasida kerak. Adminga kerak bo'lsa `?inactive=1`.
        if self.request.query_params.get("inactive") == "1":
            if self.request.user.is_platform_admin:
                qs = qs.filter(is_active=False)
        else:
            qs = qs.filter(is_active=True)

        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(global_role=role)
        specialty = self.request.query_params.get("specialty")
        if specialty:
            qs = qs.filter(specialty=specialty)
        seniority = self.request.query_params.get("seniority")
        if seniority:
            qs = qs.filter(seniority=seniority)
        return qs

    @action(detail=False, methods=["get"], url_path="specialty-stats")
    def specialty_stats(self, request):
        """Mutaxassisliklar bo'yicha taqsimot - JORIY FILTR bo'yicha.

        NEGA ALOHIDA ENDPOINT. «Jamoa» sahifasida yon tomonda «qaysi
        yo'nalishdan nechta odam bor» kartasi turadi. Ilgari u ekrandagi
        ro'yxatdan sanalardi va bu faqat butun ro'yxat bir sahifada
        kelgani uchun to'g'ri edi (`page_size=200`). Sahifalash qo'shilgach
        u JIMGINA yolg'on ko'rsatib qolardi: birinchi sahifadagi o'ttiz
        kishining taqsimoti butun jamoaniki bo'lib ko'rinardi.

        Sanoq shu yerda, bazada bajariladi va sahifadan qat'i nazar
        to'g'ri qoladi. Filtrlar (`?search=`, `?role=`, ...) esa o'z
        kuchida: qidiruv natijasining taqsimoti ko'rsatiladi.

        `get_queryset()` dan foydalanadi, ya'ni ro'yxat bilan bir xil
        shartdan o'tadi - ikkovi ajralib ketmaydi.
        """
        from django.db.models import Count

        from apps.accounts.specialties import Specialty

        names = dict(Specialty.choices)
        # `values(...).annotate(Count)` - GROUP BY faqat bitta qisqa
        # ustun bo'yicha, ya'ni Db2 ning CLOB cheklovi qo'zg'almaydi.
        rows = (self.filter_queryset(self.get_queryset())
                .values("specialty").annotate(n=Count("id")).order_by("-n"))
        return Response({"items": [
            {"value": r["specialty"],
             "label": names.get(r["specialty"], r["specialty"]),
             "count": r["n"]}
            for r in rows if r["specialty"]
        ]})

    @action(detail=True, methods=["get"], url_path="work")
    def work(self, request, pk=None):
        """Foydalanuvchi nima qilgani: loyihalari, vazifalari, tarixi, sarflagan soati.

        XAVFSIZLIK: ko'rinish **so'rovchining** huquqiga qarab cheklanadi.
        Boshqa odamning yopiq loyihasi nomi ham, o'sha loyihadagi vazifasi ham
        ko'rinmaydi - faqat ochiq loyihalar va so'rovchi ham a'zo bo'lgan
        loyihalar qaytadi. Platforma admini hammasini ko'radi.
        """
        from apps.activity.models import Activity
        from apps.activity.serializers import ActivitySerializer
        from apps.projects.models import Project
        from apps.tasks.models import Task, TaskStatus, WorkLog
        from apps.tasks.serializers import TaskSerializer

        target = self.get_object()
        me = request.user
        ctx = {"request": request}
        # Chegarasiz ko'rinish: o'z sahifasi va hamma loyihani
        # ko'radiganlar (admin, boshliq, global menejer). Ilgari bu yerda
        # faqat `is_platform_admin` turardi va natijada boshliq begona
        # odamning sahifasida to'g'ri ma'lumotni ko'rardi-yu, javobda
        # «ro'yxat qirqilgan» degan bayroq (`limited`) yonib turardi -
        # interfeys esa shunga qarab ogohlantirish yozardi.
        wide = bool(sees_all_projects(me) or me.pk == target.pk)

        # So'rovchi ko'ra oladigan loyihalar doirasi. Qoida `ProjectAccess.can_view`
        # dan keladi (`visible_projects_q`) - ya'ni boshqa odamning sahifasida
        # ham begona ish maydonining loyihasi ko'rinmaydi.
        def limit(qs, path=""):
            if wide:
                return qs
            return qs.filter(visible_projects_q(me, path))

        from apps.projects.models import ProjectMember

        projects = limit(
            Project.objects.filter(Exists(ProjectMember.objects.filter(
                project=OuterRef("pk"), user=target, is_active=True)))
        ).select_related("workspace").order_by("-updated_at")[:30]

        roles = {m.project_id: m.get_role_display() for m in
                 target.project_memberships.filter(is_active=True)}

        from apps.tasks.models import TaskAssignment

        tasks = Task.objects.filter(Exists(TaskAssignment.objects.filter(
            task=OuterRef("pk"), user=target, is_active=True)))
        tasks = limit(tasks, "project__").select_related("project")

        by_status = {row["status"]: row["c"]
                     for row in tasks.values("status").annotate(c=Count("id"))}
        hours = (WorkLog.objects.filter(user=target, task__in=tasks)
                 .aggregate(s=Sum("hours"))["s"] or 0)

        activity = limit(Activity.objects.timeline().filter(actor=target), "project__")

        return Response({
            "user": UserBriefSerializer(target, context=ctx).data,
            "stats": {
                "projects": len(projects),
                "open": sum(v for k, v in by_status.items()
                            if k not in (TaskStatus.DONE, TaskStatus.CANCELLED)),
                "done": by_status.get(TaskStatus.DONE, 0),
                "in_review": by_status.get(TaskStatus.IN_REVIEW, 0),
                "changes": by_status.get(TaskStatus.CHANGES_REQUESTED, 0),
                "hours": float(hours),
            },
            "projects": [{
                "id": p.id, "name": p.name, "key": p.key, "color": p.color,
                "workspace_name": p.workspace.name,
                "role": roles.get(p.id, ""),
            } for p in projects],
            # Kartada sahifalanadi (o'ntadan), shuning uchun yigirmata emas -
            # yuztagacha. Sahifa BRAUZERDA almashadi: bu javob butun profil
            # sahifasini olib keladi (statistika, loyihalar, tarix), ya'ni
            # har sahifa bosilganda uni qaytadan so'rash bekorchilik bo'lardi.
            #
            # `prefetch_related` shart: seriyalizator har vazifa uchun
            # ijrochilarni, teglarni va fayl sonini o'qiydi - usiz yuzta
            # vazifa yuzlab qo'shimcha so'rovga aylanardi.
            "tasks": TaskSerializer(
                tasks.exclude(status=TaskStatus.CANCELLED)
                     .prefetch_related("assignments__user", "labels")
                     .order_by("-updated_at")[:100],
                many=True, context=ctx).data,
            "activity": ActivitySerializer(activity[:25], many=True, context=ctx).data,
            "limited": not wide,
        })

    @action(detail=True, methods=["patch"], permission_classes=[IsPlatformAdmin])
    def role(self, request, pk=None):
        """PATCH /api/users/:id/role/  {global_role, is_active}"""
        target = self.get_object()
        old = target.get_global_role_display()
        role = request.data.get("global_role")

        # Uchta himoya - `projects.api.member_action` dagi «adminlikni bekor
        # qilish» bilan bir xil. Ilgari bu endpointda ular yo'q edi: admin
        # o'zini ham, bosh hisobni ham tushirib qo'ya olardi va platforma
        # boshqaruvsiz qolishi mumkin edi.
        losing_admin = (target.is_platform_admin
                        and ((role and role != GlobalRole.ADMIN)
                             or request.data.get("is_active") is False))
        if losing_admin:
            if target.is_superuser:
                raise ValidationError({
                    "detail": "Bosh hisobning huquqini olib qo'yib bo'lmaydi."})
            if target.pk == request.user.pk:
                raise ValidationError({
                    "detail": "O'z adminlik huquqingizni o'zingiz olib qo'ya olmaysiz - "
                              "buni boshqa admin qiladi."})
            others = User.objects.filter(global_role=GlobalRole.ADMIN,
                                         is_active=True).exclude(pk=target.pk).count()
            if not others:
                raise ValidationError({
                    "detail": "Bu oxirgi tizim admini - uni tushirsak platforma "
                              "boshqaruvsiz qoladi."})

        if role and role in dict(User._meta.get_field("global_role").choices):
            target.global_role = role
        if "is_active" in request.data:
            target.is_active = bool(request.data["is_active"])
        specialty = request.data.get("specialty")
        if specialty and specialty in Specialty.values:
            target.specialty = specialty
        seniority = request.data.get("seniority")
        if seniority and seniority in Seniority.values:
            target.seniority = seniority
        target.save(update_fields=["global_role", "is_active", "specialty", "seniority"])
        log(actor=request.user, verb="user.role_changed", target=target,
            summary="{} roli: {} -> {}".format(target.full_name, old,
                                               target.get_global_role_display()))
        return Response(UserAdminSerializer(target, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path="create",
            permission_classes=[IsPlatformAdmin])
    def create_account(self, request):
        """POST /api/users/create/ - admin panelidan hisob ochish.

        Nega `ViewSet.create` emas: `UserViewSet` ataylab `ReadOnly` -
        ro'yxat hamma uchun ochiq va uni yozishga ochib qo'yish xavfli
        bo'lardi. Bu esa alohida, ADMINGA cheklangan amal.
        """
        serializer = AdminCreateUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log(actor=request.user, verb="user.created", target=user,
            summary="Yangi hisob: {} ({})".format(user.full_name, user.email))
        return Response(UserAdminSerializer(user, context={"request": request}).data,
                        status=201)

    @action(detail=True, methods=["post"], url_path="set-password",
            permission_classes=[IsPlatformAdmin])
    def set_password(self, request, pk=None):
        """POST /api/users/:id/set-password/  {password}

        Odam parolini unutganda admin yangisini qo'yadi va og'zaki aytadi.
        Eski parolni SO'RAMAYDI - admin uni bilmaydi ham (parol xeshlangan).

        Bosh hisobga tegib bo'lmaydi: uning paroli faqat o'zi orqali
        almashadi, aks holda bitta admin butun platformani egallab olishi
        mumkin edi.
        """
        target = self.get_object()
        if target.is_superuser and target.pk != request.user.pk:
            raise ValidationError({"detail": "Bosh hisobning parolini almashtirib bo'lmaydi."})

        password = (request.data.get("password") or "").strip()
        if not password:
            raise ValidationError({"password": "Yangi parol yozing."})
        # Siyosat odamning o'zi almashtirgandagi bilan bir xil.
        #
        # `validate_password` DJANGO ning istisnosini uloqtiradi, DRF esa uni
        # tanimaydi va 400 o'rniga 500 chiqarardi. Seriyalizator ichida bu
        # o'zi o'giriladi, view ichida esa - qo'lda.
        try:
            validate_password(password, target)
        except DjangoValidationError as exc:
            raise ValidationError({"password": list(exc.messages)})

        target.set_password(password)
        target.save(update_fields=["password"])
        log(actor=request.user, verb="user.password_reset", target=target,
            summary="{} paroli admin tomonidan almashtirildi".format(target.full_name))
        return Response({"detail": "Parol almashtirildi."})
