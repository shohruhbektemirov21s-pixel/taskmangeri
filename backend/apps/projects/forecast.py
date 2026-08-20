"""Loyihaning muddat bashorati - kimda nima bor va qachonga belgilangan.

`ProjectViewSet` dan ajratildi (`calendar.py` dagi izohga qarang): u ham
sof o'qish hisoboti va klassni 130 qatorga uzaytirardi.

Marshrut o'zgarmadi: `GET /api/projects/<id>/forecast/`.
"""
from datetime import datetime

from django.utils import timezone
from rest_framework.response import Response

from apps.accounts.serializers import UserBriefSerializer
from apps.core.queries import object_or_404
from apps.projects.models import Project
from apps.projects.permissions import check_access
from apps.tasks.models import TaskAssignment, TaskStatus


def project_forecast(request, pk):
    """Muddatlar: kimda nima bor va qachonga belgilangan.

    Bu yerda TAXMIN yo'q. Avval "rejalashtirilgan soat" bo'lmagan vazifaga
    4 soat deb qo'yilardi va shu soatdan "taxminan tugaydi" sanasi
    chiqarilardi - ya'ni sahifada odam kiritmagan sanalar turardi. Endi
    faqat bazadagi haqiqiy ma'lumot ko'rsatiladi: kiritilgan boshlanish va
    tugash sanalari, ochiq/bajarilgan vazifalar soni va kechikkanlar.
    """

    project = object_or_404(Project, pk=pk)
    check_access(request.user, project, "view")

    today = timezone.localdate()

    def to_date(value):
        """Sana ham, sana+soat ham kelishi mumkin - mahalliy sanaga keltiramiz."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return timezone.localtime(value).date() if timezone.is_aware(value) else value.date()
        return value

    def wider(current, value, newest=True):
        """Oraliqni kengaytiradi: eng kech (yoki eng erta) sanani qaytaradi."""
        if value is None:
            return current
        if current is None:
            return value
        return max(current, value) if newest else min(current, value)

    closed = [TaskStatus.DONE, TaskStatus.CANCELLED]

    rows = (TaskAssignment.objects
            .filter(task__project=project, is_active=True)
            .select_related("task", "task__project", "user"))

    people = {}
    for row in rows:
        task, user = row.task, row.user
        item = people.setdefault(user.pk, {
            "user": user, "open": 0, "done": 0, "in_review": 0, "overdue": 0,
            "first_start": None, "last_due": None, "tasks": [],
        })
        if task.status == TaskStatus.DONE:
            item["done"] += 1
            continue
        if task.status == TaskStatus.CANCELLED:
            continue
        item["open"] += 1
        if task.status == TaskStatus.IN_REVIEW:
            item["in_review"] += 1
        task_due = to_date(task.due_date)
        if task_due and task_due < today:
            item["overdue"] += 1
        item["first_start"] = wider(item["first_start"], to_date(task.start_date),
                                    newest=False)
        item["last_due"] = wider(item["last_due"], task_due)
        # Odam qaysi ishni qachon tugatishi - yigindi sana emas, har bir
        # vazifa ozining sanasi bilan korinsin.
        item["tasks"].append({
            "id": task.pk,
            "code": task.code,
            "title": task.title,
            "status": task.status,
            "status_display": task.get_status_display(),
            "start_date": to_date(task.start_date),
            "due_date": task_due,
            "overdue": bool(task_due and task_due < today),
        })

    members = {m.user_id: m for m in project.memberships.filter(is_active=True)}

    member_rows = []
    for uid, item in people.items():
        user = item["user"]
        member_rows.append({
            "user": UserBriefSerializer(user, context={"request": request}).data,
            "role": members[uid].get_role_display() if uid in members else "",
            "open": item["open"], "done": item["done"],
            "in_review": item["in_review"], "overdue": item["overdue"],
            "first_start": item["first_start"],
            "last_due": item["last_due"],
            "late": item["overdue"] > 0,
            # Sanasi borlar oldinda, eng yaqin muddat tepada; sanasi
            # qoyilmaganlar oxirida turadi (ular reja emas, ochiq savol).
            "tasks": sorted(item["tasks"],
                            key=lambda t: (t["due_date"] is None, t["due_date"]
                                           or today, t["code"])),
        })
    member_rows.sort(key=lambda r: (-r["overdue"], -r["open"], r["user"]["full_name"]))

    # Vazifalarning haqiqiy oynasi: eng erta boshlanish - eng kech muddat.
    task_start = task_due = None
    overdue_total = 0
    # `t.code` loyiha kalitini so'raydi - `select_related` bo'lmasa har
    # vazifa uchun alohida so'rov ketardi.
    for t in project.tasks.select_related("project"):
        d_due = to_date(t.due_date)
        if t.status not in closed:
            if d_due and d_due < today:
                overdue_total += 1
            task_start = wider(task_start, to_date(t.start_date), newest=False)
            task_due = wider(task_due, d_due)

    project_due = to_date(project.due_date)
    return Response({
        "today": today,
        "members": member_rows,
        "project": {
            "open": project.tasks.exclude(status__in=closed).count(),
            "done": project.tasks.filter(status=TaskStatus.DONE).count(),
            "unassigned": project.tasks.exclude(status__in=closed)
                                 .exclude(assignments__is_active=True).count(),
            "overdue": overdue_total,
            # Kiritilgan sanalar - o'zgartirilmasdan, borig'icha.
            "start_date": project.start_date,
            "due_date": project.due_date,
            "task_start": task_start,
            "task_due": task_due,
            # Vazifalar loyiha muddatidan oshib ketganmi - haqiqiy taqqoslash.
            "at_risk": bool(task_due and project_due and task_due > project_due),
        },
    })
