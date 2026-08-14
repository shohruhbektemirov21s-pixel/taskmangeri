from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, OuterRef, Q, Subquery, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.serializers import UserBriefSerializer
from apps.core.permissions import check_access
from apps.projects.models import Project, ProjectMember
from apps.projects.serializers import ProjectBriefSerializer, ProjectMemberSerializer
from apps.tasks.models import (Review, ReviewVerdict, Task, TaskAssignment, TaskStatus,
                               WorkLog)
from apps.tasks.serializers import ReviewSerializer, TaskSerializer, WorkLogSerializer

from .models import VERB_META, Activity
from .serializers import ActivitySerializer

User = get_user_model()


class ActivityViewSet(viewsets.ReadOnlyModelViewSet):
    """Loyiha tarixi - o'zgarmas yozuvlar lentasi."""

    serializer_class = ActivitySerializer
    search_fields = ["summary", "detail", "target_label"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        # O'chirilgan loyihaning tarixi bazada qoladi, lekin ro'yxatda chiqmaydi.
        qs = Activity.objects.timeline().exclude(project__deleted_at__isnull=False)

        project_id = self.request.query_params.get("project")
        if project_id:
            project = get_object_or_404(Project, pk=project_id)
            check_access(user, project, "view")
            qs = qs.filter(project=project)
        elif not user.is_platform_admin:
            qs = qs.filter(
                Q(actor=user) | Exists(ProjectMember.objects.filter(
                    project=OuterRef("project_id"), user=user, is_active=True))
            )

        actor = self.request.query_params.get("actor")
        if actor:
            qs = qs.filter(actor_id=actor)

        category = self.request.query_params.get("category")
        if category:
            verbs = [v for v, meta in VERB_META.items() if meta[1] == category]
            qs = qs.filter(verb__in=verbs)

        days = self.request.query_params.get("days")
        if days and days.isdigit():
            qs = qs.filter(created_at__gte=timezone.now() - timezone.timedelta(days=int(days)))

        task = self.request.query_params.get("task")
        if task:
            qs = qs.filter(task_id=task)
        return qs

    # ------------------------------------------------------------ loyihalar kesimi
    @action(detail=False, methods=["get"], url_path="by-project")
    def by_project(self, request):
        """Umumiy tarix loyihalar bo'yicha: har biri va undagi yozuvlar soni.

        Aralash lenta o'rniga avval loyihalar ro'yxati chiqadi - odam qaysi
        loyiha tarixini ochishni o'zi tanlaydi. `?q=` nom, kalit va tavsif
        bo'yicha qidiradi.

        Sanoq `GROUP BY` bilan emas, `Subquery` bilan olinadi: Db2 CLOB
        ustunini `GROUP BY` da qo'llamaydi, `description` esa aynan CLOB
        (`apps/core/queries.py` ga qarang).
        """
        from apps.core.queries import related_count

        qs = Project.objects.filter(deleted_at__isnull=True)
        # Ko'rish doirasi lentaning o'zi bilan bir xil: admin hammasini,
        # qolganlar a'zo bo'lgan va ochiq loyihalarni ko'radi.
        if not request.user.is_platform_admin:
            qs = qs.filter(
                Q(is_public=True)
                | Exists(ProjectMember.objects.filter(
                    project=OuterRef("pk"), user=request.user, is_active=True))
            )

        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(key__icontains=q)
                           | Q(description__icontains=q))

        qs = qs.select_related("manager").annotate(
            activity_count=related_count(Activity, group_by="project"),
            last_activity=Subquery(
                Activity.objects.filter(project=OuterRef("pk"))
                .order_by("-created_at").values("created_at")[:1]),
        ).order_by("-last_activity", "-created_at")

        return Response([{
            "id": p.pk,
            "name": p.name,
            "key": p.key,
            "color": p.color,
            "status": p.status,
            "status_display": p.get_status_display(),
            "is_public": p.is_public,
            "manager_name": p.manager.full_name if p.manager else "",
            "activity_count": p.activity_count,
            "last_activity": p.last_activity,
        } for p in qs[:200]])

    # ------------------------------------------------------------ dasturchi hisoboti
    @action(detail=False, methods=["get"], url_path="developer-report")
    def developer_report(self, request):
        """?project=<id>&user=<id> - bitta dasturchi shu loyihada nima qilgani."""
        project_id = request.query_params.get("project")
        user_id = request.query_params.get("user")
        if not (project_id and user_id):
            raise ValidationError({"detail": "project va user parametrlari kerak."})

        project = get_object_or_404(Project, pk=project_id)
        check_access(request.user, project, "view")
        dev = get_object_or_404(User, pk=user_id)
        membership = ProjectMember.objects.filter(project=project, user=dev).first()

        tasks = (Task.objects.filter(project=project, pk__in=TaskAssignment.objects.filter(
                     user=dev).values("task_id"))
                 .prefetch_related("assignments__user"))
        by_status = {row["status"]: row["c"]
                     for row in tasks.values("status").annotate(c=Count("id"))}

        worklogs = (WorkLog.objects.filter(task__project=project, user=dev)
                    .select_related("task").order_by("-work_date")[:60])
        total_hours = (WorkLog.objects.filter(task__project=project, user=dev)
                       .aggregate(s=Sum("hours"))["s"] or 0)

        reviews = (Review.objects.filter(task__project=project, task__assignments__user=dev)
                   .select_related("task", "reviewer").order_by("-created_at")[:30])
        review_map = {r["verdict"]: r["c"] for r in
                      Review.objects.filter(task__project=project, task__assignments__user=dev)
                      .values("verdict").annotate(c=Count("id"))}

        timeline = (Activity.objects.filter(project=project, actor=dev)
                    .select_related("task").order_by("-created_at")[:80])

        ctx = {"request": request}
        return Response({
            "developer": UserBriefSerializer(dev, context=ctx).data,
            "membership": ProjectMemberSerializer(membership, context=ctx).data if membership else None,
            "task_count": tasks.count(),
            "by_status": by_status,
            "done_count": by_status.get(TaskStatus.DONE, 0),
            "total_hours": total_hours,
            "done_tasks": TaskSerializer(
                tasks.filter(status=TaskStatus.DONE).order_by("-completed_at")[:40],
                many=True, context=ctx).data,
            "open_tasks": TaskSerializer(
                tasks.exclude(status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])
                .order_by("-priority")[:40], many=True, context=ctx).data,
            "worklogs": WorkLogSerializer(worklogs, many=True, context=ctx).data,
            "reviews": ReviewSerializer(reviews, many=True, context=ctx).data,
            "review_map": review_map,
            "timeline": ActivitySerializer(timeline, many=True, context=ctx).data,
        })

    # ------------------------------------------------------------ loyihaga kirish
    @action(detail=False, methods=["get"])
    def onboarding(self, request):
        """?project=<id> - yangi dasturchi (yoki agent) uchun kontekst to'plami.

        Maqsad: odam 10 daqiqada loyihani tushunsin, chalkashib vaqt yo'qotmasin.
        """
        project_id = request.query_params.get("project")
        if not project_id:
            raise ValidationError({"project": "Loyiha ID kerak."})
        project = get_object_or_404(Project.objects.select_related("workspace", "manager"),
                                    pk=project_id)
        check_access(request.user, project, "view")
        ctx = {"request": request}

        brief = getattr(project, "brief", None)

        contributions = []
        for m in ProjectMember.objects.filter(project=project).select_related("user"):
            t = Task.objects.filter(project=project, pk__in=TaskAssignment.objects.filter(
                user=m.user).values("task_id"))
            contributions.append({
                "member": ProjectMemberSerializer(m, context=ctx).data,
                "done": t.filter(status=TaskStatus.DONE).count(),
                "open": t.exclude(status__in=[TaskStatus.DONE, TaskStatus.CANCELLED]).count(),
                "hours": WorkLog.objects.filter(task__project=project, user=m.user)
                         .aggregate(s=Sum("hours"))["s"] or 0,
                "last_active": Activity.objects.filter(project=project, actor=m.user)
                               .values_list("created_at", flat=True).first(),
            })
        contributions.sort(key=lambda c: -c["done"])

        key_notes = (WorkLog.objects.filter(task__project=project)
                     .select_related("task", "user").order_by("-work_date")[:25])
        lessons = (Review.objects.filter(task__project=project)
                   .exclude(verdict=ReviewVerdict.APPROVED)
                   .select_related("task", "reviewer").order_by("-created_at")[:20])
        recent_done = (Task.objects.filter(project=project, status=TaskStatus.DONE)
                       .prefetch_related("assignments__user").order_by("-completed_at")[:15])
        open_now = (Task.objects.filter(project=project)
                    .exclude(status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])
                    .prefetch_related("assignments__user").order_by("-priority")[:15])
        milestones = (Activity.objects.filter(
            project=project,
            verb__in=["project.created", "project.brief_updated", "member.approved",
                      "member.removed", "member.left"])
            .select_related("actor").order_by("-created_at")[:20])

        return Response({
            "project": {"id": project.id, "name": project.name, "key": project.key,
                        "description": project.description, "color": project.color,
                        "repo_url": project.repo_url, "docs_url": project.docs_url,
                        "progress": project.progress(),
                        "manager": UserBriefSerializer(project.manager, context=ctx).data
                        if project.manager else None},
            "brief": ProjectBriefSerializer(brief, context=ctx).data if brief else None,
            "contributions": contributions,
            "key_notes": WorkLogSerializer(key_notes, many=True, context=ctx).data,
            "lessons": ReviewSerializer(lessons, many=True, context=ctx).data,
            "recent_done": TaskSerializer(recent_done, many=True, context=ctx).data,
            "open_now": TaskSerializer(open_now, many=True, context=ctx).data,
            "milestones": ActivitySerializer(milestones, many=True, context=ctx).data,
        })
