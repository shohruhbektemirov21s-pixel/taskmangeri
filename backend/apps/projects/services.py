"""Loyiha biznes-mantiqi va o'qish ifodalari — view'dan tashqarida.

Ikki narsa turadi: odamni jamoaga qo'shish qoidasi va loyiha
kartochkasidagi sanoqlar (`project_counters`, `progress_expr`).

QO'SHISH ikki joydan chaqiriladi (`/api/projects/:id/members/add/` va
`/api/team/add/`), shuning uchun qoida bitta joyda turishi shart — aks
holda bir yo'l orqali qo'shilgan odamga menejer roli tegib, ikkinchisi
orqali tegmay qolishi mumkin edi.

SANOQLAR ilgari `api.py` da edi va ularni PANEL ham ishlatadi
(`apps/panel/api.py`). Ya'ni bir ilova ikkinchisining VIEW modulini
import qilardi: qatlam tartibi buzilmasa ham, `api.py` yon tomondan
kutubxonaga aylanib qolgandi. Endi ular shu yerda, `api.py` esa
o'zi ham shu yerdan oladi.

NEGA `panel/team.py` DAN KO'CHDI. U yerda turganda bog'liqlik teskari
edi: `apps.projects` o'zining a'zolik qoidasi uchun `apps.panel` ni
import qilardi, `panel` esa `projects` ni — ya'ni halqa. Endi yo'nalish
bitta: panel loyihalarni biladi, loyihalar panelni bilmaydi.
"""
from django.db import transaction
from django.db.models import DecimalField, Value
from django.db.models.functions import Cast, Coalesce, NullIf
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.activity.services import log
from apps.core.queries import related_count
from apps.tasks.models import Task, TaskStatus
from apps.workspaces.models import WorkspaceMember, WorkspaceRole

from .models import ProjectMember, ProjectRole
from .permissions import ProjectAccess


OPEN_STATUSES = [s for s in TaskStatus.values
                 if s not in (TaskStatus.DONE, TaskStatus.CANCELLED)]


def project_counters(user):
    """Loyiha kartochkasidagi raqamlar.

    `annotate(Count(...))` o'rniga ichki so'rov: tashqi so'rovga GROUP BY
    qo'shilmaydi, ya'ni Db2 dagi CLOB cheklovi (SQL0134N) chetlab o'tiladi.
    """
    return {
        "member_count": related_count(ProjectMember, group_by="project", is_active=True),
        "open_tasks": related_count(Task, group_by="project", status__in=OPEN_STATUSES),
        "done_tasks": related_count(Task, group_by="project", status=TaskStatus.DONE),
        # Bekor qilinganlardan tashqari hammasi - `progress()` shuni ishlatadi
        # va shu tufayli har loyiha uchun ikkita COUNT yubormaydi.
        "total_tasks": related_count(Task, group_by="project",
                                     status__in=[s for s in TaskStatus.values
                                                 if s != TaskStatus.CANCELLED]),
        "my_tasks": related_count(Task, group_by="project",
                                  assignments__user=user, assignments__is_active=True),
    }


def progress_expr():
    """Bajarilish foizi — SO'ROV ichida hisoblanadi, tartiblash uchun.

    `Project.progress()` shu sonni Python tomonda yasaydi va ekranga u
    chiqadi. Lekin ro'yxatni foiz bo'yicha TARTIBLASH uchun son bazada
    kerak: tartib butun ro'yxat bo'yicha bo'lishi shart, sahifaga tushgan
    yuztasi bo'yicha emas. Aks holda ikkinchi sahifada birinchisidan
    kattaroq foiz chiqib qolardi.

    Hisob `progress()` bilan bir xil manbadan: bekor qilinganlardan tashqari
    hamma vazifa maxrajda, bajarilgani suratda. Ikkovi ham `related_count`
    (ichki so'rov) - `annotate(Count(...))` tashqi so'rovga `GROUP BY`
    qo'shardi, Db2 esa unda CLOB ustunini (`description`) qo'llamaydi.

    VAZIFASI YO'Q LOYIHA. Maxraj nol bo'ladi va Db2 nolga bo'lishda
    `SQL0801N` bilan yiqiladi. `NullIf` nolni NULL ga aylantiradi (NULL ga
    bo'lish NULL beradi, xato emas), `Coalesce` esa uni nolga qaytaradi -
    ya'ni bunday loyiha 0% bo'lib ro'yxatning oxirida turadi.

    O'nlik son: butun sonda bo'linish Db2 da qoldiqni tashlaydi va 7/9 bilan
    7/10 bir xil «77%» bo'lib, tartib tasodifiy bo'lib qolardi.
    """
    pct = DecimalField(max_digits=12, decimal_places=4)
    done = related_count(Task, group_by="project", status=TaskStatus.DONE)
    total = related_count(Task, group_by="project",
                          status__in=[s for s in TaskStatus.values
                                      if s != TaskStatus.CANCELLED])
    return Coalesce(
        Cast(done, pct) * Value(100) / NullIf(total, Value(0)),
        Value(0), output_field=pct,
    )


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
