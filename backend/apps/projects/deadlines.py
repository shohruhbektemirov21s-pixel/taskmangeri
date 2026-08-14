"""Loyiha muddati yaqinlashganda eslatma yuborish.

Muddat o'tib ketgandan keyin "kechikdingiz" deyish kech - odam allaqachon
kechikkan. Shuning uchun eslatma OLDIN keladi: tugashiga **1 hafta** va
**3 kun** qolganda. Ikki bosqich ataylab: birinchisi rejani qayta ko'rish
uchun, ikkinchisi "endi haqiqatan shoshiling" uchun.

Eslatma loyihada ishlayotgan hammaga boradi - menejerga ham, jamoaga ham:
muddatni faqat menejer bilib turishi ishni tezlashtirmaydi.

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


def _stage_label(days):
    return "1 hafta" if days == 7 else "{} kun".format(days)


def _recipients(project):
    """Menejer va faol a'zolar (takrorlanmasdan)."""
    from apps.accounts.models import User

    ids = set(project.memberships.filter(is_active=True).values_list("user_id", flat=True))
    if project.manager_id:
        ids.add(project.manager_id)
    return list(User.objects.filter(pk__in=ids, is_active=True))


def send_due_reminders(today=None, dry_run=False):
    """Bugun eslatma kerak bo'lgan loyihalarni topib xabar yuboradi.

    `(yuborilgan_loyihalar, yuborilgan_xabarlar)` qaytaradi.
    """
    from datetime import timedelta

    from apps.notifications.models import NotificationKind
    from apps.notifications.services import notify_many

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

        people = _recipients(project)
        if not people:
            touched += 1
            continue

        label = _stage_label(days)
        if not dry_run:
            messages += len(notify_many(
                people, NotificationKind.PROJECT_DEADLINE,
                title="{} tugashiga {} qoldi".format(project.name, label),
                body="Muddat: {}".format(project.due_date),
                url="/loyiha/{}".format(project.pk),
                meta={"project": project.pk, "days_left": days,
                      "due_date": str(project.due_date)},
            ))
        else:
            messages += len(people)
        touched += 1
        logger.info("Muddat eslatmasi: %s - %s qoldi (%s kishi)",
                    project.name, label, len(people))

    return touched, messages
