"""Oylik taqvim - qaysi kunda nimaning muddati tugaydi.

NEGA ALOHIDA FAYL. Bu `ProjectViewSet` ichida `@action` bo'lib turardi va
o'sha klassni 180 qatorga uzaytirardi. Aslida u loyihaning CRUD iga
tegishli emas: bu butun tizim bo'yicha O'QILADIGAN hisobot - loyihalar
ham, vazifalar ham, hech qanday yozish yo'q.

Marshrut O'ZGARMADI: `GET /api/projects/calendar/`. Klassdagi `@action`
o'z joyida qoldi va shu funksiyani chaqiradi - ya'ni frontend ham,
testlar ham tegilmadi.
"""
from calendar import monthrange
from datetime import date, datetime, time as dtime, timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.projects.models import Project
from apps.projects.permissions import (task_scope_q, tasks_limited_for,
                                       visible_projects_q)
from apps.projects.services import project_counters
from apps.tasks.models import Task, TaskStatus


def month_calendar(request):
    """Oylik taqvim: shu oyning qaysi kunida NIMANING MUDDATI tugaydi.

    `?month=YYYY-MM` (bo'sh bo'lsa - joriy oy).

    Taqvimda faqat TUGASH sanalari turadi - loyiha ham, vazifa ham o'z
    muddati kuniga qo'yiladi. Ilgari har biri boshlanishdan muddatgacha
    tasma bo'lib cho'zilardi: oy tasmalar bilan to'lib ketar, "shu kuni
    nima topshirilishi kerak" degan savolga esa javob topib bo'lmasdi.

    Muddati qo'yilmagan loyiha va vazifa taqvimda umuman turmaydi -
    uni qo'yadigan kun yo'q.
    """

    from apps.accounts.serializers import UserBriefSerializer

    raw = (request.query_params.get("month") or "").strip()
    today = timezone.localdate()
    try:
        year, month = (int(x) for x in raw.split("-")[:2]) if raw else (today.year, today.month)
        first = date(year, month, 1)
    except (ValueError, TypeError):
        raise ValidationError({"month": "Format: YYYY-MM"})

    last = date(first.year, first.month, monthrange(first.year, first.month)[1])

    user = request.user
    # Ko'rish doirasi tarix sahifasidagi bilan bir xil: admin hammasini,
    # qolganlar a'zo bo'lgan va ochiq loyihalarni ko'radi. Bu ro'yxat
    # VAZIFALAR uchun ham kerak: loyihaning o'zi shu oyda tugamasa ham,
    # ichidagi ishning muddati shu oyga tushishi mumkin.
    # Shart BIR MANBADAN (`visible_projects_q`): hamma loyihani
    # ko'radiganlar uchun u bo'sh `Q()` qaytaradi, ya'ni rolni bu yerda
    # ikkinchi marta sanash shart emas.
    seen = Project.objects.filter(deleted_at__isnull=True).filter(
        visible_projects_q(user))
    visible_ids = list(seen.values_list("pk", flat=True))

    # `progress()` uchun sanoqlar oldindan olinadi - aks holda taqvimdagi
    # har loyiha ikkita qo'shimcha so'rov yuborardi. Faqat MUDDATI shu
    # oyga tushadiganlar olinadi: taqvim - tugash sanalari taqvimi.
    qs = (Project.objects.filter(pk__in=visible_ids,
                                 due_date__gte=first, due_date__lte=last)
          .select_related("manager")
          .annotate(**project_counters(user)))

    rows, counts = [], {}
    for project in qs:
        begin = project.start_date or timezone.localtime(project.created_at).date()
        finish = project.due_date

        # Sanoq - o'sha kuni nechta loyiha muddati tugashi.
        counts[finish] = counts.get(finish, 0) + 1

        rows.append({
            "id": project.pk,
            "name": project.name,
            "key": project.key,
            "color": project.color,
            "status": project.status,
            "status_display": project.get_status_display(),
            "is_public": project.is_public,
            "manager_name": project.manager.full_name if project.manager else "",
            "progress": project.progress(),
            # Loyiha taqvimda BITTA kunda turadi - o'z muddati kunida.
            # `start_date` faqat ma'lumot uchun qoladi (kun kartasida
            # "qachondan beri" ko'rinib tursin).
            "start_date": begin,
            "due_date": finish,
            "from": finish,
            "to": finish,
            "starts_here": True,
            "ends_here": True,
            "open_ended": False,
            "overdue": bool(finish < today
                            and project.status not in ("DONE", "ARCHIVED")),
            # Boshlanish sanasi kiritilmagan bo'lsa buni yashirmaymiz.
            "start_assumed": project.start_date is None,
        })

    rows.sort(key=lambda r: (r["from"], r["name"]))

    # ---- Vazifalar: kimga qanday ish berilgani ham shu taqvimda ko'rinsin.
    # Bu yerda ham faqat MUDDAT: vazifa o'z tugash sanasi kunida turadi.
    # Muddati yo'q vazifa ham, bekor qilingani ham chiqmaydi.
    def as_date(value):
        if value is None:
            return None
        return timezone.localtime(value).date() if timezone.is_aware(value) else value.date()

    # Muddat - sana+soat. Oy chegarasi mahalliy vaqtdagi aniq lahzalarga
    # aylantiriladi: `__date` bilan solishtirilsa Db2 mintaqani hisobga
    # olmaydi va tungi ishlar qo'shni kunga tushib qolardi.
    span_start = timezone.make_aware(datetime.combine(first, dtime.min))
    span_end = timezone.make_aware(datetime.combine(last, dtime.min)) + timedelta(days=1)

    # Kimga qaysi vazifa ko'rinishi - doska va vazifalar ro'yxati bilan
    # BIR XIL qoidadan (`task_scope_q`): menejerga boshqaruvidagi
    # loyihaning hammasi, qolganga o'ziniki. Taqvim boshqacha hisoblasa
    # odam «doskada bor edi, taqvimda yo'q» degan savolda qolardi.
    tasks_limited = tasks_limited_for(user)

    # Kun katagining o'ng burchagidagi uchta raqam: NAZORATDA /
    # JARAYONDA / BAJARILDI. Uchtaga bo'linish ataylab qo'pol: oraliq
    # holatlar («Tekshiruvda», «Tuzatish kerak», «To'xtab qolgan») ham
    # jarayonga qo'shiladi, aks holda raqamlar yig'indisi o'sha kungi
    # vazifalar soniga teng bo'lmasdi va odam "qolgani qayerda?" deb
    # qolardi.
    by_day = {}

    task_rows = []
    tasks = (Task.objects
             .filter(task_scope_q(user), project_id__in=visible_ids,
                     due_date__gte=span_start, due_date__lt=span_end)
             .exclude(status=TaskStatus.CANCELLED)
             .select_related("project")
             .prefetch_related("assignments__user"))
    for task in tasks:
        finish = as_date(task.due_date)

        slot = by_day.setdefault(finish, {"todo": 0, "in_progress": 0, "done": 0})
        if task.status == TaskStatus.DONE:
            slot["done"] += 1
        elif task.status == TaskStatus.TODO:
            slot["todo"] += 1
        else:
            slot["in_progress"] += 1

        people = [a.user for a in task.assignments.all() if a.is_active and a.user]
        task_rows.append({
            "id": task.pk,
            "code": task.code,
            "title": task.title,
            "status": task.status,
            "status_display": task.get_status_display(),
            "priority": task.priority,
            "project": {"id": task.project_id, "name": task.project.name,
                        "key": task.project.key, "color": task.project.color},
            "assignees": UserBriefSerializer(people, many=True,
                                             context={"request": request}).data,
            "start_date": as_date(task.start_date),
            "due_date": finish,
            "from": finish,
            "to": finish,
            "starts_here": True,
            "ends_here": True,
            "done": task.status == TaskStatus.DONE,
            "overdue": bool(finish < today and task.status != TaskStatus.DONE),
        })
    task_rows.sort(key=lambda r: (r["from"], r["code"]))

    # `count` - o'sha kuni nechta loyiha MUDDATI tugashi; qolgan uchtasi
    # - o'sha kungi vazifalar holat bo'yicha.
    def day_row(d):
        slot = by_day.get(d) or {"todo": 0, "in_progress": 0, "done": 0}
        return {"date": d, "count": counts.get(d, 0), **slot}

    days = [day_row(first + timedelta(days=i))
            for i in range((last - first).days + 1)]

    return Response({
        "month": first.strftime("%Y-%m"),
        "first_day": first,
        "last_day": last,
        "today": today,
        "projects": rows,
        "tasks": task_rows,
        "days": days,
        "total": len(rows),
        "task_total": len(task_rows),
        # Ro'yxat qirqilganmi - taqvim buni yozib qo'ysin, aks holda
        # dasturchi "nega jamoaning ishi ko'rinmayapti" deb o'ylaydi.
        "tasks_limited": tasks_limited,
    })
