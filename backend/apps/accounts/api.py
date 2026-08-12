from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from rest_framework import filters, generics, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.activity.services import log
from apps.core.permissions import IsPlatformAdmin
from apps.tasks.models import TaskStatus

from .specialties import Seniority, Specialty, specialty_catalog
from .serializers import (ChangePasswordSerializer, RegisterSerializer, TokenSerializer,
                          UserAdminSerializer, UserSerializer)

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
    """POST /api/auth/login/  -> {access, refresh, user}"""

    permission_classes = [AllowAny]
    serializer_class = TokenSerializer


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/"""

    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

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

    def get_object(self):
        return self.request.user


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
        qs = User.objects.annotate(
            project_count=Count("project_memberships",
                                filter=Q(project_memberships__is_active=True), distinct=True),
            open_tasks=Count("assignments", filter=Q(
                assignments__is_active=True,
                assignments__task__status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS,
                                               TaskStatus.IN_REVIEW],
            ), distinct=True),
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
