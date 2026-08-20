import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.urls import reverse
from django.utils import timezone

from apps.core.softdelete import SoftDeleteModel


# Loyiha rangi foydalanuvchidan sorlmaydi - shu palitradan avtomatik tanlanadi.
PROJECT_COLORS = [
    "#2f81f7", "#a371f7", "#3fb950", "#d29922", "#f778ba",
    "#00b8d9", "#ff7b72", "#56d364", "#79c0ff", "#db6d28",
]


def make_join_code():
    return secrets.token_hex(4).upper()


class ProjectRole(models.TextChoices):
    MANAGER = "MANAGER", "Loyiha menejeri"
    # Loyihada menejer bilan deyarli teng huquqli, lekin MENEJERGA tegmaydi:
    # uni chiqara ham, roli o'zgartira ham olmaydi.
    ADMIN = "ADMIN", "Loyiha admini"
    DEVELOPER = "DEVELOPER", "Dasturchi"
    QA = "QA", "Tester (QA)"
    VIEWER = "VIEWER", "Kuzatuvchi"


class ProjectStatus(models.TextChoices):
    PLANNING = "PLANNING", "Rejalashtirilmoqda"
    ACTIVE = "ACTIVE", "Faol"
    PAUSED = "PAUSED", "Toxtatilgan"
    DONE = "DONE", "Yakunlangan"
    ARCHIVED = "ARCHIVED", "Arxivlangan"


class RequestStatus(models.TextChoices):
    PENDING = "PENDING", "Kutilmoqda"
    APPROVED = "APPROVED", "Qabul qilindi"
    REJECTED = "REJECTED", "Rad etildi"
    CANCELLED = "CANCELLED", "Bekor qilindi"


