from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import GlobalRole
from apps.activity.services import log
from apps.core.permissions import (CanCreateProject, ProjectAccess, check_access,
                                    task_scope_q, tasks_limited_for, visible_projects_q)
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many, send_to_users
from apps.core.queries import object_or_404, related_count
from apps.core.uploads import check_uploads
from apps.tasks.models import Task, TaskAssignment, TaskStatus
from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRole

from .models import (JoinRequest, Project, ProjectBrief, ProjectFile,
                     ProjectFileVersion, ProjectMember,
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


def live_project(project, action, actor=None, **extra):
    """Loyihada nimadir o'zgardi degan signal - ochiq sahifalar o'zini yangilaydi.

    Bildirishnoma emas: bazaga yozilmaydi, qo'ng'iroq chalmaydi. Fayl
    yuklandimi, a'zo qo'shildimi - jamoaning ochiq turgan «Fayllar»,
    «Jamoa», «Muddatlar» sahifalari shu signaldan keyin yangilanadi.
    """
    payload = {
        "event": "project.update",
        "action": action,
        "project": project.pk,
        "actor": getattr(actor, "pk", None),
    }
    payload.update(extra)
    send_to_users(_active_people(project), payload)


def _active_people(project):
    return [m.user for m in project.memberships.filter(is_active=True).select_related("user")]


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
        # Bekor qilinganlardan tashqari hammasi - `progress()` shuni ishlatadi
        # va shu tufayli har loyiha uchun ikkita COUNT yubormaydi.
        "total_tasks": related_count(Task, group_by="project",
                                     status__in=[s for s in TaskStatus.values
                                                 if s != TaskStatus.CANCELLED]),
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


def _check_doc_date(project, value):
    """Hujjat sanasi loyiha oralig'idan chiqib ketmasin.

    Loyiha boshlanishidan oldingi yoki muddatidan keyingi sana deyarli har
    doim xato yozuv: odam yilni chalkashtirgan yoki bugungi sanani qo'yib
    yuborgan. Bunday hujjat keyin taqvimda ham, tartibda ham noto'g'ri
    joyda turadi.

    Loyihada chegara qo'yilmagan bo'lsa (`start_date` yoki `due_date` bo'sh),
    o'sha tomon tekshirilmaydi - yo'q chegarani talab qilib bo'lmaydi.
    """
    if value is None:
        return
    # `doc_date` - sana+soat, loyiha chegaralari esa sana. Solishtirishdan
    # oldin MAHALLIY (Toshkent) kunga keltiramiz: aks holda kechqurun
    # 23:00 da qo'yilgan hujjat UTC da ertangi kunga o'tib, chegaraga
    # tegib qolardi.
    day = timezone.localtime(value).date() if timezone.is_aware(value) else value.date()
    if project.start_date and day < project.start_date:
        raise ValidationError({"doc_date": "Hujjat sanasi loyiha boshlanishidan ({}) oldin bo'lmasin.".format(
            project.start_date.strftime("%d.%m.%Y"))})
    if project.due_date and day > project.due_date:
        raise ValidationError({"doc_date": "Hujjat sanasi loyiha muddatidan ({}) keyin bo'lmasin.".format(
            project.due_date.strftime("%d.%m.%Y"))})


def _replace_document(current, upload, actor, content_type, note, doc_date=None):
    """Hujjatning joriy nusxasini tarixga kochirib, ornini yangisiga beradi.

    Fayl BAYTLARI kochirilmaydi: yangi `ProjectFileVersion` qatoriga eskisining
    saqlash yoli beriladi, ya'ni diskda nusxa kopaymaydi va eski havola
    ishlayveradi. Keyin `ProjectFile` yangi faylga otadi va versiyasi oshadi.
    """
    ProjectFileVersion.objects.create(
        document=current,
        version=current.version,
        file=current.file.name,          # bayt emas, yol
        original_name=current.original_name,
        size=current.size,
        content_type=current.content_type,
        description=current.description,
        doc_date=current.doc_date,
        uploaded_by=current.uploaded_by,
        created_at=current.created_at,
        replaced_by=actor,
    )
    current.file = upload
    current.version += 1
    current.size = getattr(upload, "size", 0) or 0
    current.content_type = content_type
    if note:
        current.description = note
    # Sana ko'rsatilmasa eskisi qoladi - izoh bilan bir xil qoida. Aks holda
    # faylni tez almashtirgan odam hujjat sanasini bilmasdan yo'qotib qo'yardi.
    if doc_date:
        current.doc_date = doc_date
    current.uploaded_by = actor
    current.save(update_fields=["file", "version", "size", "content_type",
                                "description", "doc_date", "uploaded_by", "updated_at"])
    return current


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    # Loyiha ochish - faqat loyiha menejeri va admin (`CanCreateProject`).
    permission_classes = [permissions.IsAuthenticated, CanCreateProject]
    # `search_fields` yo'q: qidiruv `get_queryset` da qo'lda bajariladi, chunki
    # unga loyiha HUJJATLARINING nomi ham kiradi - buni DRF `SearchFilter` i
    # `.distinct()` bilan qilardi, Db2 esa CLOB ustunda uni qo'llamaydi.
    ordering_fields = ["created_at", "updated_at", "name", "due_date"]
    # Ochilgan sanasi boyicha, yangisi tepada. `-updated_at` da royxat har
    # tegilganda joyini ozgartirib, odam loyihasini qayerdan qidirishni
    # bilmay qolardi; ochilish sanasi esa ozgarmaydi - tartib turgun boladi.
    ordering = ["-created_at"]

    # ------------------------------------------------------------ queryset
    def get_queryset(self):
        user = self.request.user
        # `specialties` va `memberships` seriyalizatorda har loyiha uchun
        # o'qiladi (kerakli yo'nalishlar, jamoa tarkibi, ruxsatlar). Oldindan
        # yuklanmasa har biri alohida so'rov bo'lardi - ro'yxat uzayganda
        # so'rovlar soni loyihalar soniga ko'payib ketardi.
        qs = (Project.objects
              .select_related("workspace", "manager", "created_by")
              .prefetch_related("specialties", "memberships__user")
              .annotate(**project_counters(user)))
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
            # "Qo'shilish uchun loyiha izlash" - o'z ish maydonlari ichida.
            # Butun platformadagi ochiq loyihalar bosh sahifadagi ochiq
            # qidiruvda (`/api/public/projects/`) qoladi.
            qs = (qs.filter(visible_projects_q(user))
                  .filter(is_public=True)
                  .exclude(status="ARCHIVED").exclude(member_of()))
        elif scope == "managed":
            qs = qs.filter(Q(manager=user) | member_of(role=ProjectRole.MANAGER))
        elif scope == "visible":
            # «Loyihalar» sahifasidagi YAGONA ro'yxat - kesim tugmalari
            # olib tashlangandan keyingi qamrov: odam ocha oladigan hamma
            # loyiha. Ilgari uchta tugma («Meniki», «Boshqaruvim», «Ochiq»)
            # bir xil ro'yxatni uch bo'lakka bo'lib turardi va menejer o'z
            # loyihasini «Meniki» da topolmasdi - u a'zo emas, boshqaruvchi.
            #
            # Chegara kengaymadi: `visible_projects_q` - `ProjectAccess`
            # ning queryset ko'rinishi, ya'ni bu yerda ham o'sha qoida.
            # `manager` alohida qo'shiladi: menejerda a'zolik yozuvi
            # bo'lmasligi mumkin.
            if not user.is_platform_admin:
                qs = qs.filter(visible_projects_q(user) | Q(manager=user))
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

        # Qidiruv: nom, kalit, tavsif va LOYIHA HUJJATLARINING nomi. Odam
        # ko'pincha loyihani nomidan emas, undagi hujjatdan eslaydi -
        # "texnik topshiriq qaysi loyihada edi?" degan savolga javob beradi.
        # Fayl nomi bog'liq jadvalda, shuning uchun yuqoridagi `Exists()`
        # qoidasi: JOIN qatorlarni takrorlaydi, `.distinct()` esa Db2 da
        # CLOB (`description`) tufayli SQL0134N bilan yiqiladi.
        needle = (self.request.query_params.get("search") or "").strip()
        if needle:
            qs = qs.filter(
                Q(name__icontains=needle)
                | Q(key__icontains=needle)
                | Q(description__icontains=needle)
                | Exists(ProjectFile.objects.filter(
                    project=OuterRef("pk"), original_name__icontains=needle))
            )
        return qs

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "update", "partial_update"):
            return ProjectDetailSerializer
        return ProjectSerializer

    def get_object(self):
        # Ro'yxatdagi kabi: yo'nalishlar va a'zolar seriyalizatorda bir necha
        # marta o'qiladi (tarkib, kamchilik, ruxsatlar) - bir marta olamiz.
        # `annotate` ro'yxatdagi bilan bir xil bo'lishi shart: usiz
        # seriyalizatordagi `member_count`, `open_tasks` kabi maydonlar
        # javobdan jimgina tushib qolardi (read-only maydon atributi yo'q
        # bo'lsa DRF uni xatosiz tashlab yuboradi) va loyiha sahifasida
        # "50% bajarildi - ochiq - azo" kabi sonsiz satr chiqardi.
        project = object_or_404(
            Project.objects
            .select_related("workspace", "manager", "created_by")
            .prefetch_related("specialties", "memberships__user")
            .annotate(**project_counters(self.request.user)),
            pk=self.kwargs["pk"])
        need = "view" if self.request.method in ("GET", "HEAD", "OPTIONS") else "manage"
        check_access(self.request.user, project, need)
        return project

    # ------------------------------------------------------------ CRUD
    # Bu yerda oltita yozuv ketma-ket yaratiladi. Biri o'tib, ikkinchisi
    # yiqilsa - menejersiz loyiha qolib ketardi, ya'ni uni hech kim
    # boshqara olmasdi. Shuning uchun hammasi bitta tranzaksiyada.
    @transaction.atomic
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

    @transaction.atomic
    def perform_update(self, serializer):
        manager_id = serializer.validated_data.pop("manager_id", None)
        project = serializer.save(**({"manager_id": manager_id} if manager_id else {}))
        if manager_id:
            ProjectMember.objects.update_or_create(
                project=project, user_id=manager_id,
                defaults={"role": ProjectRole.MANAGER, "is_active": True})
        log(actor=self.request.user, verb="project.updated", project=project, target=project,
            summary="Loyiha sozlamalari yangilandi")

    def destroy(self, request, *args, **kwargs):
        """Tugallanmagan ish bo'lsa o'chirishni TO'SADI - avval tasdiq kerak.

        Birinchi so'rov 409 bilan qaytadi va ichida sanoq keladi: nechta ish
        jarayonda, nechtasi tekshiruvda. Ekranda aynan shu raqamlar qizil
        yozuv bo'lib chiqadi. Odam ko'rib turib rozi bo'lsa, ikkinchi so'rov
        `?confirm=1` bilan keladi va loyiha o'chadi.

        Tekshiruv SERVERDA: brauzerdagi oyna kod bilan ham, boshqa mijoz
        bilan ham chetlab o'tilishi mumkin. Ilgari loyiha jarayondagi ishlari
        bilan birga bir bosishda yo'q bo'lardi.
        """
        project = self.get_object()
        confirmed = str(request.query_params.get("confirm", "")).lower() in ("1", "true", "yes")
        if not confirmed:
            live = (Task.objects.filter(project=project)
                    .exclude(status__in=[TaskStatus.DONE, TaskStatus.CANCELLED]))
            counts = {row["status"]: row["n"] for row in
                      live.values("status").annotate(n=Count("id"))}
            total = sum(counts.values())
            if total:
                # Ruxsatni ham shu yerda tekshiramiz: begona odamga loyihada
                # nechta ish borligini aytib qo'ymaylik.
                access = ProjectAccess(request.user, project)
                if not (access.is_admin or access.is_manager):
                    raise PermissionDenied(
                        "Loyihani faqat loyiha menejeri yoki admin ochira oladi.")
                return Response({
                    "detail": ("Loyihada {} ta tugallanmagan ish bor. Ochirish uchun "
                               "tasdiqlash kerak.".format(total)),
                    "needs_confirm": True,
                    "open_tasks": total,
                    "in_progress": counts.get(TaskStatus.IN_PROGRESS, 0),
                    "in_review": counts.get(TaskStatus.IN_REVIEW, 0),
                    "todo": counts.get(TaskStatus.TODO, 0),
                    "blocked": counts.get(TaskStatus.BLOCKED, 0),
                    "changes_requested": counts.get(TaskStatus.CHANGES_REQUESTED, 0),
                }, status=409)
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        """Loyihani o'chirish - loyiha menejeri yoki tizim admini.

        Loyiha admini o'chira olmaydi: u kundalik boshqaruv uchun, butun
        loyihani yo'q qilish esa egasining qarori.

        O'chirish YUMSHOQ: yozuv bazada `deleted_at` bilan qoladi, ro'yxatlarda
        va qidiruvda ko'rinmaydi. Vazifa, fayl, izoh va tarix o'chmaydi -
        kerak bo'lsa admin panelidan qaytarish mumkin.

        Tugallanmagan ish bo'lsa o'chirish `destroy` da to'siladi - avval
        tasdiq so'raladi (`?confirm=1`).
        """
        access = ProjectAccess(self.request.user, instance)
        if not (access.is_admin or access.is_manager):
            raise PermissionDenied("Loyihani faqat loyiha menejeri yoki admin ochira oladi.")

        log(actor=self.request.user, verb="project.deleted", workspace=instance.workspace,
            summary="Loyiha ochirildi: " + instance.name,
            meta={"project": instance.pk, "key": instance.key})
        # Yozuv bazadan yo'qolmaydi: vazifalar, fayllar va tarix joyida qoladi.
        live_project(instance, "deleted", self.request.user)
        instance.soft_delete(self.request.user)

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
        live_project(project, "brief", request.user)
        return Response(s.data)

    def _manage_project(self, pk, need="manage"):
        project = object_or_404(Project, pk=pk)
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
        """Jamoaga qoshish - TOGRIDAN-TOGRI, tasdiqsiz.

        Menejer odamni tanlaydi va u ayni shu paytda azo boladi. Qoida
        `apps.core.team` da - `/api/team/add/` ham oshanga tayanadi, shunda
        ikki endpoint ikki xil ishlab ketmaydi.
        """
        from apps.core.team import add_to_project

        project = self._manage_project(pk)
        target = object_or_404(User, pk=request.data.get("user_id"), is_active=True)
        member = add_to_project(request.user, project, target, request.data.get("role"))

        live_project(project, "member", request.user)
        return Response(ProjectMemberSerializer(member, context={"request": request}).data,
                        status=201)

    @action(detail=True, methods=["post"], url_path="members/(?P<member_id>[^/.]+)")
    def member_action(self, request, pk=None, member_id=None):
        """action=role|remove|appoint_admin"""
        project = self._manage_project(pk)
        member = object_or_404(ProjectMember, pk=member_id, project=project)
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
        live_project(project, "member", request.user)
        return Response(ProjectMemberSerializer(member, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        project = object_or_404(Project, pk=pk)
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

    # ------------------------------------------------------------ taqvim
    @action(detail=False, methods=["get"], url_path="calendar")
    def calendar(self, request):
        """Oylik taqvim: shu oyning qaysi kunida NIMANING MUDDATI tugaydi.

        `?month=YYYY-MM` (bo'sh bo'lsa - joriy oy).

        Taqvimda faqat TUGASH sanalari turadi - loyiha ham, vazifa ham o'z
        muddati kuniga qo'yiladi. Ilgari har biri boshlanishdan muddatgacha
        tasma bo'lib cho'zilardi: oy tasmalar bilan to'lib ketar, "shu kuni
        nima topshirilishi kerak" degan savolga esa javob topib bo'lmasdi.

        Muddati qo'yilmagan loyiha va vazifa taqvimda umuman turmaydi -
        uni qo'yadigan kun yo'q.
        """
        from calendar import monthrange
        from datetime import date, datetime, time as dtime, timedelta

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
        seen = Project.objects.filter(deleted_at__isnull=True)
        if not user.is_platform_admin:
            seen = seen.filter(visible_projects_q(user))
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

        task_rows = []
        tasks = (Task.objects
                 .filter(task_scope_q(user), project_id__in=visible_ids,
                         due_date__gte=span_start, due_date__lt=span_end)
                 .exclude(status=TaskStatus.CANCELLED)
                 .select_related("project")
                 .prefetch_related("assignments__user"))
        for task in tasks:
            finish = as_date(task.due_date)

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

        # `count` - o'sha kuni nechta loyiha MUDDATI tugashi.
        days = [{"date": first + timedelta(days=i),
                 "count": counts.get(first + timedelta(days=i), 0)}
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

    # ------------------------------------------------------------ loyiha fayllari
    @action(detail=True, methods=["get", "post"], url_path="files",
            parser_classes=[MultiPartParser, FormParser, JSONParser])
    def files(self, request, pk=None):
        """GET - hujjatlar royxati (loyihani kora oladigan hamma koradi);
        POST - fayl yuklash (multipart/form-data, faqat jamoa)."""
        project = object_or_404(Project, pk=pk)

        if request.method == "GET":
            # Hujjat - loyihaning yuzi: texnik topshiriq va dizaynni kormasdan
            # turib odam bu loyiha ozigami-yoqmi deb qaror qila olmaydi.
            # Shuning uchun OQISH loyihani korish huquqi bilan bir xil:
            # ochiq loyihada tizimdagi hamma koradi, yopiqda faqat jamoa.
            # YOZISH (yuklash va ochirish) pastda - u jamoa ichida qoladi.
            check_access(request.user, project, "view")
            qs = (project.files.select_related("uploaded_by")
                  .prefetch_related("versions__uploaded_by", "versions__replaced_by"))
            return Response(ProjectFileSerializer(qs, many=True,
                                                  context={"request": request}).data)

        check_access(request.user, project, "work")
        uploads = request.FILES.getlist("file") or request.FILES.getlist("files")
        if not uploads:
            raise ValidationError({"file": "Fayl tanlanmagan."})
        check_uploads(uploads)

        # NOM VA SANA MAJBURIY. Nomsiz hujjat ro'yxatda "shartnoma_final_2.pdf"
        # bo'lib turadi va uni faqat yuklagan odam taniydi; sanasiz esa qaysi
        # variant yangi ekanini ayta olmaydi. Ikkovi ham serverda talab
        # qilinadi - brauzerdagi tekshiruv chetlab o'tilishi mumkin.
        note = (request.data.get("description") or "").strip()
        if not note:
            raise ValidationError({"description": "Hujjat nomini (izohini) yozing."})
        # Hujjat sanasi (`doc_date`) fayllar bilan BIR TARTIBDA keladi: har
        # fayl uchun bittadan. Bitta sana yuborilsa - u butun to'plamga
        # tegishli. Umuman kelmasa - sana ko'rsatilmagan.
        dates = (request.data.getlist("doc_date")
                 if hasattr(request.data, "getlist") else [])
        created, updated = [], []
        for i, f in enumerate(uploads):
            raw_date = dates[0] if len(dates) == 1 else (dates[i] if i < len(dates) else "")
            if not raw_date:
                raise ValidationError({"doc_date": "Hujjat sanasini korsating."})
            ser = ProjectFileSerializer(
                data={"file": f, "description": note, "doc_date": raw_date or None},
                context={"request": request})
            ser.is_valid(raise_exception=True)
            _check_doc_date(project, ser.validated_data.get("doc_date"))
            ctype = (getattr(f, "content_type", "") or "")[:120]
            name = (getattr(f, "name", "") or "").rsplit("/", 1)[-1][:255]

            # Ayni nomli hujjat bor bolsa - bu YANGI NUSXA, yangi qator emas.
            # Eskisi tarixda qoladi va ochilaveradi (`ProjectFileVersion`).
            current = project.files.filter(original_name=name).first()
            if current is None:
                created.append(ser.save(project=project, uploaded_by=request.user,
                                        content_type=ctype))
                continue

            updated.append(_replace_document(current, f, request.user, ctype, note,
                                             ser.validated_data.get("doc_date")))

        touched = created + updated
        if created:
            log(actor=request.user, verb="project.file", project=project, target=project,
                summary="{} ta hujjat yuklandi".format(len(created)),
                detail=", ".join(x.original_name for x in created),
                meta={"files": [{"name": x.original_name, "size": x.size} for x in created]})
        for doc in updated:
            log(actor=request.user, verb="project.file", project=project, target=project,
                summary="Hujjat yangilandi: {} (v{})".format(doc.original_name, doc.version),
                detail="Eski nusxa tarixda qoldi - v{}".format(doc.version - 1),
                meta={"file": doc.original_name, "version": doc.version})

        live_project(project, "file", request.user, count=len(touched))
        return Response(ProjectFileSerializer(touched, many=True,
                                              context={"request": request}).data, status=201)

    @action(detail=True, methods=["patch", "delete"], url_path="files/(?P<file_id>[^/.]+)")
    def file_detail(self, request, pk=None, file_id=None):
        """Hujjatni tahrirlash (PATCH) yoki ochirish (DELETE).

        KIM TEGA OLADI: hujjatni YUKLAGAN odam ozinikiga, loyiha menejeri,
        loyiha admini va tizim admini esa hammasiga. Ilgari yuklagan odam
        ozi qoygan faylga ham tega olmasdi - xato nom yoki sana yozib
        qoysa, menejerni bezovta qilishga togri kelardi.

        PATCH da faqat NOM (izoh) va HUJJAT SANASI ozgaradi. Faylning ozini
        almashtirish alohida yol bilan: ayni nomli faylni qayta yuklash yangi
        versiya ochadi va eskisi tarixda qoladi.
        """
        project = object_or_404(Project, pk=pk)
        item = object_or_404(ProjectFile, pk=file_id, project=project)
        access = ProjectAccess(request.user, project)
        mine = item.uploaded_by_id == request.user.pk
        if not (access.can_manage or mine):
            raise PermissionDenied(
                "Hujjatga faqat uni yuklagan odam yoki loyiha menejeri tega oladi.")

        if request.method == "PATCH":
            ser = ProjectFileSerializer(item, data=request.data, partial=True,
                                        context={"request": request})
            ser.is_valid(raise_exception=True)
            note = (ser.validated_data.get("description", item.description) or "").strip()
            doc_date = ser.validated_data.get("doc_date", item.doc_date)
            if not note:
                raise ValidationError({"description": "Hujjat nomini (izohini) yozing."})
            if not doc_date:
                raise ValidationError({"doc_date": "Hujjat sanasini korsating."})
            _check_doc_date(project, doc_date)

            before = (item.description, item.doc_date)
            item.description = note
            item.doc_date = doc_date
            item.save(update_fields=["description", "doc_date", "updated_at"])
            if before != (note, doc_date):
                log(actor=request.user, verb="project.file", project=project, target=project,
                    summary="Hujjat malumoti ozgardi: " + (item.original_name or ""),
                    # Sana MAHALLIY vaqtda yoziladi: xom `datetime` tarixda
                    # "2026-03-05 06:00:00+00:00" bo'lib chiqardi - odam uni
                    # ekranda ko'rgan soat bilan bog'lay olmasdi.
                    detail="{} · {}".format(
                        note, timezone.localtime(doc_date).strftime("%d.%m.%Y %H:%M")))
                live_project(project, "file", request.user, count=1)
            return Response(ProjectFileSerializer(item, context={"request": request}).data)

        name = item.original_name
        # Yumshoq o'chirish: hujjat ham, uning eski nusxalari ham diskda va
        # bazada qoladi. Ilgari baytlar o'chirilardi va hujjatni qaytarish
        # imkoni yo'q edi - versiyalar tarixi ham u bilan ketardi.
        item.soft_delete(request.user)
        log(actor=request.user, verb="project.file_deleted", project=project, target=project,
            summary="Fayl ochirildi: " + name)
        live_project(project, "file_deleted", request.user)
        return Response(status=204)

    # ------------------------------------------------------------ muddat bashorati
    @action(detail=True, methods=["get"])
    def forecast(self, request, pk=None):
        """Muddatlar: kimda nima bor va qachonga belgilangan.

        Bu yerda TAXMIN yo'q. Avval "rejalashtirilgan soat" bo'lmagan vazifaga
        4 soat deb qo'yilardi va shu soatdan "taxminan tugaydi" sanasi
        chiqarilardi - ya'ni sahifada odam kiritmagan sanalar turardi. Endi
        faqat bazadagi haqiqiy ma'lumot ko'rsatiladi: kiritilgan boshlanish va
        tugash sanalari, ochiq/bajarilgan vazifalar soni va kechikkanlar.
        """
        from apps.accounts.serializers import UserBriefSerializer
        from datetime import datetime

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

    # ------------------------------------------------------------ qoshilish sorovlari
    @action(detail=True, methods=["post"], url_path="join")
    def join(self, request, pk=None):
        project = object_or_404(Project.objects.select_related("workspace"), pk=pk)
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
        req = object_or_404(JoinRequest, pk=req_id, project=project)
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
            # Menejer rolini kim bera olishi - umumiy qoida (`can_grant_role`).
            # Ilgari bu yerda tekshirilmasdi: loyiha admini so'rovni tasdiqlash
            # orqali yangi MENEJER yasay olardi, u esa amaldagi menejerni
            # chiqarib yuborishga huquqli bo'lardi. So'rovchining o'zi menejer
            # rolini so'ray olmaydi (serializator to'sadi) - qaror qabul
            # qiluvchi ham shu qoidadan chetda qolmasin.
            if not ProjectAccess(request.user, project).can_grant_role(role):
                raise PermissionDenied(
                    "Menejer rolini faqat amaldagi menejer bera oladi.")
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
            notify(req.user, NotificationKind.JOIN_REQUEST,
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

        live_project(project, "member", request.user)
        return Response(JoinRequestSerializer(req, context={"request": request}).data)


class MyJoinRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """Foydalanuvchining o'z so'rovlari."""

    serializer_class = JoinRequestSerializer

    def get_queryset(self):
        return (JoinRequest.objects.filter(user=self.request.user)
                .select_related("project", "decided_by").order_by("-created_at"))
