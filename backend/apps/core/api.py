from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.activity.models import Activity
from apps.activity.serializers import ActivitySerializer
from apps.projects.models import JoinRequest, Project, ProjectRole, RequestStatus
from apps.projects.serializers import JoinRequestSerializer, ProjectSerializer
from apps.tasks.models import Task, TaskStatus
from apps.tasks.serializers import TaskSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    """Fokus paneli: har bir rol faqat o'zining ishini ko'radi."""
    user = request.user
    now = timezone.now()
    ctx = {"request": request}

    my_tasks = (Task.objects.filter(assignments__user=user, assignments__is_active=True)
                .select_related("project", "created_by")
                .prefetch_related("assignments__user").distinct())

    focus_queue = my_tasks.filter(
        status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS]
    ).order_by("-priority", "due_date", "id")

    next_task = focus_queue.first()
    returned = my_tasks.filter(status=TaskStatus.CHANGES_REQUESTED)
    blocked = my_tasks.filter(status=TaskStatus.BLOCKED)
    waiting_review = my_tasks.filter(status=TaskStatus.IN_REVIEW)
    overdue = focus_queue.filter(due_date__lt=now.date())

    my_projects = (Project.objects.filter(memberships__user=user, memberships__is_active=True)
                   .select_related("workspace", "manager")
                   .annotate(
                       member_count=Count("memberships",
                                          filter=Q(memberships__is_active=True), distinct=True),
                       open_tasks=Count("tasks", filter=~Q(
                           tasks__status__in=[TaskStatus.DONE, TaskStatus.CANCELLED]),
                           distinct=True),
                       done_tasks=Count("tasks", filter=Q(tasks__status=TaskStatus.DONE),
                                        distinct=True),
                       my_tasks=Count("tasks", filter=Q(tasks__assignments__user=user,
                                                        tasks__assignments__is_active=True),
                                      distinct=True))
                   .distinct().order_by("-updated_at"))

    if user.is_platform_admin:
        managed = Project.objects.select_related("manager").order_by("-updated_at")
        review_qs = Task.objects.filter(status=TaskStatus.IN_REVIEW)
        join_qs = JoinRequest.objects.filter(status=RequestStatus.PENDING)
        feed = Activity.objects.timeline()[:20]
    else:
        managed = Project.objects.filter(
            Q(manager=user) | Q(memberships__user=user, memberships__role=ProjectRole.MANAGER,
                                memberships__is_active=True)).distinct()
        review_qs = Task.objects.filter(status=TaskStatus.IN_REVIEW, project__in=managed)
        join_qs = JoinRequest.objects.filter(status=RequestStatus.PENDING, project__in=managed)
        feed = (Activity.objects.filter(
            Q(project__memberships__user=user, project__memberships__is_active=True)
            | Q(actor=user)).select_related("actor", "project", "task")
            .distinct().order_by("-created_at")[:20])

    review_qs = (review_qs.select_related("project")
                 .prefetch_related("assignments__user").order_by("submitted_at")[:10])
    join_qs = join_qs.select_related("user", "project").order_by("created_at")[:10]

    return Response({
        "stats": {
            "open": focus_queue.count(),
            "review": waiting_review.count(),
            "returned": returned.count(),
            "overdue": overdue.count(),
            "done_week": my_tasks.filter(
                status=TaskStatus.DONE,
                completed_at__gte=now - timezone.timedelta(days=7)).count(),
            "pending_reviews": review_qs.count() if hasattr(review_qs, "count") else 0,
            "pending_joins": len(join_qs),
        },
        "next_task": TaskSerializer(next_task, context=ctx).data if next_task else None,
        "focus_queue": TaskSerializer(focus_queue[:8], many=True, context=ctx).data,
        "returned": TaskSerializer(returned, many=True, context=ctx).data,
        "blocked": TaskSerializer(blocked, many=True, context=ctx).data,
        "waiting_review": TaskSerializer(waiting_review, many=True, context=ctx).data,
        "my_projects": ProjectSerializer(my_projects, many=True, context=ctx).data,
        "managed_projects": ProjectSerializer(managed[:8], many=True, context=ctx).data,
        "review_queue": TaskSerializer(review_qs, many=True, context=ctx).data,
        "join_queue": JoinRequestSerializer(join_qs, many=True, context=ctx).data,
        "feed": ActivitySerializer(feed, many=True, context=ctx).data,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_work(request):
    """Menga biriktirilgan barcha vazifalar - status bo'yicha guruhlangan."""
    user = request.user
    ctx = {"request": request}
    qs = (Task.objects.filter(assignments__user=user, assignments__is_active=True)
          .select_related("project").prefetch_related("assignments__user").distinct())

    project_id = request.query_params.get("project")
    if project_id:
        qs = qs.filter(project_id=project_id)

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

    projects = (Project.objects.filter(memberships__user=user, memberships__is_active=True)
                .distinct().order_by("name"))
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
    })