class AliveProjectManager(models.Manager):
    """Standart menejer: o'chirilgan loyihalarni ko'rsatmaydi.

    Saytdan «o'chirish» bosilganda yozuv bazadan yo'qolmaydi - faqat
    `deleted_at` belgilanadi. Shu tufayli vazifalar, fayllar va tarix
    joyida qoladi va kerak bo'lsa loyihani qaytarib bo'ladi
    (`Project.all_objects` yoki admin panel orqali).
    """

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Project(models.Model):
    workspace = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE,
                                  related_name="projects", verbose_name="Ish maydoni")
    name = models.CharField("Loyiha nomi", max_length=140)
    key = models.CharField("Kalit", max_length=10, blank=True,
                           help_text="Vazifa raqamlari uchun prefiks (avtomatik yaratiladi)")
    description = models.TextField("Tavsif", blank=True)
    status = models.CharField("Holat", max_length=20, choices=ProjectStatus.choices,
                              default=ProjectStatus.ACTIVE)
    color = models.CharField("Rang", max_length=9, blank=True, default="",
                             help_text="Tizim ozi tanlaydi - ish maydonidagi loyihalar ajralib tursin")

    manager = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                null=True, blank=True, related_name="managed_projects",
                                verbose_name="Loyiha menejeri")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name="created_projects")

    repo_url = models.URLField("Repozitoriy (GitHub)", blank=True)
    docs_url = models.URLField("Hujjatlar", blank=True)

    start_date = models.DateField("Boshlanish", null=True, blank=True)
    due_date = models.DateField("Muddat", null=True, blank=True)


    # IKKI XIL «OCHIQ» - ATAYLAB IKKITA MAYDON.
    #
    # Ilgari bittasi edi va u ikkita butunlay boshqa savolga javob berardi:
    # «ish maydonidagi hamkasb buni ko'ra oladimi?» va «internetdagi
    # notanish odam buni ko'ra oladimi?». Maydonning nomi ham, yorlig'i ham
    # birinchisini aytardi, formada esa u umuman ko'rsatilmasdi va standarti
    # `True` edi - ya'ni har bir yangi loyihaning nomi, tavsifi va menejeri
    # `GET /api/public/projects/` orqali TOKENSIZ ko'rinib turardi va buni
    # hech kim tanlamagan edi.
    #
    # Endi savol ikkita, javob ham ikkita.
    is_public = models.BooleanField(
        "Ish maydoni ichida ochiq", default=True,
        help_text="Ochiq bolsa ish maydonidagi hamma korib, qoshilish sorovi "
                  "yubora oladi. Maydondan tashqariga chiqmaydi.")
    # Standarti `False`: platformadan tashqariga chiqarish - AYTIB
    # bajariladigan amal, unutilib qoladigan standart emas.
    is_listed = models.BooleanField(
        "Ochiq qidiruvda korinsin", default=False,
        help_text="Belgilansa loyiha bosh sahifadagi ochiq qidiruvda, "
                  "royxatdan otmagan odamlarga ham korinadi. Faqat nomi, "
                  "tavsifi va menejerning ismi chiqadi - azolar, vazifalar "
                  "va fayllar hech qachon chiqmaydi.")
    join_code = models.CharField("Qoshilish kodi", max_length=12, default=make_join_code, unique=True)
    auto_accept = models.BooleanField("Sorovlarni avtomatik qabul qilish", default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # O'chirish "yumshoq": yozuv bazada qoladi, ro'yxatlarda ko'rinmaydi.
    deleted_at = models.DateTimeField("Ochirilgan", null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="deleted_projects",
                                   verbose_name="Kim ochirgan")

    # Tartib muhim: birinchi menejer - standart menejer.
    objects = AliveProjectManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = "Loyiha"
        verbose_name_plural = "Loyihalar"
        ordering = ["-updated_at"]
        unique_together = [("workspace", "key")]

    def __str__(self):
        return "{} ({})".format(self.name, self.key)

    def save(self, *args, **kwargs):
        if not (self.key or "").strip():
            self.key = self.generate_key()
        self.key = "".join(ch for ch in self.key.upper() if ch.isalnum())[:10] or "PRJ"
        if not (self.color or "").strip():
            self.color = self.pick_color()
        super().save(*args, **kwargs)
        pending = getattr(self, "_pending_specialties", None)
        if pending is not None:
            self._write_specialties(pending)
            del self._pending_specialties

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    def soft_delete(self, actor=None):
        """Saytdan o'chirish: ma'lumot bazada qoladi."""
        self.deleted_at = timezone.now()
        self.deleted_by = actor if getattr(actor, "pk", None) else None
        self.save(update_fields=["deleted_at", "deleted_by", "updated_at"])

    def restore(self):
        self.deleted_at = None
        self.deleted_by = None
        self.save(update_fields=["deleted_at", "deleted_by", "updated_at"])

    def generate_key(self):
        """Loyiha nomidan qisqa kalit yasaydi: 'Tolov tizimi' -> 'TT', 'Mobil' -> 'MOB'.

        Foydalanuvchi kalit yozmaydi - tizim ish maydoni ichida takrorlanmasligini
        ozi taminlaydi.
        """
        words = [w for w in "".join(
            ch if ch.isalnum() else " " for ch in (self.name or "")
        ).split() if w]

        if len(words) >= 2:
            base = "".join(w[0] for w in words[:4])
        elif words:
            base = words[0][:3]
        else:
            base = "PRJ"

        base = "".join(ch for ch in base.upper() if ch.isalnum())[:10] or "PRJ"

        # `all_objects`: o'chirilgan loyihaning kaliti ham band hisoblanadi -
        # aks holda unique_together (workspace, key) buzilardi.
        taken = set(
            Project.all_objects.filter(workspace_id=self.workspace_id)
            .exclude(pk=self.pk).values_list("key", flat=True)
        )
        if base not in taken:
            return base

        for i in range(2, 100):
            candidate = "{}{}".format(base[:8], i)
            if candidate not in taken:
                return candidate
        return base[:6] + secrets.token_hex(2).upper()

    def pick_color(self):
        """Loyiha rangini tizim ozi tanlaydi - foydalanuvchi rang tanlab ovora bolmaydi.

        Bitta ish maydoni ichida ranglar takrorlanmasligiga harakat qilinadi:
        royxatda loyihalar bir-biridan darrov ajralib tursin.
        """
        used = set(
            Project.objects.filter(workspace_id=self.workspace_id)
            .exclude(pk=self.pk).values_list("color", flat=True)
        )
        free = [c for c in PROJECT_COLORS if c not in used]
        if free:
            return free[0]

        seed = "{}:{}".format(self.workspace_id, self.name or "")
        digest = hashlib.md5(seed.encode("utf-8")).hexdigest()
        return PROJECT_COLORS[int(digest, 16) % len(PROJECT_COLORS)]

    # ------------------------------------------------------------ mutaxassisliklar
    # Ilgari bu JSON royxat edi. Db2 JSON maydonini qollamagani uchun alohida
    # jadvalga (`ProjectSpecialty`) chiqarildi. Kod uchun hech narsa ozgarmadi:
    # `project.needed_specialties` oldingidek royxat qaytaradi va royxat
    # berilsa ozini yangilaydi.
    @property
    def needed_specialties(self):
        if self.pk is None:
            return list(getattr(self, "_pending_specialties", []))
        return [row.value for row in self.specialties.all()]

    @needed_specialties.setter
    def needed_specialties(self, values):
        clean, seen = [], set()
        for v in (values or []):
            v = str(v).strip()
            if v and v not in seen:
                seen.add(v)
                clean.append(v)
        if self.pk is None:
            # Hali saqlanmagan - `save()` dan keyin yoziladi.
            self._pending_specialties = clean
            return
        self._write_specialties(clean)

    def _write_specialties(self, values):
        current = {row.value: row for row in self.specialties.all()}
        for v in values:
            if v not in current:
                ProjectSpecialty.objects.create(project=self, value=v)
        for v, row in current.items():
            if v not in values:
                row.delete()

    def get_absolute_url(self):
        return reverse("projects:detail", args=[self.pk])

    @property
    def is_archived(self):
        return self.status == ProjectStatus.ARCHIVED

    @property
    def active_members(self):
        return self.memberships.filter(is_active=True).select_related("user")

    @property
    def developers(self):
        return self.active_members.filter(role__in=[ProjectRole.DEVELOPER, ProjectRole.QA])

    @property
    def has_active_manager(self):
        """Loyihada tirik menejer bormi - menejersiz qolib ketmasin.

        `memberships` oldindan yuklangan bo'lsa keshdan qaraladi: ro'yxatda
        bu xossa har loyiha uchun bittadan `EXISTS` so'rovi yuborardi.
        """
        if "memberships" in getattr(self, "_prefetched_objects_cache", {}):
            return any(m.is_active and m.role == ProjectRole.MANAGER
                       for m in self.memberships.all())
        return self.memberships.filter(is_active=True, role=ProjectRole.MANAGER).exists()

    def progress(self):
        """Bajarilgan vazifalar ulushi (%).

        Ro'yxatda har loyiha uchun ikkita `COUNT` yuborilardi. Endi avval
        annotatsiya qaraladi (`project_counters` uni bitta ichki so'rov bilan
        oldindan olib qo'yadi) va faqat u yo'q bo'lsa bazaga boriladi -
        masalan bitta loyiha alohida ochilganda.
        """
        from apps.tasks.models import TaskStatus

        total = getattr(self, "total_tasks", None)
        done = getattr(self, "done_tasks", None)
        if total is None or done is None:
            total = self.tasks.exclude(status=TaskStatus.CANCELLED).count()
            done = self.tasks.filter(status=TaskStatus.DONE).count()
        if not total:
            return 0
        return round(done * 100 / total)

    def needed_specialty_labels(self):
        from apps.accounts.specialties import Specialty

        names = dict(Specialty.choices)
        return [{"value": v, "label": names.get(v, v)} for v in (self.needed_specialties or [])]

    def active_specialties(self):
        """Jamoadagi faol a'zolarning mutaxassisliklari.

        `memberships` oldindan yuklangan bo'lsa (`prefetch_related`) - bazaga
        umuman borilmaydi, filtr Python tomonda bajariladi. Ro'yxatda har
        loyiha uchun alohida so'rov ketishining oldi shu yerda olinadi.
        """
        if "memberships" in getattr(self, "_prefetched_objects_cache", {}):
            return [m.user.specialty for m in self.memberships.all() if m.is_active]
        return list(self.active_members.values_list("user__specialty", flat=True))

    def specialty_gaps(self):
        """Kerak, lekin jamoada yoq bolgan mutaxassisliklar."""
        have = set(self.active_specialties())
        return [v for v in (self.needed_specialties or []) if v not in have]

    def matches_user(self, user):
        """Loyiha shu foydalanuvchi mutaxassisligiga mos keladimi."""
        if not self.needed_specialties:
            return False
        return user.specialty in self.needed_specialties

    def team_composition(self):
        """Jamoa tarkibi: qaysi mutaxassisdan nechta bor."""
        from collections import Counter

        from apps.accounts.specialties import Specialty

        names = dict(Specialty.choices)
        counts = Counter(self.active_specialties())
        return [{"value": k, "label": names.get(k, k), "count": v}
                for k, v in counts.most_common()]

    def next_task_number(self):
        """Loyihadagi keyingi vazifa raqami.

        `SELECT MAX` keyin `+1` - ikki kishi bir vaqtda vazifa yaratsa
        ikkalasiga bir xil raqam tegib, `unique_together (project, number)`
        buzilardi va biriga 500 chiqardi. Shuning uchun loyiha qatori
        qulflanadi: raqam olayotgan ikkinchi tranzaksiya birinchisini
        kutadi. Qulf tranzaksiya tugaguncha ushlanadi, ya'ni chaqiruvchi
        `atomic` ichida bo'lishi kerak - `Task.save()` shunday chaqiradi.
        """
        # Qulf loyihaning o'ziga qo'yiladi: vazifalar jadvalini emas, bitta
        # qatorni band qilamiz - boshqa loyihalar erkin ishlayveradi.
        type(self).objects.select_for_update().filter(pk=self.pk).exists()
        # `self.tasks` standart menejerdan yasaladi va o'chirilganlarni
        # yashiradi - u bilan sanasak o'chirilgan vazifaning raqami qayta
        # ishlatilib, `unique_together (project, number)` buzilardi.
        from apps.tasks.models import Task

        last = (Task.all_objects.filter(project=self)
                .order_by("-number").values_list("number", flat=True).first())
        return (last or 0) + 1


class ProjectSpecialty(models.Model):
    """Loyihaga kerakli yonalish - bitta qator, bitta qiymat.

    Ilgari bu `Project.needed_specialties` JSON royxati edi va qidiruv
    `needed_specialties__contains=[...]` bilan bajarilardi. IBM Db2 JSON
    maydonini qollamaydi, shuning uchun normal jadvalga chiqarildi. Yutuq
    shundaki, endi qidiruv aniq va indeks ustidan ketadi - JSON matn ichidan
    qidirishga qaraganda tez va xatosiz.
    """

    project = models.ForeignKey(Project, on_delete=models.CASCADE,
                                related_name="specialties")
    value = models.CharField("Mutaxassislik", max_length=20, db_index=True)

    class Meta:
        verbose_name = "Kerakli mutaxassislik"
        verbose_name_plural = "Kerakli mutaxassisliklar"
        unique_together = [("project", "value")]
        ordering = ["value"]

    def __str__(self):
        return "{} - {}".format(self.project.name, self.value)


class ProjectMember(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="project_memberships")
    role = models.CharField("Rol", max_length=20, choices=ProjectRole.choices,
                            default=ProjectRole.DEVELOPER)
    is_active = models.BooleanField("Faol", default=True)
    joined_at = models.DateTimeField("Qoshilgan", default=timezone.now)
    left_at = models.DateTimeField("Chiqqan", null=True, blank=True)
    added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name="added_members")
    # Loyiha tarixida "bu odam nima qilgan" degan xulosa
    handover_note = models.TextField("Topshiriq eslatmasi", blank=True,
                                     help_text="Loyihadan chiqishda keyingi dasturchi uchun qoldirilgan izoh")

    class Meta:
        verbose_name = "Loyiha azosi"
        verbose_name_plural = "Loyiha azolari"
        unique_together = [("project", "user")]
        ordering = ["role", "joined_at"]

    def __str__(self):
        return "{} - {}".format(self.user, self.get_role_display())


