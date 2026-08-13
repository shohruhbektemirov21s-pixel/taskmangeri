from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, OuterRef, Q, Sum
from rest_framework import filters, generics, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.activity.services import log
from apps.core.permissions import IsPlatformAdmin
from apps.tasks.models import TaskStatus

from .specialties import Seniority, Specialty, specialty_catalog
from .serializers import (ChangePasswordSerializer, RegisterSerializer, TokenSerializer,
                          UserAdminSerializer, UserBriefSerializer, UserSerializer)

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
            "user": UserSerializer(user, context=self.get_serializer_context()).data,
        }, status=status.HTTP_201_CREATED)


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/auth/me/"""

    serializer_class = UserSerializer
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

    serializer_class = UserSerializer
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
        return Response(UserSerializer(user, context={"request": request}).data)

    def delete(self, request):
        user = request.user
        if user.avatar:
            user.avatar.delete(save=False)
            user.avatar = None
            user.save(update_fields=["avatar"])
        return Response(UserSerializer(user, context={"request": request}).data)


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
        return Response({"detail": "Parol yangilandi."})


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """Foydalanuvchilar ro'yxati. Rolni faqat admin o'zgartira oladi."""

    serializer_class = UserAdminSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["full_name", "email", "skills", "job_title"]
    ordering_fields = ["date_joined", "full_name"]
    ordering = ["-date_joined"]

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
        wide = bool(me.is_platform_admin or me.pk == target.pk)

        # So'rovchi ko'ra oladigan loyihalar doirasi
        def limit(qs, prefix=""):
            if wide:
                return qs
            f = lambda name: prefix + name  # noqa: E731
            from apps.projects.models import ProjectMember

            return qs.filter(
                Q(**{f("is_public"): True}) | Exists(ProjectMember.objects.filter(
                    project=OuterRef("pk"), user=me, is_active=True))
            )

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
        if not wide:
            tasks = tasks.filter(
                Q(project__is_public=True) | Exists(ProjectMember.objects.filter(
                    project=OuterRef("project_id"), user=me, is_active=True))
            )
        tasks = tasks.select_related("project")

        by_status = {row["status"]: row["c"]
                     for row in tasks.values("status").annotate(c=Count("id"))}
        hours = (WorkLog.objects.filter(user=target, task__in=tasks)
                 .aggregate(s=Sum("hours"))["s"] or 0)

        activity = Activity.objects.timeline().filter(actor=target)
        if not wide:
            activity = activity.filter(
                Q(project__is_public=True) | Exists(ProjectMember.objects.filter(
                    project=OuterRef("project_id"), user=me, is_active=True))
            )

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
            "tasks": TaskSerializer(
                tasks.exclude(status=TaskStatus.CANCELLED).order_by("-updated_at")[:20],
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
