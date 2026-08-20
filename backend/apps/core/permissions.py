"""Ruxsatlar qatlami.

Rollar ierarxiyasi:
  ADMIN (tizim)   -> hamma loyihada hamma narsa
  MANAGER         -> oz loyihasini boshqaradi, azo qabul qiladi, task beradi/tekshiradi
  ADMIN (loyiha)  -> loyihada menejer bilan teng, lekin MENEJERGA tegmaydi
  DEVELOPER / QA  -> oziga biriktirilgan tasklarni bajaradi
  VIEWER          -> faqat oqiydi

MENEJER himoyalangan: unga HECH KIM tegmaydi - na loyiha admini, na tizim
admini, na boshqa menejer. Menejer loyihadan faqat OZI chiqadi (`/leave/`),
shundan keyin loyiha menejersiz qoladi va tizim admini yangisini tayinlay
oladi.
"""
from django.db.models import Exists, OuterRef, Q
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from apps.core.queries import object_or_404


class IsPlatformAdmin(permissions.BasePermission):
    message = "Bu amal faqat admin uchun."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.is_platform_admin)


class CanCreateProject(permissions.BasePermission):
    """Loyiha (va ish maydoni) ochish - faqat loyiha menejeri va admin.

    O'qish hammaga ochiq qoladi: dasturchi loyihani ko'radi, unda ishlaydi,
    faqat yangisini ocha olmaydi. Tahrirlash va o'chirish ruxsati bu yerda
    tekshirilmaydi - u loyiha ichidagi rolga bog'liq (`ProjectAccess`).
    """

    message = "Loyiha ochish huquqi faqat loyiha menejeri va adminda."

    def has_permission(self, request, view):
        if getattr(view, "action", None) != "create":
            return True
        user = request.user
        return bool(user and user.is_authenticated
                    and getattr(user, "can_create_project", False))


def ProjectRole_value(name):
    from apps.projects.models import ProjectRole

    return getattr(ProjectRole, name)


def get_membership(user, project):
    """Foydalanuvchining loyihadagi faol azoligi (yoki None).

    `memberships` oldindan yuklangan bo'lsa bazaga borilmaydi: ro'yxatdagi
    har bir loyiha uchun `access` maydoni shu yerdan o'tadi va ilgari har
    safar alohida so'rov yuborilardi.
    """
    if not user or not user.is_authenticated:
        return None
    if "memberships" in getattr(project, "_prefetched_objects_cache", {}):
        for m in project.memberships.all():
            if m.is_active and m.user_id == user.id:
                return m
        return None
    return project.memberships.filter(user=user, is_active=True).select_related("user").first()


def in_workspace(user, project):
    """Foydalanuvchi loyihaning ish maydonida bormi.

    `is_public` loyihani ko'rish uchun shu tekshiruv kerak (`can_view`).
    Maydon egasi ham a'zo hisoblanadi - u a'zolik jadvalida bo'lmasligi mumkin.
    """
    from apps.workspaces.models import WorkspaceMember

    if not user or not user.is_authenticated:
        return False
    ws_id = project.workspace_id
    if not ws_id:
        return False
    workspace = getattr(project, "workspace", None)
    if workspace is not None and workspace.owner_id == user.id:
        return True
    return WorkspaceMember.objects.filter(workspace_id=ws_id, user=user).exists()


