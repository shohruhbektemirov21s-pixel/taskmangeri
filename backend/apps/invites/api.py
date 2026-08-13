from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.activity.services import log
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify

from .models import Invitation, InviteStatus
from .serializers import InvitationSerializer

User = get_user_model()


def can_manage(user, *, workspace=None, project=None):
    if project is not None:
        from apps.core.permissions import ProjectAccess

        return ProjectAccess(user, project).can_manage
    if workspace is not None:
        return workspace.can_manage(user)
    return False


def valid_roles(*, workspace=None, project=None):
    if project is not None:
        from apps.projects.models import ProjectRole

        return list(ProjectRole.values)
    from apps.workspaces.models import WorkspaceRole

    # Egalik taklif orqali berilmaydi.
    return [r for r in WorkspaceRole.values if r != WorkspaceRole.OWNER]


def already_member(user, *, workspace=None, project=None):
    if project is not None:
        return project.memberships.filter(user=user, is_active=True).exists()
    if workspace is not None:
        return workspace.memberships.filter(user=user).exists()
    return False


class InvitationViewSet(mixins.ListModelMixin,
                        mixins.RetrieveModelMixin,
                        mixins.CreateModelMixin,
                        viewsets.GenericViewSet):
    """Jamoaga taklif qilish va taklifga javob berish.

    Oqim: menejer taklif yuboradi -> taklif qilingan odamga bildirishnoma
    boradi -> u qabul qilsa a'zo bo'ladi. Tasdiqsiz hech kim qo'shilmaydi.
    """

    serializer_class = InvitationSerializer
    throttle_scope = "invite"

    def get_throttles(self):
        # O'qish erkin, yozish (taklif yuborish) cheklangan.
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            self.throttle_scope = "search"
        else:
            self.throttle_scope = "invite"
        return super().get_throttles()

    def get_queryset(self):
        user = self.request.user
        qs = Invitation.objects.select_related(
            "user", "invited_by", "workspace", "project")

        # Bitta taklif ustidagi amallar (javob berish, bekor qilish) uchun
        # ham qabul qiluvchi, ham yuboruvchi ko'ra olishi kerak - aks holda
        # yuborgan odam o'z taklifini bekor qila olmay 404 oladi.
        if self.action in ("retrieve", "respond", "cancel"):
            return qs.filter(Q(user=user) | Q(invited_by=user))

        box = self.request.query_params.get("box", "incoming")
        if box == "sent":
            qs = qs.filter(invited_by=user)
        elif box == "all":
            qs = qs.filter(Q(user=user) | Q(invited_by=user))
        else:
            qs = qs.filter(user=user)

        if self.request.query_params.get("pending") in ("1", "true"):
            qs = qs.filter(status=InviteStatus.PENDING)

        project = self.request.query_params.get("project")
        if project:
            qs = qs.filter(project_id=project)
        workspace = self.request.query_params.get("workspace")
        if workspace:
            qs = qs.filter(workspace__slug=workspace)

        return qs.order_by("-created_at")

    # ------------------------------------------------------------ yaratish
    def perform_create(self, serializer):
        actor = self.request.user
        workspace = serializer.validated_data.get("workspace")
        project = serializer.validated_data.get("project")
        role = serializer.validated_data.get("role") or ""

        if not can_manage(actor, workspace=workspace, project=project):
            raise PermissionDenied("Taklif yuborish huquqi yo'q.")

        target_user = User.objects.filter(
            pk=serializer.validated_data.get("user_id"), is_active=True).first()
        if not target_user:
            raise ValidationError({"user_id": "Foydalanuvchi topilmadi."})
        if target_user.pk == actor.pk:
            raise ValidationError({"user_id": "O'zingizni taklif qila olmaysiz."})

        roles = valid_roles(workspace=workspace, project=project)
        if role not in roles:
            raise ValidationError({"role": "Noto'g'ri rol. Mumkin: " + ", ".join(roles)})

        if already_member(target_user, workspace=workspace, project=project):
            raise ValidationError({"user_id": "Bu odam allaqachon jamoada."})

        pending = Invitation.objects.filter(
            user=target_user, status=InviteStatus.PENDING,
            workspace=workspace, project=project).first()
        if pending:
            raise ValidationError({"user_id": "Bu odamga taklif allaqachon yuborilgan."})

        invite = serializer.save(invited_by=actor, user=target_user,
                                 status=InviteStatus.PENDING)

        log(actor=actor, verb="member.invited",
            workspace=workspace or (project.workspace if project else None),
            project=project, target=target_user,
            summary="{} jamoaga taklif qilindi: {}".format(
                target_user.full_name, invite.target_name),
            detail=invite.message)

        notify(target_user, NotificationKind.INVITE_RECEIVED,
               title="Sizni jamoaga taklif qilishdi",
               body="{} — {} ({})".format(invite.target_name, invite.role_display,
                                          actor.full_name),
               url="/takliflar", actor=actor,
               meta={"invitation": invite.pk, "scope": invite.scope})

    # ------------------------------------------------------------- javob
    @action(detail=True, methods=["post"])
    def respond(self, request, pk=None):
        """POST /api/invitations/:id/respond/  {action: accept|decline}"""
        invite = self.get_object()
        if invite.user_id != request.user.pk:
            raise PermissionDenied("Bu taklif sizga emas.")
        if not invite.is_pending:
            raise ValidationError({"detail": "Bu taklifga allaqachon javob berilgan."})

        what = (request.data.get("action") or "").lower()
        if what not in ("accept", "decline"):
            raise ValidationError({"action": "accept yoki decline bo'lishi kerak."})

        if what == "accept":
            invite.accept()
            log(actor=request.user, verb="member.added",
                workspace=invite.workspace or (invite.project.workspace if invite.project else None),
                project=invite.project, target=request.user,
                summary="{} taklifni qabul qildi va jamoaga qo'shildi".format(
                    request.user.full_name))
            notify(invite.invited_by, NotificationKind.INVITE_ACCEPTED,
                   title="Taklif qabul qilindi",
                   body="{} — {} jamoasiga qo'shildi".format(
                       request.user.full_name, invite.target_name),
                   url=invite.url, actor=request.user)
        else:
            invite.decline()
            log(actor=request.user, verb="member.rejected",
                workspace=invite.workspace or (invite.project.workspace if invite.project else None),
                project=invite.project, target=request.user,
                summary="{} taklifni rad etdi".format(request.user.full_name))
            notify(invite.invited_by, NotificationKind.INVITE_DECLINED,
                   title="Taklif rad etildi",
                   body="{} — {} taklifini rad etdi".format(
                       request.user.full_name, invite.target_name),
                   url=invite.url, actor=request.user)

        return Response(self.get_serializer(invite).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Taklifni yuborgan odam (yoki menejer) bekor qiladi."""
        invite = self.get_object()
        allowed = (invite.invited_by_id == request.user.pk
                   or can_manage(request.user, workspace=invite.workspace,
                                 project=invite.project))
        if not allowed:
            raise PermissionDenied("Bekor qilish huquqi yo'q.")
        if not invite.is_pending:
            raise ValidationError({"detail": "Faqat javob kutayotgan taklifni bekor qilish mumkin."})

        invite.cancel()
        return Response(self.get_serializer(invite).data)

    @action(detail=False, methods=["get"], url_path="candidates")
    def candidates(self, request):
        """Taklif qilish mumkin bo'lgan odamlar: a'zo emas va taklif kutmayapti.

        `?project=<id>` yoki `?workspace=<slug>`; ixtiyoriy `?specialty=`, `?q=`.
        """
        from apps.projects.models import Project
        from apps.workspaces.models import Workspace

        project = workspace = None
        if request.query_params.get("project"):
            project = Project.objects.filter(pk=request.query_params["project"]).first()
        elif request.query_params.get("workspace"):
            workspace = Workspace.objects.filter(slug=request.query_params["workspace"]).first()
        if not (project or workspace):
            raise ValidationError({"detail": "project yoki workspace ko'rsating."})
        if not can_manage(request.user, workspace=workspace, project=project):
            raise PermissionDenied("Ruxsat yo'q.")

        qs = User.objects.filter(is_active=True).exclude(pk=request.user.pk)

        if project is not None:
            qs = qs.exclude(project_memberships__project=project,
                            project_memberships__is_active=True)
        else:
            qs = qs.exclude(workspace_memberships__workspace=workspace)

        qs = qs.exclude(invitations__status=InviteStatus.PENDING,
                        invitations__project=project,
                        invitations__workspace=workspace)

        specialty = request.query_params.get("specialty")
        if specialty:
            qs = qs.filter(specialty=specialty)
        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(full_name__icontains=q) | Q(email__icontains=q))

        from apps.accounts.serializers import UserBriefSerializer

        data = UserBriefSerializer(qs.order_by("full_name")[:100], many=True).data
        return Response(data)
