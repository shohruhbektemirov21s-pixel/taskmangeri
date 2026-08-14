"""Jamoaga a'zo qo'shish - to'g'ridan-to'g'ri, tasdiqsiz.

Ilgari bu ish `apps.invites` orqali borardi: menejer taklif yuborar, odam
qabul qilgach a'zo bo'lardi. Endi menejer odamni tanlaydi va u **darrov**
a'zo bo'ladi - kutish, tasdiqlash va "javob kutilmoqda" ro'yxati yo'q.

Bitta modul ham loyihaga, ham ish maydoniga xizmat qiladi: ikkovida ham
oqim bir xil (kim qo'sha oladi, kimni qo'shsa bo'ladi, qanday rol bilan),
faqat a'zolik jadvali boshqacha.

Foydalanuvchining o'zi so'rab qo'shilishi (`projects.JoinRequest`) o'z
joyida qoladi - u boshqa yo'nalish: odam so'raydi, menejer hal qiladi.
"""
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.serializers import UserBriefSerializer
from apps.activity.services import log

User = get_user_model()


class AddMemberThrottle(ScopedRateThrottle):
    """Eski `invite` cheklovi (40/soat) shu yerda saqlanadi."""

    scope = "invite"


def _resolve_scope(request):
    """`?project=<id>` yoki `?workspace=<slug>` dan nishonni topadi.

    (project, workspace) qaytaradi - biri to'ldirilgan, ikkinchisi None.
    """
    from apps.projects.models import Project
    from apps.workspaces.models import Workspace

    src = request.query_params if request.method == "GET" else request.data
    project_id = src.get("project")
    workspace_key = src.get("workspace")

    if project_id:
        return get_object_or_404(
            Project.objects.select_related("workspace"), pk=project_id), None
    if workspace_key:
        return None, get_object_or_404(Workspace, slug=workspace_key)
    raise ValidationError({"detail": "project yoki workspace korsating."})


def _require_manage(user, project, workspace):
    from apps.core.permissions import ProjectAccess

    allowed = (ProjectAccess(user, project).can_manage if project is not None
               else workspace.can_manage(user))
    if not allowed:
        raise PermissionDenied("Jamoaga a'zo qoshish huquqi yoq.")


@api_view(["GET"])
def candidates(request):
    """Qo'shish mumkin bo'lgan odamlar: hali a'zo bo'lmaganlar.

    `?project=<id>` yoki `?workspace=<slug>`; ixtiyoriy `?q=`, `?specialty=`.

    Uzun ochiluvchi ro'yxat emas, qidiruv: jamoa kattalashganda ro'yxat
    ishlamay qoladi, qidiruv esa ishlayveradi.
    """
    project, workspace = _resolve_scope(request)
    _require_manage(request.user, project, workspace)

    qs = User.objects.filter(is_active=True).exclude(pk=request.user.pk)
    if project is not None:
        qs = qs.exclude(project_memberships__project=project,
                        project_memberships__is_active=True)
    else:
        qs = qs.exclude(workspace_memberships__workspace=workspace)

    specialty = request.query_params.get("specialty")
    if specialty:
        qs = qs.filter(specialty=specialty)
    q = request.query_params.get("q")
    if q:
        qs = qs.filter(Q(full_name__icontains=q) | Q(email__icontains=q))

    return Response(UserBriefSerializer(qs.order_by("full_name")[:100], many=True).data)


@transaction.atomic
def add_to_project(actor, project, target, role=None):
    """Odamni loyiha jamoasiga darrov qo'shadi va `ProjectMember` qaytaradi.

    Yagona joy: `/api/team/add/` ham, `/api/projects/:id/members/add/` ham
    shu funksiyani chaqiradi - qoida ikki joyda ikki xil bo'lib ketmasin.
    """
    from apps.core.permissions import ProjectAccess
    from apps.projects.models import ProjectMember, ProjectRole
    from apps.workspaces.models import WorkspaceMember, WorkspaceRole

    role = role or ProjectRole.DEVELOPER
    if role not in ProjectRole.values:
        raise ValidationError({"role": "Notogri rol."})
    # Menejer rolini kim bera olishi - umumiy qoida, shu yerda ham amal qiladi.
    if not ProjectAccess(actor, project).can_grant_role(role):
        raise PermissionDenied("Menejer rolini faqat amaldagi menejer bera oladi.")
    if target.pk == actor.pk:
        raise ValidationError({"user_id": "Ozingizni qosha olmaysiz."})
    if project.memberships.filter(user=target, is_active=True).exists():
        raise ValidationError({"user_id": "Bu odam allaqachon jamoada."})

    member, _ = ProjectMember.objects.update_or_create(
        project=project, user=target,
        defaults={"role": role, "is_active": True, "left_at": None, "added_by": actor},
    )
    # Loyiha ish maydoni ichida - a'zo maydonni ham kora olsin.
    WorkspaceMember.objects.get_or_create(
        workspace=project.workspace, user=target,
        defaults={"role": WorkspaceRole.MEMBER},
    )
    log(actor=actor, verb="member.added", project=project, target=target,
        summary="{} jamoaga qoshildi: {}".format(target.full_name, project.name),
        detail="Rol: {} | Qoshdi: {}".format(member.get_role_display(), actor.full_name))
    return member


@api_view(["POST"])
@throttle_classes([AddMemberThrottle])
@transaction.atomic
def add_member(request):
    """Odamni jamoaga darrov qo'shadi.

    Tanasi: `{project|workspace, user_id, role}`.
    """
    from apps.workspaces.models import WorkspaceMember, WorkspaceRole

    project, workspace = _resolve_scope(request)
    _require_manage(request.user, project, workspace)

    target = get_object_or_404(User, pk=request.data.get("user_id"), is_active=True)
    if target.pk == request.user.pk:
        raise ValidationError({"user_id": "Ozingizni qosha olmaysiz."})

    if project is not None:
        member = add_to_project(request.user, project, target, request.data.get("role"))

        from apps.projects.serializers import ProjectMemberSerializer

        return Response(ProjectMemberSerializer(member, context={"request": request}).data,
                        status=201)

    role = request.data.get("role") or WorkspaceRole.MEMBER
    # Egalik qoshish orqali berilmaydi - u faqat maydon egasida.
    if role not in [r for r in WorkspaceRole.values if r != WorkspaceRole.OWNER]:
        raise ValidationError({"role": "Notogri rol."})
    if workspace.memberships.filter(user=target).exists():
        raise ValidationError({"user_id": "Bu odam allaqachon maydonda."})

    member = WorkspaceMember.objects.create(workspace=workspace, user=target, role=role)
    log(actor=request.user, verb="member.added", target=target,
        summary="{} ish maydoniga qoshildi: {}".format(target.full_name, workspace.name),
        detail="Rol: {} | Qoshdi: {}".format(member.get_role_display(),
                                             request.user.full_name))

    from apps.workspaces.serializers import WorkspaceMemberSerializer

    return Response(WorkspaceMemberSerializer(member, context={"request": request}).data,
                    status=201)
