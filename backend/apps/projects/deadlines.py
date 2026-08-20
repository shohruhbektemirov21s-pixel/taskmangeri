"""Loyiha muddati yaqinlashganda eslatma yuborish.

Muddat o'tib ketgandan keyin "kechikdingiz" deyish kech - odam allaqachon
kechikkan. Shuning uchun eslatma OLDIN keladi: tugashiga **1 hafta** va
**3 kun** qolganda. Ikki bosqich ataylab: birinchisi rejani qayta ko'rish
uchun, ikkinchisi "endi haqiqatan shoshiling" uchun.

KIMGA VA NIMA YOZILADI. Ilgari bitta xabar butun jamoaga borardi:
«Loyiha tugashiga 3 kun qoldi». Ijrochi uchun bu foydasiz edi - unda
o'zining nima qilishi kerakligi yozilmagan, ba'zan esa odamning o'sha
loyihada umuman ochiq ishi yo'q edi. Endi xabar ikki xil:

  * **Boshqaradiganlarga** (menejer va loyiha admini) - KIM NIMA qilishi
    kerakligi: ism-familiya va vazifa kodi bilan. Muddatga javob beradigan
    odam ro'yxatni bildirishnomaning o'zida ko'radi.
  * **Ijrochiga** - FAQAT O'ZINING tugallanmagan vazifalari. Boshqa
    odamning ishi ham, umumiy e'lon ham unga ko'rinmaydi.

Loyihada ochiq ishi yo'q a'zoga eslatma umuman ketmaydi: unga aytadigan
gap yo'q.

TEKSHIRUVDAGI ISH SANALMAYDI. `IN_REVIEW` - ijrochi ishini topshirgan,
navbat qabul qiladigan odamda. «Bajarishingiz kerak» deb eslatish uni
ikkinchi marta ishlashga undardi.

Takrorlanmasligini `ProjectDeadlineNotice` ta'minlaydi (bosqich + muddat
bo'yicha yagona yozuv), shuning uchun buyruqni kuniga bir necha marta
chaqirsa ham odam bitta xabar oladi.
"""
import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

# Necha kun qolganda eslatiladi. Kattadan kichikka - xabar matni shunga qarab.
STAGES = (7, 3)

# Bu holatdagi loyiha uchun muddat eslatmasi ma'nosiz.
CLOSED_STATUSES = ("DONE", "ARCHIVED", "CANCELLED")

# `Notification.body` - `CharField(400)`, Db2 da esa bu 400 BAYT. O'zbekcha
# matnda bitta belgi ikki-uch bayt bo'lishi mumkin (ismlardagi «ʻ», «…»),
# shuning uchun ro'yxat bayt bo'yicha o'lchanadi. Bir oz zaxira qoldiriladi.
BODY_LIMIT = 380

# Vazifa sarlavhasi xabarda qisqartiriladi - bittasi butun joyni egallamasin.
TITLE_LIMIT = 55


def _stage_label(days):
    return "1 hafta" if days == 7 else "{} kun".format(days)


def _blen(text):
    """Matnning BAYTDAGI uzunligi - Db2 ustunlari shu bilan o'lchanadi."""
    return len((text or "").encode("utf-8"))