class JoinRequest(models.Model):
    """Ro'yxatdan o'tgan foydalanuvchi loyihaga qoshilish uchun sorov yuboradi."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="join_requests")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="join_requests")
    message = models.TextField("Xabar", blank=True,
                               help_text="Nimalarni qila olasiz, qanday tajribangiz bor")
    desired_role = models.CharField("Istagan rol", max_length=20, choices=ProjectRole.choices,
                                    default=ProjectRole.DEVELOPER)
    status = models.CharField("Holat", max_length=20, choices=RequestStatus.choices,
                              default=RequestStatus.PENDING)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="decided_requests")
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField("Qaror izohi", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Qoshilish sorovi"
        verbose_name_plural = "Qoshilish sorovlari"
        ordering = ["-created_at"]

    def __str__(self):
        return "{} -> {}".format(self.user, self.project)

    @property
    def is_pending(self):
        return self.status == RequestStatus.PENDING


class ProjectBrief(models.Model):
    """Loyiha konteksti - yangi kelgan dasturchi (yoki agent) darrov tushunishi uchun.

    Aynan shu sahifa "chalkashib vaqt yoqotmaslik" muammosini yopadi.
    """

    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name="brief")
    goal = models.TextField("Loyiha maqsadi", blank=True,
                            help_text="Bir-ikki gapda: nima uchun bu loyiha bor")
    tech_stack = models.TextField("Texnologiyalar", blank=True,
                                  help_text="Django 5, PostgreSQL, Docker, React ...")
    architecture = models.TextField("Arxitektura", blank=True,
                                    help_text="Papkalar tuzilishi, asosiy modullar, integratsiyalar")
    pitfalls = models.TextField("Ehtiyot boling", blank=True,
                                help_text="Avval yol qoyilgan xatolar, tuzoqlar")
    contacts = models.TextField("Kim nima boyicha javob beradi", blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="brief_updates")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Loyiha brifi"
        verbose_name_plural = "Loyiha briflari"

    def __str__(self):
        return "Brif: " + self.project.name

    @property
    def filled_ratio(self):
        fields = ["goal", "tech_stack", "architecture", "pitfalls", "contacts"]
        filled = sum(1 for f in fields if (getattr(self, f) or "").strip())
        return round(filled * 100 / len(fields))


def project_file_path(instance, filename):
    return "projects/{}/{}".format(instance.project_id, filename)


def project_file_version_path(instance, filename):
    """Eski nusxa uchun yo'l.

    Odatda ishlatilmaydi: hujjat almashtirilganda eski nusxaga faylning
    mavjud yo'li beriladi (bayt ko'chirilmaydi, eski havola ishlayveradi).
    Bu yo'l faqat versiyaga to'g'ridan-to'g'ri yangi fayl yozilsa kerak
    bo'ladi - shunda u joriy hujjatlar bilan aralashib ketmasin.
    """
    return "projects/{}/versions/{}".format(instance.document.project_id, filename)


class ProjectFile(SoftDeleteModel):
    """Loyihaga tegishli fayl: texnik topshiriq, dizayn, hujjat, arxiv.

    Vazifa fayllaridan (`tasks.Attachment`) farqi: bu fayllar bitta ishga emas,
    butun loyihaga tegishli - yangi kelgan odam ham topib oladi.
    """

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="files")
    file = models.FileField("Fayl", upload_to=project_file_path)
    original_name = models.CharField("Fayl nomi", max_length=255, blank=True)
    size = models.PositiveBigIntegerField("Hajmi (bayt)", default=0)
    content_type = models.CharField("Turi", max_length=120, blank=True)
    description = models.CharField("Izoh", max_length=250, blank=True)
    # Hujjatning O'ZIDAGI sana: shartnoma imzolangan kun, texnik topshiriq
    # tasdiqlangan kun. `created_at` (fayl tizimga yuklangan lahza) bilan bir
    # xil emas - o'tgan yilgi shartnoma bugun yuklanishi mumkin. Shuning
    # uchun alohida maydon; ko'rsatilmasa bo'sh qoladi.
    #
    # SOAT ham saqlanadi: bir kunda bir necha bayonnoma yoki tuzatish
    # kelganda faqat kun bilan qaysi biri keyingi ekanini ayta olmasdik -
    # ro'yxatda ular bir xil sana bilan yonma-yon turardi.
    doc_date = models.DateTimeField("Hujjat sanasi va vaqti", null=True, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name="project_files")
    # Nechanchi nusxa. Bir xil nomli hujjat qayta yuklansa yangi qator emas,
    # shu qatorning yangi versiyasi bo'ladi - eskisi `versions` da qoladi.
    version = models.PositiveIntegerField("Versiya", default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField("Oxirgi yangilanish", auto_now=True)

    class Meta:
        verbose_name = "Loyiha fayli"
        verbose_name_plural = "Loyiha fayllari"
        ordering = ["-created_at"]

    def __str__(self):
        return self.original_name or str(self.file)

    def save(self, *args, **kwargs):
        if self.file and not self.original_name:
            self.original_name = self.file.name.rsplit("/", 1)[-1][:255]
        if self.file and not self.size:
            try:
                self.size = self.file.size
            except Exception:
                self.size = 0
        super().save(*args, **kwargs)

    @property
    def extension(self):
        return (self.original_name or "").rsplit(".", 1)[-1].lower() if "." in (self.original_name or "") else ""

    @property
    def is_image(self):
        return (self.content_type or "").startswith("image/")

    @property
    def size_display(self):
        size = float(self.size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024 or unit == "GB":
                return "{:.0f} {}".format(size, unit) if unit == "B" else "{:.1f} {}".format(size, unit)
            size /= 1024
        return "{:.1f} GB".format(size)


class ProjectFileVersion(models.Model):
    """Hujjatning ESKI nusxasi.

    Bir xil nomli hujjat qayta yuklanganda joriy nusxa shu jadvalga ko'chadi,
    `ProjectFile` esa yangisiga o'tadi. Ya'ni hujjat almashtirilgani bilan
    oldingi variant yo'qolmaydi: kim, qachon yuklagani va kim almashtirgani
    ko'rinib turadi, faylning o'zini ochib ham bo'ladi.

    Fayl BAYTLARI ko'chirilmaydi - yangi qatorga eskisining saqlash yo'li
    beriladi, ya'ni diskda nusxa ko'paymaydi.
    """

    document = models.ForeignKey(ProjectFile, on_delete=models.CASCADE,
                                 related_name="versions", verbose_name="Hujjat")
    version = models.PositiveIntegerField("Versiya")
    file = models.FileField("Fayl", upload_to=project_file_version_path)
    original_name = models.CharField("Fayl nomi", max_length=255, blank=True)
    size = models.PositiveBigIntegerField("Hajmi (bayt)", default=0)
    content_type = models.CharField("Turi", max_length=120, blank=True)
    description = models.CharField("Izoh", max_length=250, blank=True)
    # Eski nusxadagi hujjat sanasi - almashtirishda u ham o'zgargan bo'lishi
    # mumkin, tarixda qanday bo'lgani ko'rinib tursin.
    doc_date = models.DateTimeField("Hujjat sanasi va vaqti", null=True, blank=True)

    # Shu nusxani kim va qachon yuklagan edi
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name="project_file_versions",
                                    verbose_name="Kim yuklagan")
    created_at = models.DateTimeField("Yuklangan vaqti")
    # Kim va qachon almashtirgan
    replaced_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name="+",
                                    verbose_name="Kim almashtirgan")
    replaced_at = models.DateTimeField("Almashtirilgan vaqti", auto_now_add=True)

    class Meta:
        verbose_name = "Hujjatning eski nusxasi"
        verbose_name_plural = "Hujjatning eski nusxalari"
        ordering = ["-version"]
        indexes = [models.Index(fields=["document", "-version"])]

    def __str__(self):
        return "{} v{}".format(self.original_name or self.document_id, self.version)

    @property
    def is_image(self):
        return (self.content_type or "").startswith("image/")

    @property
    def size_display(self):
        size = float(self.size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024 or unit == "GB":
                return "{:.0f} {}".format(size, unit) if unit == "B" else "{:.1f} {}".format(size, unit)
            size /= 1024
        return "{:.1f} GB".format(size)


class ProjectDeadlineNotice(models.Model):
    """Muddat eslatmasi yuborilganini belgilab qo'yadi.

    Eslatma kuniga bir marta tekshiriladi, lekin tekshiruv bir necha marta
    ishga tushishi mumkin (bir nechta jarayon, qayta ishga tushirish, qo'lda
    chaqirish). Shu jadval bo'lmasa odam bir xil xabarni qayta-qayta olardi.

    `due_date` ham kalitga kiradi: muddat surilsa eslatma yangi sana uchun
    qaytadan yuboriladi - bu to'g'ri, chunki bu boshqa muddat.
    """

    project = models.ForeignKey(Project, on_delete=models.CASCADE,
                                related_name="deadline_notices", verbose_name="Loyiha")
    days_left = models.PositiveIntegerField("Necha kun qolganda")
    due_date = models.DateField("O'sha paytdagi muddat")
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Muddat eslatmasi"
        verbose_name_plural = "Muddat eslatmalari"
        ordering = ["-sent_at"]
        constraints = [
            models.UniqueConstraint(fields=["project", "days_left", "due_date"],
                                    name="uniq_deadline_notice"),
        ]

    def __str__(self):
        return "{} - {} kun qoldi".format(self.project_id, self.days_left)
