from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import GlobalRole
from apps.activity.services import log
from apps.core.permissions import CanCreateProject, ProjectAccess, check_access
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many
from apps.core.queries import related_count
from apps.tasks.models import Task, TaskAssignment, TaskStatus
from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRole

from .models import (JoinRequest, Project, ProjectBrief, ProjectFile, ProjectMember,
                     ProjectRole, ProjectSpecialty, RequestStatus)
from .serializers import (JoinRequestSerializer, ProjectBriefSerializer,
                          ProjectDetailSerializer, ProjectFileSerializer,
                          ProjectMemberSerializer, ProjectSerializer)

User = get_user_model()


def _managers_of(project):
    """Loyihani boshqaradiganlar - so'rov va a'zolik xabarlari shularga boradi."""
    return [m.user for m in project.memberships.filter(
        is_active=True, role__in=[ProjectRole.MANAGER, ProjectRole.ADMIN]).select_related("user")]


def _role_label(role):
    return dict(ProjectRole.choices).get(role, role)


OPEN_STATUSES = [s for s in TaskStatus.values
                 if s not in (TaskStatus.DONE, TaskStatus.CANCELLED)]


def project_counters(user):
    """Loyiha kartochkasidagi raqamlar.

    `annotate(Count(...))` o'rniga ichki so'rov: tashqi so'rovga GROUP BY
    qo'shilmaydi, ya'ni Db2 dagi CLOB cheklovi (SQL0134N) chetlab o'tiladi.
    """
    return {
        "member_count": related_count(ProjectMember, group_by="project", is_active=True),
        "open_tasks": related_count(Task, group_by="project", status__in=OPEN_STATUSES),
        "done_tasks": related_count(Task, group_by="project", status=TaskStatus.DONE),
        "my_tasks": related_count(Task, group_by="project",
                                  assignments__user=user, assignments__is_active=True),
    }


