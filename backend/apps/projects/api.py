from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.activity.services import log
from apps.core.permissions import ProjectAccess, check_access
from apps.tasks.models import TaskAssignment, TaskStatus
from apps.workspaces.models import WorkspaceMember, WorkspaceRole

from .models import (JoinRequest, Project, ProjectBrief, ProjectMember, ProjectRole,
                     RequestStatus)
from .serializers import (JoinRequestSerializer, ProjectBriefSerializer,
                          ProjectDetailSerializer, ProjectMemberSerializer, ProjectSerializer)

User = get_user_model()


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    search_fields = ["name", "key", "description"]
    ordering_fields = ["updated_at", "name", "due_date"]
    ordering = ["-updated_at"]

    # ------------------------------------------------------------ queryset
    def get_queryset(self):
        user = self.request.user
        qs = Project.objects.select_related("workspace", "manager", "created_by").annotate(
            member_count=Count("memberships", filter=Q(memberships__is_active=True), distinct=True),
            open_tasks=Count("tasks", filter=~Q(tasks__status__in=[TaskStatus.DONE,
                                                                   TaskStatus.CANCELLED]),
                             distinct=True),
            done_tasks=Count("tasks", filter=Q(tasks__status=TaskStatus.DONE), distinct=True),
            my_tasks=Count("tasks", filter=Q(tasks__assignments__user=user,
                                             tasks__assignments__is_active=True), distinct=True),
        )
        scope = self.request.query_params.get("scope", "mine")

        if scope == "discover":
            joined = ProjectMember.objects.filter(user=user, is_active=True)\
                .values_list("project_id", flat=True)
            qs = qs.filter(is_public=True).exclude(status="ARCHIVED").exclude(id__in=joined)
        elif scope == "managed":
            qs = qs.filter(Q(manager=user) | Q(memberships__user=user,
                                               memberships__role=ProjectRole.MANAGER,
                                               memberships__is_active=True))
        elif scope == "all" and user.is_platform_admin:
            pass
        else:  # mine
            qs = qs.filter(memberships__user=user, memberships__is_active=True)

        if self.request.query_params.get("matching") == "1":
            qs = qs.filter(needed_specialties__contains=[user.specialty])

        specialty = self.request.query_params.get("specialty")
        if specialty:
            qs = qs.filter(needed_specialties__contains=[specialty])

        ws = self.request.query_params.get("workspace")
        if ws:
            qs = qs.filter(workspace__slug=ws) if not ws.isdigit() else qs.filter(workspace_id=ws)
        return qs.distinct()

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "update", "partial_update"):
            return ProjectDetailSerializer
        return ProjectSerializer

    def get_object(self):
        project = get_object_or_404(
            Project.objects.select_related("workspace", "manager", "created_by"),
            pk=self.kwargs["pk"])
        need = "view" if self.request.method in ("GET", "HEAD", "OPTIONS") else "manage"
        check_access(self.request.user, project, need)
        return project

    # ------------------------------------------------------------ CRUD
    def perform_create(self, serializer):
        user = self.request.user
        manager_id = serializer.validated_data.pop("manager_id", None) or user.id
        project = serializer.save(created_by=user, manager_id=manager_id)

        ProjectBrief.objects.get_or_create(project=project, defaults={"updated_by": user})
        ProjectMember.objects.get_or_create(
            project=project, user_id=manager_id,
            defaults={"role": ProjectRole.MANAGER, "added_by": user})
        ProjectMember.objects.get_or_create(
            project=project, user=user,
            defaults={"role": ProjectRole.MANAGER, "added_by": user})
        WorkspaceMember.objects.get_or_create(
            workspace=project.workspace, user=user,
            defaults={"role": WorkspaceRole.MEMBER})

        log(actor=user, verb="project.created", project=project, target=project,
            summary="Loyiha yaratildi: " + project.name, detail=project.description[:500])

    def perform_update(self, serializer):
        manager_id = serializer.validated_data.pop("manager_id", None)
        project = serializer.save(**({"manager_id": manager_id} if manager_id else {}))
        if manager_id:
            ProjectMember.objects.update_or_create(
                project=project, user_id=manager_id,
                defaults={"role": ProjectRole.MANAGER, "is_active": True})
        log(actor=self.request.user, verb="project.updated", project=project, target=project,
            summary="Loyiha sozlamalari yangilandi")

    def perform_destroy(self, instance):
        if not self.request.user.is_platform_admin:
            raise PermissionDenied("Loyihani faqat admin ochira oladi.")
        instance.delete()

    # ------------------------------------------------------------ brif
    @action(detail=True, methods=["get", "patch", "put"])
    def brief(self, request, pk=None):
        project = self.get_object() if request.method == "GET" else self._manage_project(pk)
        brief, _ = ProjectBrief.objects.get_or_create(project=project)
        if request.method == "GET":
            return Response(ProjectBriefSerializer(brief, context={"request": request}).data)

        s = ProjectBriefSerializer(brief, data=request.data, partial=True,
                                   context={"request": request})
        s.is_valid(raise_exception=True)
        s.save(updated_by=request.user)
        log(actor=request.user, verb="project.brief_updated", project=project, target=project,
            summary="Loyiha brifi yangilandi",
            detail="Toldirilganlik: {}%".format(brief.filled_ratio))
        return Response(s.data)

    def _manage_project(self, pk, need="manage"):
        project = get_object_or_404(Project, pk=pk)
        check_access(self.request.user, project, need)
        return project

    # ------------------------------------------------------------ azolar
    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        project = self.get_object()
        qs = project.memberships.select_related("user").order_by("-is_active", "role")
        data = ProjectMemberSerializer(qs, many=True, context={"request": request}).data
        # yuklama statistikasi
        load = {}
        for row in (TaskAssignment.objects
                    .filter(task__project=project, is_active=True)
                    .values("user_id", "task__status").annotate(c=Count("id"))):
            u = load.setdefault(row["user_id"], {"open": 0, "done": 0})
            if row["task__status"] == TaskStatus.DONE:
                u["done"] += row["c"]
            elif row["task__status"] not in (TaskStatus.CANCELLED,):
                u["open"] += row["c"]
        for item in data:
            item["load"] = load.get(item["user"]["id"], {"open": 0, "done": 0})
        return Response(data)

    @action(detail=True, methods=["post"], url_path="members/add")
    def add_member(self, request, pk=None):
        project = self._manage_project(pk)
        user_id = request.data.get("user_id")
        role = request.data.get("role", ProjectRole.DEVELOPER)
        if role not in ProjectRole.values:
            raise ValidationError({"role": "Notogri rol."})
        target = get_object_or_404(User, pk=user_id)
        member, created = ProjectMember.objects.update_or_create(
            project=project, user=target,
            defaults={"role": role, "is_active": True, "left_at": None, "added_by": request.user})
        WorkspaceMember.objects.get_or_create(
            workspace=project.workspace, user=target,
            defaults={"role": WorkspaceRole.MEMBER})
        log(actor=request.user, verb="member.added", project=project, target=target,
            summary="{} jamoaga qoshildi ({})".format(target.full_name,
                                                      member.get_role_display()))
        return Response(ProjectMemberSerializer(member, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="members/(?P<member_id>[^/.]+)")
    def member_action(self, request, pk=None, member_id=None):
        """action=role|remove"""
        project = self._manage_project(pk)
        member = get_object_or_404(ProjectMember, pk=member_id, project=project)
        act = request.data.get("action")

        if act == "remove":
            note = (request.data.get("handover_note") or "").strip()
            member.is_active = False
            member.left_at = timezone.now()
            member.handover_note = note
            member.save(update_fields=["is_active", "left_at", "handover_note"])
            TaskAssignment.objects.filter(task__project=project, user=member.user,
                                          is_active=True)\
                .update(is_active=False, unassigned_at=timezone.now())
            log(actor=request.user, verb="member.removed", project=project, target=member.user,
                summary="{} loyihadan chiqarildi".format(member.user.full_name),
                detail=note or "Topshiriq eslatmasi qoldirilmadi")
            return Response({"removed": True})

        role = request.data.get("role")
        if role not in ProjectRole.values:
            raise ValidationError({"role": "Notogri rol."})
        old = member.get_role_display()
        member.role = role
        member.is_active = True
        member.save(update_fields=["role", "is_active"])
        if role == ProjectRole.MANAGER:
            project.manager = member.user
            project.save(update_fields=["manager"])
        log(actor=request.user, verb="member.role_changed", project=project, target=member.user,
            summary="{} roli: {} -> {}".format(member.user.full_name, old,
                                               member.get_role_display()))
        return Response(ProjectMemberSerializer(member, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        project = get_object_or_404(Project, pk=pk)
        access = ProjectAccess(request.user, project)
        if not access.membership:
            raise ValidationError({"detail": "Siz bu loyiha azosi emassiz."})
        note = (request.data.get("handover_note") or "").strip()
        m = access.membership
        m.is_active = False
        m.left_at = timezone.now()
        m.handover_note = note
        m.save(update_fields=["is_active", "left_at", "handover_note"])
        log(actor=request.user, verb="member.left", project=project, target=request.user,
            summary="{} loyihadan chiqdi".format(request.user.full_name), detail=note)
        return Response({"left": True})

    # ------------------------------------------------------------ qoshilish sorovlari
    @action(detail=True, methods=["post"], url_path="join")
    def join(self, request, pk=None):
        project = get_object_or_404(Project.objects.select_related("workspace"), pk=pk)
        access = ProjectAccess(request.user, project)
        if access.is_member:
            raise ValidationError({"detail": "Siz allaqachon bu loyiha azosisiz."})

        code = (request.data.get("code") or "").strip().upper()
        if not project.is_public and code != project.join_code:
            raise ValidationError({"code": "Loyiha yopiq - togri taklif kodi kerak."})

        if project.join_requests.filter(user=request.user,
                                        status=RequestStatus.PENDING).exists():
            raise ValidationError({"detail": "Sorovingiz allaqachon korib chiqilmoqda."})

        payload = dict(request.data)
        if not payload.get("desired_role"):
            payload["desired_role"] = request.user.default_project_role
        s = JoinRequestSerializer(data=payload, context={"request": request})
        s.is_valid(raise_exception=True)
        req = s.save(project=project, user=request.user)

        if project.auto_accept or code == project.join_code:
            req.status = RequestStatus.APPROVED
            req.decided_at = timezone.now()
            req.decision_note = "Avtomatik qabul qilindi"
            req.save()
            ProjectMember.objects.update_or_create(
                project=project, user=request.user,
                defaults={"role": req.desired_role, "is_active": True, "left_at": None})
            WorkspaceMember.objects.get_or_create(
                workspace=project.workspace, user=request.user,
                defaults={"role": WorkspaceRole.MEMBER})
            log(actor=request.user, verb="member.approved", project=project, target=request.user,
                summary="{} loyihaga qoshildi (avtomatik)".format(request.user.full_name))
            return Response({"joined": True, "request": JoinRequestSerializer(req).data}, status=201)

        log(actor=request.user, verb="member.requested", project=project, target=request.user,
            summary="{} qoshilish sorovi yubordi".format(request.user.full_name),
            detail=req.message[:500])
        return Response({"joined": False, "request": JoinRequestSerializer(req).data}, status=201)

    @action(detail=True, methods=["get"], url_path="requests")
    def requests(self, request, pk=None):
        project = self._manage_project(pk)
        qs = project.join_requests.select_related("user", "decided_by").order_by("-created_at")
        st = request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        return Response(JoinRequestSerializer(qs, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="requests/(?P<req_id>[^/.]+)/decide")
    def decide_request(self, request, pk=None, req_id=None):
        """{action: approve|reject, role?, note?}"""
        project = self._manage_project(pk)
        req = get_object_or_404(JoinRequest, pk=req_id, project=project)
        if not req.is_pending:
            raise ValidationError({"detail": "Bu sorov allaqachon hal qilingan."})

        note = (request.data.get("note") or "").strip()
        req.decided_by = request.user
        req.decided_at = timezone.now()
        req.decision_note = note

        if request.data.get("action") == "approve":
            role = request.data.get("role") or req.desired_role
            if role not in ProjectRole.values:
                raise ValidationError({"role": "Notogri rol."})
            req.status = RequestStatus.APPROVED
            req.save()
            ProjectMember.objects.update_or_create(
                project=project, user=req.user,
                defaults={"role": role, "is_active": True, "left_at": None,
                          "added_by": request.user})
            WorkspaceMember.objects.get_or_create(
                workspace=project.workspace, user=req.user,
                defaults={"role": WorkspaceRole.MEMBER})
            log(actor=request.user, verb="member.approved", project=project, target=req.user,
                summary="{} loyihaga qabul qilindi ({})".format(
                    req.user.full_name, dict(ProjectRole.choices)[role]), detail=note)
        else:
            req.status = RequestStatus.REJECTED
            req.save()
            log(actor=request.user, verb="member.rejected", project=project, target=req.user,
                summary="{} sorovi rad etildi".format(req.user.full_name), detail=note)

        return Response(JoinRequestSerializer(req, context={"request": request}).data)


class MyJoinRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """Foydalanuvchining o'z so'rovlari."""

    serializer_class = JoinRequestSerializer

    def get_queryset(self):
        return (JoinRequest.objects.filter(user=self.request.user)
                .select_related("project", "decided_by").order_by("-created_at"))
