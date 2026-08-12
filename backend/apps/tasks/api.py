from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.activity.models import Activity
from apps.activity.services import log, log_field_changes
from apps.core.permissions import ProjectAccess, check_access
from apps.projects.models import Project, ProjectRole

from .models import (BOARD_COLUMNS, Attachment, Label, Review, ReviewVerdict, Task,
                     TaskAssignment, TaskStatus, WorkLog)
from .serializers import (AttachmentSerializer, BulkTaskSerializer, CommentSerializer,
                          LabelSerializer, ReviewSerializer, StatusChangeSerializer,
                          TaskDetailSerializer, TaskSerializer, WorkLogSerializer)

User = get_user_model()


def sync_assignees(task, user_ids, actor):
    """Ijrochilar ro'yxatini yangilaydi va tarixga yozadi."""
    wanted = set(user_ids or [])
    current = {a.user_id: a for a in task.assignments.select_related("user")}
    added, removed = [], []

    for uid in wanted:
        a = current.get(uid)
        if a is None:
            user = User.objects.filter(pk=uid).first()
            if not user:
                continue
            TaskAssignment.objects.create(task=task, user=user, assigned_by=actor)
            added.append(user)
        elif not a.is_active:
            a.is_active = True
            a.unassigned_at = None
            a.assigned_by = actor
            a.save(update_fields=["is_active", "unassigned_at", "assigned_by"])
            added.append(a.user)

    from django.utils import timezone

    for uid, a in current.items():
        if uid not in wanted and a.is_active:
            a.is_active = False
            a.unassigned_at = timezone.now()
            a.save(update_fields=["is_active", "unassigned_at"])
            removed.append(a.user)

    if added:
        log(actor=actor, verb="task.assigned", task=task,
            summary="{}: {} biriktirildi".format(task.code,
                                                 ", ".join(u.full_name for u in added)))
    if removed:
        log(actor=actor, verb="task.unassigned", task=task,
            summary="{}: {} olib tashlandi".format(task.code,
                                                   ", ".join(u.full_name for u in removed)))
    return added, removed


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    search_fields = ["title", "description", "acceptance_criteria"]
    ordering_fields = ["priority", "due_date", "created_at", "updated_at", "position"]
    ordering = ["-priority", "due_date", "-id"]

    # ------------------------------------------------------------ queryset
    def get_queryset(self):
        user = self.request.user
        qs = (Task.objects.select_related("project", "created_by", "reviewer")
              .prefetch_related("assignments__user", "labels"))

        if not user.is_platform_admin:
            qs = qs.filter(Q(project__memberships__user=user,
                             project__memberships__is_active=True)
                           | Q(project__is_public=True))

        p = self.request.query_params
        if p.get("project"):
            qs = qs.filter(project_id=p["project"])
        if p.get("status"):
            qs = qs.filter(status__in=p["status"].split(","))
        if p.get("task_type"):
            qs = qs.filter(task_type=p["task_type"])
        if p.get("priority"):
            qs = qs.filter(priority=p["priority"])
        if p.get("assignee") == "me":
            qs = qs.filter(assignments__user=user, assignments__is_active=True)
        elif p.get("assignee"):
            qs = qs.filter(assignments__user_id=p["assignee"], assignments__is_active=True)
        if p.get("open") == "1":
            qs = qs.exclude(status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])
        if p.get("overdue") == "1":
            from django.utils import timezone
            qs = qs.filter(due_date__lt=timezone.localdate()).exclude(
                status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])
        return qs.distinct()

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "update", "partial_update"):
            return TaskDetailSerializer
        return TaskSerializer

    def get_object(self):
        task = get_object_or_404(
            Task.objects.select_related("project", "project__workspace"),
            pk=self.kwargs["pk"])
        need = "view" if self.request.method in ("GET", "HEAD", "OPTIONS") else "work"
        check_access(self.request.user, task.project, need)
        return task

    # ------------------------------------------------------------ yaratish
    def create(self, request, *args, **kwargs):
        project = get_object_or_404(Project, pk=request.data.get("project"))
        check_access(request.user, project, "task")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignee_ids = serializer.validated_data.pop("assignee_ids", [])
        label_ids = serializer.validated_data.pop("label_ids", [])
        reviewer_id = serializer.validated_data.pop("reviewer_id", None)

        task = serializer.save(project=project, created_by=request.user,
                               reviewer_id=reviewer_id)
        if label_ids:
            task.labels.set(Label.objects.filter(project=project, id__in=label_ids))
        sync_assignees(task, assignee_ids, request.user)

        log(actor=request.user, verb="task.created", task=task,
            summary="{} yaratildi: {}".format(task.code, task.title),
            detail=task.description[:500],
            meta={"priority": task.priority_label, "type": task.get_task_type_display(),
                  "specialty": task.required_specialty or None})
        return Response(TaskDetailSerializer(task, context=self.get_serializer_context()).data,
                        status=201)

    def update(self, request, *args, **kwargs):
        task = self.get_object()
        access = ProjectAccess(request.user, task.project)
        is_assignee = task.assignments.filter(user=request.user, is_active=True).exists()
        if not (access.can_create_task or is_assignee):
            raise PermissionDenied("Faqat menejer yoki ijrochi tahrirlay oladi.")

        tracked = ["title", "description", "acceptance_criteria", "priority", "due_date",
                   "task_type", "estimate_hours", "branch_name", "pr_url"]
        before = {f: getattr(task, f) for f in tracked}

        serializer = self.get_serializer(task, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        assignee_ids = serializer.validated_data.pop("assignee_ids", None)
        label_ids = serializer.validated_data.pop("label_ids", None)
        reviewer_id = serializer.validated_data.pop("reviewer_id", "skip")
        if reviewer_id != "skip":
            serializer.validated_data["reviewer_id"] = reviewer_id

        obj = serializer.save()
        if label_ids is not None:
            obj.labels.set(Label.objects.filter(project=obj.project, id__in=label_ids))
        if assignee_ids is not None and access.can_create_task:
            sync_assignees(obj, assignee_ids, request.user)

        changes = {}
        for f in tracked:
            if before[f] != getattr(obj, f):
                changes[str(obj._meta.get_field(f).verbose_name)] = (before[f], getattr(obj, f))
        log_field_changes(request.user, obj, changes)

        return Response(TaskDetailSerializer(obj, context=self.get_serializer_context()).data)

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        check_access(request.user, task.project, "manage")
        log(actor=request.user, verb="task.deleted", project=task.project,
            summary="{} ochirildi: {}".format(task.code, task.title))
        task.delete()
        return Response(status=204)

    # ------------------------------------------------------------ ommaviy yaratish
    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk(self, request):
        project = get_object_or_404(Project, pk=request.data.get("project"))
        check_access(request.user, project, "task")

        s = BulkTaskSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data

        members = list(project.memberships.filter(is_active=True).select_related("user"))
        member_ids = {m.user_id for m in members}
        assignees = [uid for uid in d["assignee_ids"] if uid in member_ids]

        required = (d.get("required_specialty") or "").strip()
        skipped = []
        if required and d.get("match_by_specialty"):
            spec_ok = {m.user_id for m in members if m.user.specialty == required}
            skipped = [uid for uid in assignees if uid not in spec_ok]
            assignees = [uid for uid in assignees if uid in spec_ok]
            if not assignees:
                # hech kim tanlanmagan bolsa loyihadagi mos mutaxassislarga beramiz
                assignees = list(spec_ok)

        created = []
        for idx, title in enumerate(d["titles"]):
            task = Task(project=project, title=title[:250], created_by=request.user,
                        priority=d["priority"], task_type=d["task_type"], status=d["status"],
                        due_date=d.get("due_date"),
                        required_specialty=required,
                        acceptance_criteria=d.get("acceptance_criteria", ""))
            task.save()
            if assignees:
                targets = [assignees[idx % len(assignees)]] if d["distribute"] else assignees
                for uid in targets:
                    TaskAssignment.objects.create(task=task, user_id=uid,
                                                  assigned_by=request.user)
            created.append(task)

        log(actor=request.user, verb="task.created", project=project,
            summary="{} ta task yaratildi".format(len(created)),
            detail="\n".join("{} - {}".format(t.code, t.title) for t in created[:50]),
            meta={"count": len(created), "codes": [t.code for t in created[:50]]})
        return Response({
            "created": len(created),
            "skipped_assignees": skipped,
            "tasks": TaskSerializer(created, many=True,
                                    context=self.get_serializer_context()).data,
        }, status=201)

    # ------------------------------------------------------------ doska
    @action(detail=False, methods=["get"])
    def board(self, request):
        project_id = request.query_params.get("project")
        if not project_id:
            raise ValidationError({"project": "Loyiha ID kerak."})
        project = get_object_or_404(Project, pk=project_id)
        access = check_access(request.user, project, "view")

        qs = self.filter_queryset(self.get_queryset()).filter(project=project)
        columns = []
        for status in BOARD_COLUMNS:
            items = qs.filter(status=status).order_by("position", "-priority", "id")
            columns.append({
                "status": status,
                "label": TaskStatus(status).label,
                "count": items.count(),
                "tasks": TaskSerializer(items, many=True,
                                        context=self.get_serializer_context()).data,
            })
        return Response({"columns": columns, "access": access.as_dict()})

    # ------------------------------------------------------------ holat
    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        task = self.get_object()
        access = check_access(request.user, task.project, "work")

        s = StatusChangeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        new_status = s.validated_data["status"]

        if new_status not in task.allowed_transitions(access):
            raise PermissionDenied(
                "Siz bu vazifani '{}' holatiga ota olmaysiz.".format(TaskStatus(new_status).label))

        old_label = task.get_status_display()
        task.apply_status(new_status)
        if new_status == TaskStatus.BLOCKED:
            task.blocked_reason = s.validated_data.get("blocked_reason", "")[:250]
        if new_status == TaskStatus.IN_REVIEW:
            task.review_round += 1
        task.save()

        verb = "task.status"
        if new_status == TaskStatus.IN_REVIEW:
            verb = "task.submitted"
        elif new_status == TaskStatus.BLOCKED:
            verb = "task.blocked"
        log(actor=request.user, verb=verb, task=task,
            summary="{}: {} -> {}".format(task.code, old_label, task.get_status_display()),
            detail=task.blocked_reason,
            meta={"from": old_label, "to": task.get_status_display()})

        return Response(TaskDetailSerializer(task,
                                             context=self.get_serializer_context()).data)

    # ------------------------------------------------------------ izoh / ish jurnali
    @action(detail=True, methods=["post"], url_path="comments")
    def add_comment(self, request, pk=None):
        task = self.get_object()
        s = CommentSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        comment = s.save(task=task, author=request.user)
        log(actor=request.user, verb="task.commented", task=task,
            summary="{} ga izoh qoldirdi".format(task.code), detail=comment.body[:500])
        return Response(CommentSerializer(comment, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"], url_path="worklogs")
    def add_worklog(self, request, pk=None):
        task = self.get_object()
        check_access(request.user, task.project, "work")
        s = WorkLogSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        wl = s.save(task=task, user=request.user)
        log(actor=request.user, verb="task.worklog", task=task,
            summary="{}: {} soat ish qayd etildi".format(task.code, wl.hours),
            detail=wl.note[:500], meta={"hours": str(wl.hours)})
        return Response(WorkLogSerializer(wl, context={"request": request}).data, status=201)

    # ------------------------------------------------------------ fayllar
    @action(detail=True, methods=["get", "post"], url_path="attachments",
            parser_classes=[MultiPartParser, FormParser, JSONParser])
    def attachments(self, request, pk=None):
        """GET - fayllar royxati; POST - fayl biriktirish (multipart/form-data)."""
        task = self.get_object()

        if request.method == "GET":
            qs = task.attachments.select_related("uploaded_by")
            return Response(AttachmentSerializer(qs, many=True,
                                                 context={"request": request}).data)

        check_access(request.user, task.project, "work")
        files = request.FILES.getlist("file") or request.FILES.getlist("files")
        if not files:
            raise ValidationError({"file": "Fayl tanlanmagan."})

        created = []
        for f in files:
            s = AttachmentSerializer(
                data={"file": f, "description": request.data.get("description", "")},
                context={"request": request})
            s.is_valid(raise_exception=True)
            created.append(s.save(task=task, uploaded_by=request.user,
                                  content_type=(getattr(f, "content_type", "") or "")[:120]))

        log(actor=request.user, verb="task.attachment", task=task,
            summary="{}: {} ta fayl biriktirildi".format(task.code, len(created)),
            detail=", ".join(a.original_name for a in created),
            meta={"files": [{"name": a.original_name, "size": a.size} for a in created]})

        return Response(AttachmentSerializer(created, many=True,
                                             context={"request": request}).data, status=201)

    @action(detail=True, methods=["delete"], url_path="attachments/(?P<attachment_id>[^/.]+)")
    def delete_attachment(self, request, pk=None, attachment_id=None):
        task = self.get_object()
        att = get_object_or_404(Attachment, pk=attachment_id, task=task)
        access = ProjectAccess(request.user, task.project)
        if not (access.can_manage or att.uploaded_by_id == request.user.id):
            raise PermissionDenied("Faylni faqat yuklagan odam yoki menejer ochira oladi.")
        name = att.original_name
        att.file.delete(save=False)
        att.delete()
        log(actor=request.user, verb="task.attachment_deleted", task=task,
            summary="{}: fayl ochirildi ({})".format(task.code, name))
        return Response(status=204)

    # ------------------------------------------------------------ tekshiruv
    @action(detail=False, methods=["get"], url_path="review-queue")
    def review_queue(self, request):
        user = request.user
        qs = Task.objects.filter(status=TaskStatus.IN_REVIEW)
        if not user.is_platform_admin:
            managed = Project.objects.filter(
                Q(manager=user) | Q(memberships__user=user,
                                    memberships__role=ProjectRole.MANAGER,
                                    memberships__is_active=True)).distinct()
            qs = qs.filter(project__in=managed)
        qs = (qs.select_related("project", "created_by")
              .prefetch_related("assignments__user", "labels").order_by("submitted_at"))
        return Response(TaskSerializer(qs, many=True,
                                       context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, pk=None):
        task = self.get_object()
        check_access(request.user, task.project, "review")

        s = ReviewSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        review = s.save(task=task, reviewer=request.user,
                        round_no=max(task.review_round, 1))

        if review.verdict == ReviewVerdict.APPROVED:
            task.apply_status(TaskStatus.DONE)
            verb = "task.approved"
        elif review.verdict == ReviewVerdict.CHANGES_REQUESTED:
            task.apply_status(TaskStatus.CHANGES_REQUESTED)
            verb = "task.changes_requested"
        else:
            task.apply_status(TaskStatus.CANCELLED)
            verb = "task.rejected"
        task.save()

        log(actor=request.user, verb=verb, task=task,
            summary="{} - {} ({}-aylana)".format(task.code, review.get_verdict_display(),
                                                 review.round_no),
            detail=review.comment[:1000],
            meta={"verdict": review.verdict, "round": review.round_no})

        return Response(TaskDetailSerializer(task,
                                             context=self.get_serializer_context()).data)

    @action(detail=False, methods=["get"], url_path="suggest-assignees")
    def suggest_assignees(self, request):
        """?project=<id>&specialty=<code> - vazifaga mos azolarni tavsiya qiladi."""
        from apps.accounts.serializers import UserBriefSerializer

        project = get_object_or_404(Project, pk=request.query_params.get("project"))
        check_access(request.user, project, "view")
        specialty = request.query_params.get("specialty") or ""

        members = project.memberships.filter(is_active=True).select_related("user")
        rows = []
        for m in members:
            if specialty and m.user.specialty != specialty:
                continue
            open_count = TaskAssignment.objects.filter(
                task__project=project, user=m.user, is_active=True,
                task__status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS,
                                  TaskStatus.CHANGES_REQUESTED]).count()
            rows.append({
                "user": UserBriefSerializer(m.user, context={"request": request}).data,
                "role": m.role,
                "open_tasks": open_count,
                "matches": (not specialty) or m.user.specialty == specialty,
            })
        rows.sort(key=lambda r: (not r["matches"], r["open_tasks"]))
        return Response(rows)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        from apps.activity.serializers import ActivitySerializer

        task = self.get_object()
        qs = Activity.objects.filter(task=task).select_related("actor").order_by("-created_at")
        return Response(ActivitySerializer(qs, many=True, context={"request": request}).data)


class LabelViewSet(viewsets.ModelViewSet):
    serializer_class = LabelSerializer

    def get_queryset(self):
        qs = Label.objects.select_related("project")
        project = self.request.query_params.get("project")
        if project:
            qs = qs.filter(project_id=project)
        return qs

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.request.data.get("project"))
        check_access(self.request.user, project, "manage")
        serializer.save(project=project)
