"""Loyiha biznes-mantiqi — view'dan tashqarida.

Hozircha bitta amal: odamni jamoaga qo'shish. U ikki joydan chaqiriladi
(`/api/projects/:id/members/add/` va `/api/team/add/`), shuning uchun
qoida bitta joyda turishi shart — aks holda bir yo'l orqali qo'shilgan
odamga menejer roli tegib, ikkinchisi orqali tegmay qolishi mumkin edi.

NEGA `panel/team.py` DAN KO'CHDI. U yerda turganda bog'liqlik teskari
edi: `apps.projects` o'zining a'zolik qoidasi uchun `apps.panel` ni
import qilardi, `panel` esa `projects` ni — ya'ni halqa. Endi yo'nalish
bitta: panel loyihalarni biladi, loyihalar panelni bilmaydi.
"""
from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.activity.services import log
from apps.workspaces.models import WorkspaceMember, WorkspaceRole

from .models import ProjectMember, ProjectRole
from .permissions import ProjectAccess


@transaction.atomic
def add_to_project(actor, project, target, role=None):
    """Odamni loyiha jamoasiga darrov qo'shadi va `ProjectMember` qaytaradi.

    Taklif yuborilmaydi va tasdiq kutilmaydi: menejer odamni tanlaydi va u
    ayni shu paytda a'zo bo'ladi. Foydalanuvchining o'zi so'rab qo'shilishi
    alohida yo'l (`projects.JoinRequest`) — u boshqa yo'nalish: odam
    so'raydi, menejer hal qiladi.
    """
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