def visible_projects_q(user, path=""):
    """Foydalanuvchi ko'ra oladigan loyihalar sharti - `ProjectAccess.can_view` ning
    queryset ko'rinishi.

    `path` - so'rov Project dan boshlanmasa, unga boradigan yo'l
    (`Task` uchun `"project__"`, `Activity` uchun ham shunday).

    NEGA BITTA JOYDA. Ilgari bu shart besh joyda qo'lda takrorlanardi
    (vazifalar, taqvim, tarix kesimi, foydalanuvchi sahifasi, tarix lentasi) va
    hech birida ish maydoni tekshirilmasdi - `Q(is_public=True)` deb yozilar,
    natijada tizimdagi har kim begona jamoaning loyihasini ko'rardi. Shart
    endi bir manbada: birini tuzatib, ikkinchisini esdan chiqarish mumkin emas.
    """
    from apps.projects.models import ProjectMember
    from apps.workspaces.models import WorkspaceMember

    if not user or not user.is_authenticated:
        # Hech narsa ko'rinmaydi. Ochiq (tokensiz) ko'rinish alohida joyda -
        # `apps/core/public.py`.
        return Q(pk__in=[])

    project_ref = "pk" if not path else "project_id"
    member_of = Exists(ProjectMember.objects.filter(
        project=OuterRef(project_ref), user=user, is_active=True))
    in_ws = Exists(WorkspaceMember.objects.filter(
        workspace=OuterRef(path + "workspace_id"), user=user))
    owns_ws = Q(**{path + "workspace__owner": user})
    return member_of | (Q(**{path + "is_public": True}) & (in_ws | owns_ws))


def task_scope_q(user):
    """Vazifa RO'YXATLARIDA kim kimning ishini ko'radi — queryset sharti.

    Ko'rish HUQUQI bilan aralashtirmang: `visible_projects_q` odam qaysi
    loyihaga umuman kira olishini aytadi, bu esa o'sha loyiha ichida unga
    QAYSI ishlar ro'yxatda ko'rinishini aytadi.

    QOIDA: ISHNI BAJARADIGAN odam o'z ishini ko'radi, qolgani hammasini.

      DEVELOPER / QA  - faqat o'ziga biriktirilgan ish;
      menejer, loyiha admini, kuzatuvchi, tizim admini - loyihaning hammasi.

    NEGA SHUNDAY BO'LINDI. Ilgari a'zo bo'lgan loyihaning hamma vazifasi
    ko'rinardi: doska, vazifalar ro'yxati va taqvim dasturchi uchun jamoadagi
    o'nlab begona ish bilan to'lib ketar, o'zinikini orasidan qidirishga
    to'g'ri kelardi. Menejerga esa aksincha butun manzara kerak - u ish
    taqsimlaydi.

    Chegara aynan IJROCHIGA qo'yiladi, "menejer emas hammaga" emas. Sababi
    ikkita: loyiha admini ishni tekshiradi (`can_review`) - ko'rmasa
    tekshira olmaydi; kuzatuvchi esa umuman kuzatish uchun qo'shilgan va
    unda biriktirilgan ish bo'lmaydi, ya'ni uning doskasi butunlay bo'sh
    qolardi va rolning ma'nosi yo'qolardi.

    Bo'linish `ProjectAccess.is_developer` bilan bir xil - interfeysdagi
    izoh ham o'shanga qarab chiziladi.

    Shart TASK queryset iga qo'yiladi (`Task.objects.filter(...)`) - ichkarida
    `OuterRef("pk")` va `OuterRef("project_id")` aynan shunga tayanadi.

    Vazifaning O'ZINI ochish bu shartdan o'tmaydi: bitta vazifa sahifasi
    `check_access` bilan tekshiriladi, ya'ni jamoa a'zosi havola bo'yicha
    hamkasbining ishini ochib ko'ra oladi. Bu yerda gap faqat RO'YXATDA
    nima turishi haqida.
    """
    from apps.projects.models import ProjectMember, ProjectRole
    from apps.tasks.models import TaskAssignment

    if not user or not user.is_authenticated:
        return Q(pk__in=[])
    if user.is_platform_admin:
        return Q()

    executor = Exists(ProjectMember.objects.filter(
        project=OuterRef("project_id"), user=user, is_active=True,
        role__in=[ProjectRole.DEVELOPER, ProjectRole.QA]))
    mine = Exists(TaskAssignment.objects.filter(
        task=OuterRef("pk"), user=user, is_active=True))
    # Ijrochi bo'lmagan loyihada cheklov yo'q; ijrochi bo'lganida - o'ziniki.
    return ~Q(executor) | Q(mine)