def _short(text, limit=TITLE_LIMIT):
    text = (text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "..."


def _fit(head, items):
    """Ro'yxatni `BODY_LIMIT` ga sig'diradi.

    Sig'maganda oxiriga «va yana N ta» qo'shiladi - odam nimadir qolganini
    bilsin va ro'yxatni to'liq ko'rish uchun havolani bossin.
    """
    if not items:
        return head
    text = head
    for i, item in enumerate(items):
        piece = ("; " if i else " ") + item
        tail = " va yana {} ta".format(len(items) - i)
        # Dumaloq gap uchun joy HAR DOIM ajratiladi: oxirgi yozuv chegaraga
        # tegib qolsa, «va yana 1 ta» chegaradan chiqib ketardi va uni
        # `notify()` yarmidan kesardi.
        if _blen(text) + _blen(piece) > BODY_LIMIT - _blen(tail):
            return text + tail
        text += piece
    return text


def _managers(project):
    """Loyihaga javob beradiganlar: menejer va loyiha adminlari."""
    from apps.accounts.models import User

    from .models import ProjectRole

    ids = set(project.memberships.filter(
        is_active=True, role__in=[ProjectRole.MANAGER, ProjectRole.ADMIN]
    ).values_list("user_id", flat=True))
    if project.manager_id:
        ids.add(project.manager_id)
    return list(User.objects.filter(pk__in=ids, is_active=True))


def _open_work(project):
    """Loyihadagi tugallanmagan ishlar.

    `(qatorlar, odam_bo'yicha)` qaytaradi:
      * `qatorlar` - «Ism Familiya - KOD Sarlavha», boshqaradiganlar uchun;
      * `odam_bo'yicha` - `{user: ["KOD Sarlavha", ...]}`, ijrochilar uchun.

    Ijrochilar `prefetch_related` bilan olinadi: aks holda har vazifa uchun
    alohida so'rov ketardi.
    """
    from django.db.models import Prefetch

    from apps.tasks.models import Task, TaskAssignment, TaskStatus

    tasks = (Task.objects
             .filter(project=project)
             .exclude(status__in=(TaskStatus.DONE, TaskStatus.CANCELLED,
                                  TaskStatus.IN_REVIEW))
             # `task.code` loyihaning kalitini o'qiydi - busiz har vazifa
             # uchun alohida so'rov ketardi.
             .select_related("project")
             .prefetch_related(Prefetch(
                 "assignments",
                 queryset=TaskAssignment.objects.filter(is_active=True)
                 .select_related("user")))
             .order_by("number"))

    lines, by_user = [], {}
    for task in tasks:
        label = "{} {}".format(task.code, _short(task.title))
        for user in task.assignee_list:
            lines.append("{} - {}".format(user.full_name, label))
            by_user.setdefault(user, []).append(label)
    return lines, by_user


def send_due_reminders(today=None, dry_run=False):
    """Bugun eslatma kerak bo'lgan loyihalarni topib xabar yuboradi.

    `(yuborilgan_loyihalar, yuborilgan_xabarlar)` qaytaradi.
    """
    from datetime import timedelta

    from apps.notifications.models import NotificationKind
    from apps.notifications.services import notify

    from .models import Project, ProjectDeadlineNotice

    today = today or timezone.localdate()
    targets = {today + timedelta(days=d): d for d in STAGES}

    projects = (Project.objects
                .filter(deleted_at__isnull=True, due_date__in=list(targets))
                .exclude(status__in=CLOSED_STATUSES)
                .select_related("manager"))

    touched = messages = 0
    for project in projects:
        days = targets[project.due_date]
        try:
            # Belgini AVVAL qo'yamiz: shu qator yaratilsagina xabar ketadi,
            # ya'ni ikki jarayon bir vaqtda ishga tushsa ham xabar bitta.
            with transaction.atomic():
                if dry_run:
                    exists = ProjectDeadlineNotice.objects.filter(
                        project=project, days_left=days, due_date=project.due_date).exists()
                    if exists:
                        continue
                else:
                    ProjectDeadlineNotice.objects.create(
                        project=project, days_left=days, due_date=project.due_date)
        except IntegrityError:
            continue  # allaqachon yuborilgan

        touched += 1
        label = _stage_label(days)
        title = "{} tugashiga {} qoldi".format(project.name, label)
        due = "Muddat: {}.".format(project.due_date)

        lines, by_user = _open_work(project)
        bosses = _managers(project)
        boss_ids = {u.pk for u in bosses}

        # Boshqaradiganlarga - kim nima qilishi kerakligi bilan.
        boss_body = (_fit(due + " Kim nima qilishi kerak:", lines) if lines
                     else due + " Tugallanmagan vazifa yo'q.")
        # Ijrochilarga - faqat o'z ishlari. Boshqaradigan odam ro'yxatda
        # bo'lsa ham ikkinchi xabar olmaydi: unga to'liq ro'yxat ketgan.
        people = [(u, _fit(due + " Sizda tugallanmagan:", items))
                  for u, items in by_user.items() if u.pk not in boss_ids]

        meta = {"project": project.pk, "days_left": days, "due_date": str(project.due_date)}
        if dry_run:
            messages += len(bosses) + len(people)
        else:
            for boss in bosses:
                # «Vazifalar» - jamoaning yuklamasi: kim nima qilyapti.
                if notify(boss, NotificationKind.PROJECT_DEADLINE, title=title,
                          body=boss_body, url="/vazifalar", meta=meta):
                    messages += 1
            for user, body in people:
                # «Mening ishim» - odamning o'z vazifalari.
                if notify(user, NotificationKind.PROJECT_DEADLINE, title=title,
                          body=body, url="/mening-ishim", meta=meta):
                    messages += 1

        logger.info("Muddat eslatmasi: %s - %s qoldi (%s rahbar, %s ijrochi)",
                    project.name, label, len(bosses), len(people))

    return touched, messages
