from django.db import transaction
from django.db.models import Exists, OuterRef, Q, Subquery
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.activity.services import log
from apps.projects.permissions import (CanCreateProject, runs_everything,
                                       sees_all_projects)
from apps.core.queries import related_count
from apps.projects.models import Project

from .models import Workspace, WorkspaceMember, WorkspaceRole
from .serializers import WorkspaceDetailSerializer, WorkspaceSerializer


# Qo'lda beriladigan rollar: egalik bundan tashqarida.
GRANTABLE_ROLES = [r for r in WorkspaceRole.values if r != WorkspaceRole.OWNER]


class WorkspaceViewSet(viewsets.ModelViewSet):
    """Ish maydonlari - GitHub organization ekvivalenti."""

    # Maydon ochish ham loyiha menejeri va adminning ishi: loyiha ocha
    # olmaydigan odamga bo'sh maydonning keragi yo'q.
    permission_classes = [permissions.IsAuthenticated, CanCreateProject]
    lookup_field = "slug"
    search_fields = ["name", "description"]

    def get_queryset(self):
        user = self.request.user
        qs = Workspace.objects.select_related("owner").annotate(
            member_count=related_count(WorkspaceMember, group_by="workspace"),
            project_count=related_count(Project, group_by="workspace"),
            # So'rovchining roli - ro'yxat bilan BIRGA. Seriyalizatorda
            # `my_role` ham, `can_manage` ham shu javobni so'raydi va
            # oldindan olinmasa har bir maydon uchun ikkitadan qo'shimcha
            # so'rov ketardi (`WorkspaceSerializer._role`).
            my_role_value=Subquery(
                WorkspaceMember.objects
                .filter(workspace=OuterRef("pk"), user=user)
                .values("role")[:1]),
        )
        # `Exists()` - `.distinct()` o'rniga: takror qator paydo bo'lmaydi.
        # Db2 `DISTINCT` da CLOB (bu yerda `description`) ni qo'llamaydi.
        mine = Exists(WorkspaceMember.objects.filter(workspace=OuterRef("pk"), user=user))

        scope = self.request.query_params.get("scope", "")
        if scope == "mine":
            qs = qs.filter(mine)
        elif scope == "open":
            qs = qs.filter(is_open=True).exclude(mine)
        elif not sees_all_projects(user):
            # Hamma loyihani ko'radiganlar bu yerdan ham o'tadi. Sababi
            # loyihalardan keladi: loyiha o'z ish maydoniga havola
            # qiladi va maydon ro'yxatdan tushib qolsa, o'sha havola
            # yopiq maydonda 404 berardi - ya'ni huquq havolaning
            # yarmida uzilardi. BOSHQARISH kengaymaydi: `can_manage`
            # va o'chirish `runs_everything` da qoladi.
            qs = qs.filter(Q(is_open=True) | mine)
        return qs.order_by("name")

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "update", "partial_update"):
            return WorkspaceDetailSerializer
        return WorkspaceSerializer

    def perform_create(self, serializer):
        ws = serializer.save(owner=self.request.user)
        WorkspaceMember.objects.create(workspace=ws, user=self.request.user,
                                       role=WorkspaceRole.OWNER)
        log(actor=self.request.user, verb="workspace.created", workspace=ws, target=ws,
            summary="Ish maydoni yaratildi: " + ws.name)

    def perform_update(self, serializer):
        if not serializer.instance.can_manage(self.request.user):
            raise PermissionDenied("Ish maydonini boshqarish huquqi yoq.")
        serializer.save()

    def perform_destroy(self, instance):
        if not (runs_everything(self.request.user)
                or instance.owner_id == self.request.user.id):
            raise PermissionDenied("Faqat egasi ochira oladi.")
        # Yumshoq o'chirish. Ilgari `delete()` edi va ish maydoni bilan
        # BIRGA ichidagi hamma loyiha, vazifa va tarix CASCADE bilan yo'q
        # bo'lardi - loyihada eng qimmatga tushadigan amal shu edi.
        #
        # Loyihalar ham belgilanadi: aks holda maydoni o'chirilgan loyiha
        # ro'yxatlarda yolg'iz qolib ko'rinaverardi. Ular alohida yozuv,
        # ya'ni kerak bo'lsa bittalab tiklanadi.
        with transaction.atomic():
            for project in Project.objects.filter(workspace=instance):
                project.soft_delete(self.request.user)
            instance.soft_delete(self.request.user)

    @action(detail=True, methods=["post"])
    def join(self, request, slug=None):
        """POST /api/workspaces/:slug/join/  {code?}"""
        ws = self.get_object()
        code = (request.data.get("code") or "").strip().upper()
        if not ws.is_open and code != ws.join_code:
            raise ValidationError({"code": "Taklif kodi notogri."})
        obj, created = WorkspaceMember.objects.get_or_create(
            workspace=ws, user=request.user, defaults={"role": WorkspaceRole.MEMBER})
        if created:
            log(actor=request.user, verb="workspace.joined", workspace=ws, target=ws,
                summary="{} ish maydoniga qoshildi".format(request.user.full_name))
        return Response({"joined": True, "created": created,
                         "role": obj.role, "workspace": ws.slug})

    @action(detail=True, methods=["post"], url_path="members")
    def set_member(self, request, slug=None):
        """POST /api/workspaces/:slug/members/ {member_id, role|action}"""
        ws = self.get_object()
        if not ws.can_manage(request.user):
            raise PermissionDenied("Ruxsat yoq.")
        member = ws.memberships.filter(pk=request.data.get("member_id")).first()
        if not member:
            raise ValidationError({"member_id": "Azo topilmadi."})
        if member.role == WorkspaceRole.OWNER:
            raise ValidationError({"detail": "Ish maydoni egasini ozgartirib bolmaydi."})

        if request.data.get("action") == "remove":
            member.delete()
            return Response({"removed": True})

        role = request.data.get("role")
        # Egalik rol almashtirish orqali berilmaydi - u maydonning `owner`
        # maydonida turadi va bir kishilik. `apps/core/team.py` da bu qoida
        # ilgaridan bor edi, bu yerda esa `OWNER` ham ro'yxatdan o'tib ketardi.
        if role not in GRANTABLE_ROLES:
            raise ValidationError({"role": "Notogri rol."})
        member.role = role
        member.save(update_fields=["role"])
        return Response({"updated": True, "role": role})