def managed_projects_q(user):
    """Odam BOSHQARADIGAN loyihalar sharti - `ProjectAccess.can_manage` ning
    queryset ko'rinishi.

    `visible_projects_q` "qaysi loyihaga kira oladi" ga javob beradi, bu esa
    "qaysi loyiha uchun javobgar" ga. Ikkovi aralashmasin: jamoaning ish
    yuki menejerga ko'rinadi, a'zoga emas.

    Shart PROJECT queryset iga qo'yiladi - ichkaridagi `OuterRef("pk")`
    aynan shunga tayanadi.
    """
    from apps.projects.models import ProjectMember, ProjectRole

    if not user or not user.is_authenticated:
        return Q(pk__in=[])
    if user.is_platform_admin:
        return Q()
    # Loyiha admini ham boshqaradi (`ProjectAccess.can_manage` bilan bir xil),
    # menejer esa a'zolik yozuvisiz ham menejer bo'lishi mumkin.
    manages = Exists(ProjectMember.objects.filter(
        project=OuterRef("pk"), user=user, is_active=True,
        role__in=[ProjectRole.MANAGER, ProjectRole.ADMIN]))
    return Q(manager=user) | manages


def tasks_limited_for(user):
    """Odamning ro'yxatlari birortasida qirqilyaptimi (`True`/`False`).

    Interfeys shu asosda "faqat sizga biriktirilgan ishlar" deb yozib
    qo'yadi - aks holda dasturchi 45 ta vazifadan ikkitasini ko'rib
    "ro'yxat buzilibdi" deb o'ylaydi.

    Shartdan ALOHIDA, chunki javob bazaga qo'shimcha so'rov qiladi: uni
    faqat haqiqatan ko'rsatadigan joy (taqvim) to'laydi. Doska va vazifalar
    ro'yxatiga bu kerak emas - ular loyiha ichida turadi va javobda
    allaqachon keladigan `access.is_developer` dan bilib oladi.
    """
    from apps.projects.models import ProjectMember, ProjectRole

    if not user or not user.is_authenticated or user.is_platform_admin:
        return False
    return ProjectMember.objects.filter(
        user=user, is_active=True,
        role__in=[ProjectRole.DEVELOPER, ProjectRole.QA],
        project__deleted_at__isnull=True).exists()