def resolve_workspace(user):
    """Loyiha uchun ish maydonini o'zimiz tanlaymiz.

    Loyiha ish maydonisiz mavjud bo'la olmaydi (modelda majburiy bog'lanish):
    kalit takrorlanmasligi, rang tanlash, a'zolik va maydon suhbati - hammasi
    shunga tayanadi. Lekin foydalanuvchi buni forma to'ldirayotganda tanlab
    o'tirmasligi kerak, shuning uchun:

      1) o'zi egasi bo'lgan eng so'nggi maydon;
      2) bo'lmasa - a'zo bo'lgan maydon;
      3) u ham bo'lmasa - nomiga qarab yangisi ochiladi.
    """
    ws = Workspace.objects.filter(owner=user).order_by("-updated_at").first()
    if ws:
        return ws

    member = (WorkspaceMember.objects.filter(user=user)
              .select_related("workspace").order_by("-workspace__updated_at").first())
    if member:
        return member.workspace

    ws = Workspace.objects.create(
        name="{} maydoni".format(user.get_short_name() or "Ish"), owner=user)
    WorkspaceMember.objects.get_or_create(
        workspace=ws, user=user, defaults={"role": WorkspaceRole.OWNER})
    return ws


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    # Loyiha ochish - faqat loyiha menejeri va admin (`CanCreateProject`).
    permission_classes = [permissions.IsAuthenticated, CanCreateProject]
    search_fields = ["name", "key", "description"]
    ordering_fields = ["updated_at", "name", "due_date"]
    ordering = ["-updated_at"]

    # ------------------------------------------------------------ queryset
    def get_queryset(self):
        user = self.request.user
        qs = Project.objects.select_related("workspace", "manager", "created_by").annotate(
            **project_counters(user))
        scope = self.request.query_params.get("scope", "mine")

        # Ko'p-ga-ko'p bog'lanish bo'yicha filtrlash qatorlarni takrorlaydi va
        # odatda `.distinct()` bilan tozalanadi. Bu yerda `Exists()` ishlatiladi:
        # takror umuman paydo bo'lmaydi, ya'ni DISTINCT kerak emas. IBM Db2
        # DISTINCT da CLOB ustunini qo'llamaydi, `description` esa aynan shunday -
        # `.distinct()` u yerda SQL0134N bilan yiqilardi.
        def member_of(**extra):
            return Exists(ProjectMember.objects.filter(
                project=OuterRef("pk"), user=user, is_active=True, **extra))

        def needs(value):
            return Exists(ProjectSpecialty.objects.filter(
                project=OuterRef("pk"), value=value))

        if scope == "discover":
            qs = qs.filter(is_public=True).exclude(status="ARCHIVED").exclude(member_of())
        elif scope == "managed":
            qs = qs.filter(Q(manager=user) | member_of(role=ProjectRole.MANAGER))
        elif scope == "all" and user.is_platform_admin:
            pass
        else:  # mine
            qs = qs.filter(member_of())

        if self.request.query_params.get("matching") == "1":
            qs = qs.filter(needs(user.specialty))

        specialty = self.request.query_params.get("specialty")
        if specialty:
            qs = qs.filter(needs(specialty))

        ws = self.request.query_params.get("workspace")
        if ws:
            qs = qs.filter(workspace__slug=ws) if not ws.isdigit() else qs.filter(workspace_id=ws)
        return qs

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
        # Forma ish maydonini so'ramaydi - yuborilmagan bo'lsa o'zimiz topamiz.
        workspace = serializer.validated_data.get("workspace") or resolve_workspace(user)
        project = serializer.save(created_by=user, manager_id=manager_id,
                                  workspace=workspace)

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
        """Loyihani o'chirish - loyiha menejeri yoki tizim admini.

        Loyiha admini o'chira olmaydi: u kundalik boshqaruv uchun, butun
        loyihani yo'q qilish esa egasining qarori.
        """
        access = ProjectAccess(self.request.user, instance)
        if not (access.is_admin or access.is_manager):
            raise PermissionDenied("Loyihani faqat loyiha menejeri yoki admin ochira oladi.")
        log(actor=self.request.user, verb="project.deleted", workspace=instance.workspace,
            summary="Loyiha ochirildi: " + instance.name)
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
        """Jamoaga qoshish - TAKLIF orqali.

        Ilgari bu endpoint odamni tosridan-togri azo qilardi. Endi unday emas:
        hech kim ozi tasdiqlamaguncha jamoaga qoshilmaydi. Shuning uchun bu
        yerda taklif yaratiladi va odamga bildirishnoma boradi.
        """
        from apps.invites.models import Invitation, InviteStatus
        from apps.invites.serializers import InvitationSerializer

        project = self._manage_project(pk)
        access = ProjectAccess(request.user, project)
        role = request.data.get("role", ProjectRole.DEVELOPER)
        if role not in ProjectRole.values:
            raise ValidationError({"role": "Notogri rol."})
        if not access.can_grant_role(role):
            raise PermissionDenied("Menejer rolini faqat amaldagi menejer bera oladi.")

        target = get_object_or_404(User, pk=request.data.get("user_id"), is_active=True)
        if target.pk == request.user.pk:
            raise ValidationError({"user_id": "Ozingizni taklif qila olmaysiz."})
        if project.memberships.filter(user=target, is_active=True).exists():
            raise ValidationError({"user_id": "Bu odam allaqachon jamoada."})
        if Invitation.objects.filter(project=project, user=target,
                                     status=InviteStatus.PENDING).exists():
            raise ValidationError({"user_id": "Bu odamga taklif allaqachon yuborilgan."})

        invite = Invitation.objects.create(
            project=project, user=target, invited_by=request.user, role=role,
            message=(request.data.get("message") or "").strip())

        log(actor=request.user, verb="member.invited", project=project, target=target,
            summary="{} jamoaga taklif qilindi: {}".format(target.full_name, project.name))
        notify(target, NotificationKind.INVITE_RECEIVED,
               title="Sizni jamoaga taklif qilishdi",
               body="{} - {} ({})".format(project.name, invite.role_display,
                                          request.user.full_name),
               url="/takliflar", actor=request.user,
               meta={"invitation": invite.pk, "scope": "project"})

        return Response(InvitationSerializer(invite, context={"request": request}).data,
                        status=201)

    @action(detail=True, methods=["post"], url_path="members/(?P<member_id>[^/.]+)")
    def member_action(self, request, pk=None, member_id=None):
        """action=role|remove|appoint_admin"""
        project = self._manage_project(pk)
        member = get_object_or_404(ProjectMember, pk=member_id, project=project)
        access = ProjectAccess(request.user, project)
        act = request.data.get("action")

        # MENEJER himoyalangan: unga faqat boshqa menejer tega oladi.
        if act in ("remove", "role") or act is None:
            if not access.can_change_member(member):
                raise PermissionDenied(
                    "Loyiha menejeriga tegib bo'lmaydi — uni faqat boshqa menejer "
                    "almashtira oladi yoki o'zi chiqadi.")

        if act == "appoint_admin":
            if not access.can_appoint_admin:
                raise PermissionDenied("Admin tayinlash huquqi faqat loyiha menejerida.")
            if not member.is_active:
                raise ValidationError({"detail": "Faol bo'lmagan a'zoni tayinlab bo'lmaydi."})
            target = member.user
            if target.is_platform_admin:
                raise ValidationError({"detail": "Bu odam allaqachon tizim admini."})
            target.global_role = GlobalRole.ADMIN
            target.save(update_fields=["global_role"])
            log(actor=request.user, verb="user.role_changed", project=project, target=target,
                summary="{} tizim admini qilib tayinlandi".format(target.full_name),
                detail="Tayinladi: {}".format(request.user.full_name))
            notify(target, NotificationKind.MEMBER_JOINED,
                   title="Sizga tizim admini huquqi berildi",
                   body="{} loyihasida {} tayinladi".format(project.name, request.user.full_name),
                   url="/profil", actor=request.user)
            return Response(ProjectMemberSerializer(member, context={"request": request}).data)

        if act == "revoke_admin":
            """Berilgan tizim admini huquqini qaytarib olish.

            Tayinlashning teskarisi, lekin ikkita himoya bilan:
              - oxirgi tizim adminini tushirib bo'lmaydi (platforma boshqaruvsiz
                qolmasin - menejer himoyasi bilan bir xil mantiq);
              - superuser (bosh hisob) hech qachon tushirilmaydi.
            """
            if not access.can_appoint_admin:
                raise PermissionDenied("Adminlikni bekor qilish huquqi faqat loyiha menejerida.")
            target = member.user
            # O'ziga o'zi tegmasin: adminlikdan tushib qolib, keyin uni qaytara
            # olmay qolish oson. Huquqni boshqa admin yoki menejer olib qo'yadi.
            if target.pk == request.user.pk:
                raise ValidationError({
                    "detail": "O'z adminlik huquqingizni o'zingiz bekor qila olmaysiz - "
                              "buni boshqa menejer yoki admin qiladi."
                })
            if not target.is_platform_admin:
                raise ValidationError({"detail": "Bu odam tizim admini emas."})
            if target.is_superuser:
                raise ValidationError({"detail": "Bosh hisobning adminligini bekor qilib bo'lmaydi."})
            if User.objects.filter(global_role=GlobalRole.ADMIN, is_active=True)                    .exclude(pk=target.pk).count() == 0:
                raise ValidationError({
                    "detail": "Bu oxirgi tizim admini - uni tushirsak platforma boshqaruvsiz qoladi."
                })

            # Mutaxassisligi loyiha menejeri bo'lsa menejer roliga qaytadi,
            # aks holda oddiy dasturchi bo'ladi - ro'yxatdan o'tish mantig'i bilan bir xil.
            from apps.accounts.specialties import Specialty

            target.global_role = (GlobalRole.MANAGER if target.specialty == Specialty.PM
                                  else GlobalRole.DEVELOPER)
            target.save(update_fields=["global_role"])
            log(actor=request.user, verb="user.role_changed", project=project, target=target,
                summary="{} tizim adminligi bekor qilindi".format(target.full_name),
                detail="Bekor qildi: {} | yangi rol: {}".format(
                    request.user.full_name, target.get_global_role_display()))
            notify(target, NotificationKind.MEMBER_JOINED,
                   title="Tizim admini huquqi bekor qilindi",
                   body="{} loyihasida {} bekor qildi".format(project.name, request.user.full_name),
                   url="/profil", actor=request.user)
            return Response(ProjectMemberSerializer(member, context={"request": request}).data)

        if act == "remove":
            # O'zini bu yerdan chiqarish - chalkash yo'l. Ataylab chiqmoqchi bo'lsa
            # "Loyihadan chiqish" (POST /leave/) bor: u eslatma so'raydi va
            # tarixga "o'zi chiqdi" deb yoziladi.
            if member.user_id == request.user.pk:
                raise ValidationError({
                    "detail": "O'zingizni bu ro'yxatdan chiqara olmaysiz - "
                              "«Loyihadan chiqish» dan foydalaning."
                })
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
        if not access.can_grant_role(role):
            raise PermissionDenied(
                "Menejer rolini faqat amaldagi menejer bera oladi.")
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

    # ------------------------------------------------------------ loyiha fayllari
    @action(detail=True, methods=["get", "post"], url_path="files",
            parser_classes=[MultiPartParser, FormParser, JSONParser])
    def files(self, request, pk=None):
        """GET - fayllar royxati (azolar koradi);
        POST - fayl yuklash (multipart/form-data, azolar yuklaydi)."""
        project = get_object_or_404(Project, pk=pk)

        if request.method == "GET":
            # Ochiq loyihaning vazifalari hammaga korinadi, lekin FAYLLAR yoq:
            # texnik topshiriq, shartnoma, eksport - bular jamoa ichidagi narsa.
            access = ProjectAccess(request.user, project)
            if not (access.is_admin or access.is_member):
                raise PermissionDenied("Loyiha fayllari faqat jamoa azolariga korinadi.")
            qs = project.files.select_related("uploaded_by")
            return Response(ProjectFileSerializer(qs, many=True,
                                                  context={"request": request}).data)

        check_access(request.user, project, "work")
        uploads = request.FILES.getlist("file") or request.FILES.getlist("files")
        if not uploads:
            raise ValidationError({"file": "Fayl tanlanmagan."})

        created = []
        for f in uploads:
            ser = ProjectFileSerializer(
                data={"file": f, "description": request.data.get("description", "")},
                context={"request": request})
            ser.is_valid(raise_exception=True)
            created.append(ser.save(project=project, uploaded_by=request.user,
                                    content_type=(getattr(f, "content_type", "") or "")[:120]))

        log(actor=request.user, verb="project.file", project=project, target=project,
            summary="{} ta fayl yuklandi".format(len(created)),
            detail=", ".join(x.original_name for x in created),
            meta={"files": [{"name": x.original_name, "size": x.size} for x in created]})

        return Response(ProjectFileSerializer(created, many=True,
                                              context={"request": request}).data, status=201)

    @action(detail=True, methods=["delete"], url_path="files/(?P<file_id>[^/.]+)")
    def delete_file(self, request, pk=None, file_id=None):
        """Faylni yuklagan odam yoki loyihani boshqaruvchi ochira oladi."""
        project = get_object_or_404(Project, pk=pk)
        item = get_object_or_404(ProjectFile, pk=file_id, project=project)
        access = ProjectAccess(request.user, project)
        if item.uploaded_by_id != request.user.pk and not access.can_manage:
            raise PermissionDenied("Faylni faqat yuklagan odam yoki menejer ochira oladi.")

        name = item.original_name
        item.file.delete(save=False)
        item.delete()
        log(actor=request.user, verb="project.file_deleted", project=project, target=project,
            summary="Fayl ochirildi: " + name)
        return Response(status=204)

    # ------------------------------------------------------------ muddat bashorati
    @action(detail=True, methods=["get"])
    def forecast(self, request, pk=None):
        """Kim qachon tugatadi: odam va mutaxassislik kesimida.

        Bashorat sodda va tushunarli: qolgan rejalashtirilgan soat kuniga
        HOURS_PER_DAY soatdan bajariladi deb hisoblanadi. Rejalashtirilgan soat
        qoyilmagan vazifa uchun DEFAULT_TASK_HOURS olinadi - aks holda bashorat
        "0 kun" bolib, yolgon tinchlik beradi.
        """
        from datetime import datetime, timedelta

        from apps.accounts.serializers import UserBriefSerializer
        from apps.accounts.specialties import Specialty

        project = get_object_or_404(Project, pk=pk)
        check_access(request.user, project, "view")

        HOURS_PER_DAY = 6
        DEFAULT_TASK_HOURS = 4
        today = timezone.localdate()

        def to_date(value):
            """Muddatni mahalliy sanaga keltiradi (date ham, datetime ham bo'lishi mumkin)."""
            if value is None:
                return None
            if isinstance(value, datetime):
                return timezone.localtime(value).date() if timezone.is_aware(value) else value.date()
            return value
        closed = [TaskStatus.DONE, TaskStatus.CANCELLED]

        rows = (TaskAssignment.objects
                .filter(task__project=project, is_active=True)
                .select_related("task", "user"))

        people = {}
        for row in rows:
            task, user = row.task, row.user
            item = people.setdefault(user.pk, {
                "user": user, "open": 0, "done": 0, "in_review": 0, "overdue": 0,
                "hours_left": 0.0, "last_due": None,
            })
            if task.status == TaskStatus.DONE:
                item["done"] += 1
                continue
            if task.status == TaskStatus.CANCELLED:
                continue
            item["open"] += 1
            if task.status == TaskStatus.IN_REVIEW:
                item["in_review"] += 1
            # Vazifa muddati sana+soat, bashorat esa kun hisobida ishlaydi -
            # shuning uchun mahalliy sanaga keltiramiz. `to_date` ikkala turni
            # ham qabul qiladi: eski yozuvlar yoki keshlangan ulanish tufayli
            # bu yerga `date` kelib qolsa ham hisob buzilmaydi.
            task_due = to_date(task.due_date)
            if task_due and task_due < today:
                item["overdue"] += 1
            item["hours_left"] += float(task.estimate_hours or 0) or DEFAULT_TASK_HOURS
            if task_due and (item["last_due"] is None or task_due > item["last_due"]):
                item["last_due"] = task_due

        def finish_date(hours, workers=1):
            if hours <= 0:
                return None
            per_day = HOURS_PER_DAY * max(workers, 1)
            days = int(-(-hours // per_day))  # yuqoriga yaxlitlash
            return today + timedelta(days=days)

        members = {m.user_id: m for m in project.memberships.filter(is_active=True)}
        names = dict(Specialty.choices)

        member_rows = []
        for uid, item in people.items():
            user = item["user"]
            forecast = finish_date(item["hours_left"])
            member_rows.append({
                "user": UserBriefSerializer(user, context={"request": request}).data,
                "role": members[uid].get_role_display() if uid in members else "",
                "specialty": user.specialty,
                "specialty_display": names.get(user.specialty, user.specialty),
                "open": item["open"], "done": item["done"],
                "in_review": item["in_review"], "overdue": item["overdue"],
                "hours_left": round(item["hours_left"], 1),
                "last_due": item["last_due"],
                "forecast_date": forecast,
                "at_risk": bool(forecast and item["last_due"] and forecast > item["last_due"]),
            })
        member_rows.sort(key=lambda r: (-r["open"], r["user"]["full_name"]))

        groups = {}
        for row in member_rows:
            g = groups.setdefault(row["specialty"], {
                "value": row["specialty"], "label": row["specialty_display"],
                "people": 0, "open": 0, "done": 0, "overdue": 0,
                "hours_left": 0.0, "last_due": None,
            })
            g["people"] += 1
            g["open"] += row["open"]
            g["done"] += row["done"]
            g["overdue"] += row["overdue"]
            g["hours_left"] += row["hours_left"]
            if row["last_due"] and (g["last_due"] is None or row["last_due"] > g["last_due"]):
                g["last_due"] = row["last_due"]

        specialty_rows = []
        for g in groups.values():
            forecast = finish_date(g["hours_left"], g["people"])
            total = g["open"] + g["done"]
            item = dict(g)
            item["hours_left"] = round(g["hours_left"], 1)
            item["forecast_date"] = forecast
            item["progress"] = round(g["done"] * 100 / total) if total else 0
            item["at_risk"] = bool(forecast and g["last_due"] and forecast > g["last_due"])
            specialty_rows.append(item)
        specialty_rows.sort(key=lambda r: -r["open"])

        total_hours = sum(r["hours_left"] for r in member_rows)
        workers = max(len([r for r in member_rows if r["open"]]), 1)
        project_forecast = finish_date(total_hours, workers)

        return Response({
            "today": today,
            "hours_per_day": HOURS_PER_DAY,
            "default_task_hours": DEFAULT_TASK_HOURS,
            "members": member_rows,
            "specialties": specialty_rows,
            "project": {
                "open": project.tasks.exclude(status__in=closed).count(),
                "done": project.tasks.filter(status=TaskStatus.DONE).count(),
                "unassigned": project.tasks.exclude(status__in=closed)
                                     .exclude(assignments__is_active=True).count(),
                "hours_left": round(total_hours, 1),
                "due_date": project.due_date,
                "forecast_date": project_forecast,
                "at_risk": bool(project_forecast and project.due_date
                                and project_forecast > project.due_date),
            },
        })

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
            notify_many(_managers_of(project), NotificationKind.MEMBER_JOINED,
                        title="Jamoaga yangi a'zo qoshildi",
                        body="{} - {} ({})".format(project.name, request.user.full_name,
                                                   _role_label(req.desired_role)),
                        url="/loyiha/{}/jamoa".format(project.pk), actor=request.user,
                        meta={"project": project.pk})
            return Response({"joined": True, "request": JoinRequestSerializer(req).data}, status=201)

        log(actor=request.user, verb="member.requested", project=project, target=request.user,
            summary="{} qoshilish sorovi yubordi".format(request.user.full_name),
            detail=req.message[:500])
        # So'rov javobsiz qolib ketmasin - menejer darrov ko'rsin.
        notify_many(_managers_of(project), NotificationKind.JOIN_REQUEST,
                    title="Qoshilish sorovi: {}".format(project.name),
                    body="{} - {}".format(request.user.full_name,
                                          _role_label(req.desired_role)),
                    url="/loyiha/{}/jamoa".format(project.pk), actor=request.user,
                    meta={"project": project.pk, "request": req.pk})
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
            notify(req.user, NotificationKind.MEMBER_JOINED,
                   title="Loyihaga qabul qilindingiz",
                   body="{} - {}".format(project.name, _role_label(role)),
                   url="/loyiha/{}/brif".format(project.pk), actor=request.user,
                   meta={"project": project.pk})
        else:
            req.status = RequestStatus.REJECTED
            req.save()
            log(actor=request.user, verb="member.rejected", project=project, target=req.user,
                summary="{} sorovi rad etildi".format(req.user.full_name), detail=note)
            notify(req.user, NotificationKind.JOIN_REQUEST,
                   title="Qoshilish sorovi rad etildi",
                   body="{}{}".format(project.name, " - " + note if note else ""),
                   url="/qoshilish", actor=request.user, meta={"project": project.pk})

        return Response(JoinRequestSerializer(req, context={"request": request}).data)


class MyJoinRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """Foydalanuvchining o'z so'rovlari."""

    serializer_class = JoinRequestSerializer

    def get_queryset(self):
        return (JoinRequest.objects.filter(user=self.request.user)
                .select_related("project", "decided_by").order_by("-created_at"))
