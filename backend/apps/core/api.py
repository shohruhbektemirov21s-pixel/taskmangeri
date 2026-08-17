import logging

from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.activity.models import Activity
from apps.activity.serializers import ActivitySerializer
from apps.projects.models import (JoinRequest, Project, ProjectMember, ProjectRole,
                                  RequestStatus)
from apps.core.queries import int_param
from apps.projects.api import project_counters
from apps.projects.serializers import JoinRequestSerializer, ProjectSerializer
from apps.tasks.models import Task, TaskAssignment, TaskStatus
from apps.tasks.serializers import TaskSerializer

logger = logging.getLogger(__name__)


def _tick_deadline_reminders():
    """Muddat eslatmalarini kuniga bir marta ishga tushiradi.

    Loyihada rejalashtiruvchi (Celery beat, cron) yo'q, qo'shish esa butun
    bir xizmat qo'shish demakdir. Buning o'rniga tekshiruv panel ochilganda
    bo'ladi, lekin kuniga BIR MARTA: qulf Redis keshida turadi, ya'ni bir
    nechta backend jarayoni bo'lsa ham eslatma takrorlanmaydi.

    Ikki qavatli himoya: bu yerdagi kalit ortiqcha ishni to'xtatadi,
    `ProjectDeadlineNotice` esa xabarning o'zi takrorlanmasligini kafolatlaydi.
    Panel sekinlashmasin uchun xato bo'lsa jim o'tib ketamiz.
    """
    from django.core.cache import cache

    from apps.projects.deadlines import send_due_reminders

    key = "deadline-reminders:{}".format(timezone.localdate())
    try:
        # `add` - kalit yo'q bo'lsagina qo'yadi, ya'ni kunning birinchi so'rovi.
        if not cache.add(key, 1, 60 * 60 * 26):
            return
        send_due_reminders()
    except Exception:
        logger.exception("Muddat eslatmalarini yuborib bo'lmadi")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    """Fokus paneli: har bir rol faqat o'zining ishini ko'radi."""
    user = request.user
    now = timezone.now()
    ctx = {"request": request}

    _tick_deadline_reminders()

    # `Exists()` - `.distinct()` o'rniga. Db2 DISTINCT da CLOB ustunini
    # qo'llamaydi (`description` kabi matn maydonlari), shuning uchun takrorni
    # tozalash emas, umuman paydo qilmaslik to'g'riroq.
    mine = Exists(TaskAssignment.objects.filter(
        task=OuterRef("pk"), user=user, is_active=True))

    # O'chirilgan loyihaning vazifalari panelga ham chiqmaydi.
    my_tasks = (Task.objects.filter(mine, project__deleted_at__isnull=True)
                .select_related("project", "created_by")
                .prefetch_related("assignments__user"))

    focus_queue = my_tasks.filter(
        status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS]
    ).order_by("-priority", "due_date", "id")

    next_task = focus_queue.first()
    returned = my_tasks.filter(status=TaskStatus.CHANGES_REQUESTED)
    blocked = my_tasks.filter(status=TaskStatus.BLOCKED)
    waiting_review = my_tasks.filter(status=TaskStatus.IN_REVIEW)
    overdue = focus_queue.filter(due_date__lt=now)

    member_of = Exists(ProjectMember.objects.filter(
        project=OuterRef("pk"), user=user, is_active=True))

    # `specialties` va `memberships` seriyalizatorda har loyiha uchun
    # o'qiladi - oldindan yuklanmasa har biri alohida so'rov bo'lardi.
    my_projects = (Project.objects.filter(member_of)
                   .select_related("workspace", "manager", "created_by")
                   .prefetch_related("specialties", "memberships__user")
                   .annotate(**project_counters(user))
                   .order_by("-updated_at"))

    if user.is_platform_admin:
        managed = Project.objects.select_related("manager").order_by("-updated_at")
        review_qs = Task.objects.filter(status=TaskStatus.IN_REVIEW,
                                        project__deleted_at__isnull=True)
        join_qs = JoinRequest.objects.filter(status=RequestStatus.PENDING,
                                             project__deleted_at__isnull=True)
        feed = Activity.objects.timeline()[:20]
    else:
        managed = Project.objects.filter(
            Q(manager=user) | Exists(ProjectMember.objects.filter(
                project=OuterRef("pk"), user=user, is_active=True,
                role=ProjectRole.MANAGER)))
        review_qs = Task.objects.filter(status=TaskStatus.IN_REVIEW, project__in=managed)
        join_qs = JoinRequest.objects.filter(status=RequestStatus.PENDING, project__in=managed)
        feed = (Activity.objects.filter(
            Q(actor=user) | Exists(ProjectMember.objects.filter(
                project=OuterRef("project_id"), user=user, is_active=True)))
            .select_related("actor", "project", "task")
            .order_by("-created_at")[:20])

    # Sanoq KESISHDAN OLDIN olinadi. Ilgari `[:10]` dan keyin `.count()`
    # chaqirilardi va Django limitni hisobga olib doim 10 dan oshmagan son
    # qaytarardi: bazada 12 ta tekshiruv bo'lsa ham panelda "10" turardi.
    review_total = review_qs.count()
    join_total = join_qs.count()
    review_qs = (review_qs.select_related("project")
                 .prefetch_related("assignments__user").order_by("submitted_at")[:10])
    join_qs = join_qs.select_related("user", "project").order_by("created_at")[:10]

    # `managed` yuqorida ichki so'rov sifatida ham ishlatiladi (`project__in`),
    # shuning uchun uni o'zgartirmaymiz - ko'rsatiladigan sahifa alohida
    # olinadi va faqat unga prefetch bilan annotatsiya qo'shiladi.
    managed_page = (managed
                    .select_related("workspace", "manager", "created_by")
                    .prefetch_related("specialties", "memberships__user")
                    .annotate(**project_counters(user))
                    .order_by("-updated_at")[:8])

    return Response({
        "stats": {
            "open": focus_queue.count(),
            "review": waiting_review.count(),
            "returned": returned.count(),
            "overdue": overdue.count(),
            "done_week": my_tasks.filter(
                status=TaskStatus.DONE,
                completed_at__gte=now - timezone.timedelta(days=7)).count(),
            "pending_reviews": review_total,
            "pending_joins": join_total,
        },
        "next_task": TaskSerializer(next_task, context=ctx).data if next_task else None,
        "focus_queue": TaskSerializer(focus_queue[:8], many=True, context=ctx).data,
        "returned": TaskSerializer(returned, many=True, context=ctx).data,
        "blocked": TaskSerializer(blocked, many=True, context=ctx).data,
        "waiting_review": TaskSerializer(waiting_review, many=True, context=ctx).data,
        "my_projects": ProjectSerializer(my_projects, many=True, context=ctx).data,
        "managed_projects": ProjectSerializer(managed_page, many=True, context=ctx).data,
        "review_queue": TaskSerializer(review_qs, many=True, context=ctx).data,
        "join_queue": JoinRequestSerializer(join_qs, many=True, context=ctx).data,
        "feed": ActivitySerializer(feed, many=True, context=ctx).data,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sidebar_counts(request):
    """Yon paneldagi uchta raqam - boshqa hech narsa.

    Ilgari buning uchun `/dashboard/` chaqirilardi: u o'nlab vazifa, loyiha va
    tasmani seriyalizatsiya qiladi, ustiga muddat eslatmalarini ham tekshiradi.
    Yon panelga esa faqat uchta son kerak edi va u har sahifa almashganda
    so'ralardi - ya'ni har navigatsiyada butun panel bekorga yig'ilardi.

    Bu yerda faqat `COUNT` bor. Ruxsat qoidasi `dashboard` dagi bilan bir xil:
    tekshiruv va qo'shilish navbati odam boshqaradigan loyihalar bo'yicha,
    admin uchun esa hammasi.
    """
    user = request.user

    mine = Exists(TaskAssignment.objects.filter(
        task=OuterRef("pk"), user=user, is_active=True))
    open_count = Task.objects.filter(
        mine, project__deleted_at__isnull=True,
        status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS]).count()

    if user.is_platform_admin:
        review_qs = Task.objects.filter(status=TaskStatus.IN_REVIEW,
                                        project__deleted_at__isnull=True)
        join_qs = JoinRequest.objects.filter(status=RequestStatus.PENDING,
                                             project__deleted_at__isnull=True)
    else:
        managed = Project.objects.filter(
            Q(manager=user) | Exists(ProjectMember.objects.filter(
                project=OuterRef("pk"), user=user, is_active=True,
                role=ProjectRole.MANAGER)))
        review_qs = Task.objects.filter(status=TaskStatus.IN_REVIEW, project__in=managed)
        join_qs = JoinRequest.objects.filter(status=RequestStatus.PENDING,
                                             project__in=managed)

    return Response({
        "open": open_count,
        "reviews": review_qs.count(),
        "joins": join_qs.count(),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_work(request):
    """Menga biriktirilgan barcha vazifalar - status bo'yicha guruhlangan."""
    user = request.user
    ctx = {"request": request}
    qs = (Task.objects.for_display().filter(Exists(TaskAssignment.objects.filter(
              task=OuterRef("pk"), user=user, is_active=True)),
              project__deleted_at__isnull=True))

    project_id = request.query_params.get("project")
    if project_id:
        # Yaroqsiz qiymat 500 emas, 400 (sababi `int_param` da).
        qs = qs.filter(project_id=int_param(project_id, "project"))

    groups = []
    for status in [TaskStatus.CHANGES_REQUESTED, TaskStatus.BLOCKED, TaskStatus.IN_PROGRESS,
                   TaskStatus.TODO, TaskStatus.IN_REVIEW, TaskStatus.DONE]:
        items = qs.filter(status=status).order_by("-priority", "due_date")[:100]
        if items:
            groups.append({
                "status": status,
                "label": TaskStatus(status).label,
                "count": len(items),
                "tasks": TaskSerializer(items, many=True, context=ctx).data,
            })

    projects = (Project.objects.filter(Exists(ProjectMember.objects.filter(
                    project=OuterRef("pk"), user=user, is_active=True)))
                .order_by("name"))
    return Response({
        "groups": groups,
        "projects": [{"id": p.id, "name": p.name, "key": p.key, "color": p.color}
                     for p in projects],
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def meta(request):
    """Frontend uchun barcha ro'yxatlar (status, prioritet, rol) - bir joydan."""
    from apps.accounts.models import GlobalRole
    from apps.activity.models import category_choices
    from apps.accounts.specialties import Seniority, specialty_catalog
    from apps.projects.models import ProjectStatus
    from apps.workspaces.models import WorkspaceRole
    from apps.tasks.models import BOARD_COLUMNS, TaskPriority, TaskType
    from apps.tasks.models import ReviewVerdict

    def pack(choices):
        return [{"value": v, "label": l} for v, l in choices]

    return Response({
        "task_status": pack(TaskStatus.choices),
        "board_columns": [{"value": s, "label": TaskStatus(s).label} for s in BOARD_COLUMNS],
        "task_priority": pack(TaskPriority.choices),
        "task_type": pack(TaskType.choices),
        "review_verdict": pack(ReviewVerdict.choices),
        "project_role": pack(ProjectRole.choices),
        "project_status": pack(ProjectStatus.choices),
        "workspace_role": pack(WorkspaceRole.choices),
        "global_role": pack(GlobalRole.choices),
        "specialties": specialty_catalog(),
        "seniority": pack(Seniority.choices),
        # Tarix filtri - ro'yxat `VERB_META` dan chiqadi, frontendda
        # qattiq yozilmaydi (aks holda yangi turkum filtrga tushmay qolardi).
        "activity_category": category_choices(),
    })