class ProjectAccess:
    """Bitta joyda jamlangan ruxsat javoblari."""

    def __init__(self, user, project):
        from apps.projects.models import ProjectRole

        self.user = user
        self.project = project
        self.membership = get_membership(user, project)
        self.role = self.membership.role if self.membership else None
        self.is_admin = bool(user and user.is_authenticated and user.is_platform_admin)
        self.is_manager = (self.role == ProjectRole.MANAGER
                           or project.manager_id == getattr(user, "id", None))
        self.is_project_admin = self.role == ProjectRole.ADMIN
        self.is_developer = self.role in (ProjectRole.DEVELOPER, ProjectRole.QA)
        self.is_member = self.membership is not None
        # `can_view` bir necha marta so'raladi (`as_dict` ham chaqiradi) -
        # ish maydoni a'zoligi uchun bazaga ko'pi bilan bir marta boriladi.
        self._in_workspace = None

    @property
    def can_view(self):
        """Loyihani ochib ko'rish huquqi.

        `is_public` - modelda ham shunday nomlangan: «ISH MAYDONI ICHIDA
        ochiq». Ilgari maydon a'zoligi tekshirilmasdi, ya'ni tizimda
        ro'yxatdan o'tgan har qanday odam begona jamoaning loyihasini,
        vazifalarini, brifini va hujjatlar ro'yxatini o'qiy olardi.

        Bosh sahifadagi ochiq qidiruv bundan ALOHIDA: u `apps/core/public.py`
        da va faqat xavfsiz maydonlarni beradi (a'zolar, vazifalar, fayllar
        chiqmaydi). Ya'ni "platformada nima bor" ko'rinib turadi, ichiga esa
        maydon a'zosi kiradi.
        """
        if self.is_admin or self.is_member:
            return True
        if not self.project.is_public:
            return False
        if self._in_workspace is None:
            self._in_workspace = in_workspace(self.user, self.project)
        return self._in_workspace

    @property
    def can_manage(self):
        """Azolarni qabul qilish/chiqarish, loyiha sozlamalari, fayl ochirish."""
        return self.is_admin or self.is_manager or self.is_project_admin

    @property
    def can_create_task(self):
        return self.can_manage

    @property
    def can_delete_task(self):
        return self.can_manage

    @property
    def can_review(self):
        """Taskni tekshirib qabul qilish yoki qaytarish."""
        return self.can_manage

    @property
    def can_appoint_admin(self):
        """Azoni tizim admini qilib tayinlash - faqat menejer (va tizim admini)."""
        return self.is_admin or self.is_manager

    @property
    def can_work(self):
        """Task statusini surish, izoh, worklog va fayl yuklash."""
        return self.can_manage or self.is_developer

    # ------------------------------------------------------------ azolar
    def is_manager_member(self, member):
        return (member.role == ProjectRole_value("MANAGER")
                or member.user_id == self.project.manager_id)

    def can_change_member(self, member):
        """Shu azoga tegish mumkinmi: chiqarish yoki rolini ozgartirish.

        MENEJERGA HECH KIM TEGMAYDI - na loyiha admini, na tizim admini, na
        BOSHQA MENEJER.

        Ilgari boshqa menejer tega olardi va bu himoyani amalda bekor
        qilardi: ikkinchi menejer tayinlangan zahoti u birinchisini
        chiqarib yubora olardi, ya'ni "menejerni faqat menejer chiqaradi"
        degan qoida "menejerni har qanday menejer chiqaradi" ga aylanardi.

        Menejerlik faqat odamning O'Z qaroridan tugaydi (`/leave/`).
        Keyin loyiha menejersiz qoladi va tizim admini yangisini tayinlaydi
        (`can_grant_role` dagi istisno) - loyiha boshqaruvsiz muzlab
        qolmasin.
        """
        if not self.can_manage:
            return False
        return not self.is_manager_member(member)

    def can_grant_role(self, role):
        """MENEJER rolini faqat menejer bera oladi.

        Istisno: loyiha menejersiz qolgan bolsa, tizim admini yangi menejer
        tayinlaydi - aks holda loyiha boshqaruvsiz muzlab qoladi.
        """
        if role == ProjectRole_value("MANAGER"):
            return self.is_manager or (self.is_admin and not self.project.has_active_manager)
        return self.can_manage

    @property
    def label(self):
        if self.is_admin:
            return "Tizim admini"
        if self.membership:
            return self.membership.get_role_display()
        return "Mehmon"

    def as_dict(self):
        return {
            "role": self.role,
            "role_label": self.label,
            "is_admin": self.is_admin,
            "is_manager": self.is_manager,
            "is_project_admin": self.is_project_admin,
            # Ijrochimi - ro'yxatlar shunga qarab qirqiladi (`task_scope_q`)
            # va interfeys buni yozib qo'yadi.
            "is_developer": self.is_developer,
            "is_member": self.is_member,
            "can_view": self.can_view,
            "can_manage": self.can_manage,
            "can_create_task": self.can_create_task,
            "can_delete_task": self.can_delete_task,
            "can_review": self.can_review,
            "can_work": self.can_work,
            "can_appoint_admin": self.can_appoint_admin,
            "can_grant_manager": self.can_grant_role(ProjectRole_value("MANAGER")),
        }


def require_project(user, project_id, need="view"):
    """Loyihani olib, kerakli ruxsatni tekshiradi. (project, access) qaytaradi."""
    from apps.projects.models import Project

    project = object_or_404(
        Project.objects.select_related("workspace", "manager", "created_by"), pk=project_id
    )
    access = check_access(user, project, need)
    return project, access


def check_access(user, project, need="view"):
    access = ProjectAccess(user, project)
    allowed = {
        "view": access.can_view,
        "manage": access.can_manage,
        "task": access.can_create_task,
        "review": access.can_review,
        "work": access.can_work,
    }[need]
    if not allowed:
        raise PermissionDenied("Bu amal uchun ruxsatingiz yoq.")
    return access
