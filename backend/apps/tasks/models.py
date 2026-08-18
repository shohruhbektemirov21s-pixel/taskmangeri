from django.conf import settings
from django.db import models, transaction
from django.urls import reverse
from django.utils import timezone

from apps.core.softdelete import SoftDeleteModel, SoftDeleteQuerySet


class TaskStatus(models.TextChoices):
    # `BACKLOG` olib tashlandi: doskada u doim bo'sh turadigan birinchi
    # ustun edi va «Nazoratda» bilan bir xil ma'noni bildirardi - ish
    # ochilgan, lekin hali boshlanmagan. Ikkita nom bitta holat uchun
    # odamni ikkilantirardi: yangi vazifani qayerga qo'yish kerak?
    TODO = "TODO", "Nazoratda"
    IN_PROGRESS = "IN_PROGRESS", "Jarayonda"
    IN_REVIEW = "IN_REVIEW", "Tekshiruvda"
    CHANGES_REQUESTED = "CHANGES_REQUESTED", "Tuzatish kerak"
    BLOCKED = "BLOCKED", "Toxtab qolgan"
    DONE = "DONE", "Bajarildi"
    CANCELLED = "CANCELLED", "Bekor qilindi"


# Kanban ustunlari (tartib bilan).
#
# RO'YXAT TO'LIQ BO'LISHI SHART. Ustuni yo'q holatdagi ish doskada
# UMUMAN ko'rinmaydi - `board` faqat shu ro'yxat bo'yicha guruhlaydi.
# `BLOCKED` shu sababdan tushib qolgandi: loyihada 74 ta vazifa bo'lsa,
# doskada 69 tasi turardi va to'xtab qolgan 5 ta ish ko'rinmasdi. Aynan
# ular ko'rinishi kerak edi - to'xtagan ish o'zi hal bo'lmaydi.
#
# `CANCELLED` ataylab yo'q: bekor qilingan ish - yopilgan ish, uni
# doskada ushlab turish faqat shovqin. U «Vazifalar» ro'yxatida bor.
BOARD_COLUMNS = [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    # To'xtab qolgani jarayondagi ishning yonida turadi - shunda u
    # ko'zdan qochmaydi.
    TaskStatus.BLOCKED,
    TaskStatus.CHANGES_REQUESTED,
    TaskStatus.IN_REVIEW,
    TaskStatus.DONE,
]

# Dasturchi ozi qaysi statusga otkaza oladi
DEVELOPER_TRANSITIONS = {
    TaskStatus.TODO: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
    TaskStatus.IN_PROGRESS: [TaskStatus.IN_REVIEW, TaskStatus.BLOCKED, TaskStatus.TODO],
    TaskStatus.CHANGES_REQUESTED: [TaskStatus.IN_PROGRESS],
    TaskStatus.BLOCKED: [TaskStatus.IN_PROGRESS, TaskStatus.TODO],
    TaskStatus.IN_REVIEW: [],          # faqat tekshiruvchi harakat qiladi
    TaskStatus.DONE: [],
    TaskStatus.CANCELLED: [],
}


class TaskPriority(models.IntegerChoices):
    LOW = 1, "Past"
    MEDIUM = 2, "Ortacha"
    HIGH = 3, "Yuqori"
    URGENT = 4, "Shoshilinch"


class TaskType(models.TextChoices):
    FEATURE = "FEATURE", "Yangi funksiya"
    BUG = "BUG", "Xatolik"
    CHORE = "CHORE", "Texnik ish"
    DOCS = "DOCS", "Hujjat"
    RESEARCH = "RESEARCH", "Tadqiqot"


class ReviewVerdict(models.TextChoices):
    APPROVED = "APPROVED", "Qabul qilindi"
    CHANGES_REQUESTED = "CHANGES_REQUESTED", "Tuzatish talab qilindi"
    REJECTED = "REJECTED", "Rad etildi"


class Label(models.Model):
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="labels")
    name = models.CharField("Nomi", max_length=40)
    color = models.CharField("Rang", max_length=9, default="#64748b")

    class Meta:
        verbose_name = "Teg"
        verbose_name_plural = "Teglar"
        unique_together = [("project", "name")]
        ordering = ["name"]

    def __str__(self):
        return self.name


class TaskQuerySet(SoftDeleteQuerySet):
    """Vazifalarni ko'rsatishga tayyorlash - bitta joyda.

    `TaskSerializer` har vazifa uchun loyihasini, ijrochilarini, sarflangan
    soatini va fayllar sonini so'raydi. Ular oldindan olinmasa ro'yxatdagi
    har qator uchun alohida so'rov ketadi (N+1). Shuning uchun vazifa
    ro'yxatini beradigan hamma joy shu metoddan o'tadi.
    """

    def for_display(self):
        from apps.core.queries import related_count, related_sum

        return (self.select_related("project", "created_by", "reviewer")
                .prefetch_related("assignments__user", "labels")
                .annotate(
                    logged_hours_sum=related_sum(WorkLog, "hours", group_by="task"),
                    attachments_total=related_count(Attachment, group_by="task"),
                ))


class AliveTaskManager(models.Manager.from_queryset(TaskQuerySet)):
    """Standart menejer: o'chirilgan vazifalarni ko'rsatmaydi.

    `AliveManager` dan meros olib bo'lmaydi - unga `TaskQuerySet` dagi
    `for_display()` kerak, shuning uchun shu yerda alohida yig'iladi.
    """

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Task(SoftDeleteModel):
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="tasks")
    number = models.PositiveIntegerField("Raqam", default=1, editable=False)

    title = models.CharField("Sarlavha", max_length=250)
    description = models.TextField("Nima qilish kerak", blank=True)
    acceptance_criteria = models.TextField(
        "Tayyor deb hisoblash mezoni", blank=True,
        help_text="Aniq royxat: nima ishlasa task qabul qilinadi. Chalkashlikni shu yopadi.")

    status = models.CharField("Holat", max_length=20, choices=TaskStatus.choices,
                              default=TaskStatus.TODO, db_index=True)
    priority = models.IntegerField("Muhimlik", choices=TaskPriority.choices,
                                   default=TaskPriority.MEDIUM)
    task_type = models.CharField("Turi", max_length=20, choices=TaskType.choices,
                                 default=TaskType.FEATURE)
    required_specialty = models.CharField(
        "Kerakli mutaxassislik", max_length=20, blank=True,
        help_text="Belgilansa, vazifa faqat shu yonalishdagi azolarga taklif qilinadi")

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name="created_tasks")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name="review_tasks",
                                 verbose_name="Tekshiruvchi")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True,
                               related_name="subtasks", verbose_name="Asosiy task")
    labels = models.ManyToManyField(Label, blank=True, related_name="tasks", verbose_name="Teglar")

    # Ish oynasi: qachondan boshlanadi va qachonga tugaydi. Ikkalasi ham
    # ixtiyoriy - shoshilinch ishga faqat muddat qo'yiladi.
    start_date = models.DateTimeField("Boshlanish sanasi", null=True, blank=True)
    # Muddat aniq daqiqagacha: "13.08.2026 21:00". Faqat kun bo'lsa
    # "bugun tugatilsin" va "bugun ish kuni oxirigacha" farqlanmasdi.
    due_date = models.DateTimeField("Muddat", null=True, blank=True)
    estimate_hours = models.DecimalField("Rejalashtirilgan soat", max_digits=6, decimal_places=1,
                                         null=True, blank=True)
    branch_name = models.CharField("Branch", max_length=120, blank=True)
    pr_url = models.URLField("Pull request", blank=True)
    blocked_reason = models.CharField("Nega toxtab qolgan", max_length=250, blank=True)

    position = models.IntegerField("Tartib", default=0)
    review_round = models.PositiveSmallIntegerField("Tekshiruv aylanasi", default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField("Boshlangan", null=True, blank=True)
    submitted_at = models.DateTimeField("Tekshiruvga yuborilgan", null=True, blank=True)
    completed_at = models.DateTimeField("Yakunlangan", null=True, blank=True)

    # Tartib muhim: birinchisi standart menejer.
    objects = AliveTaskManager()
    all_objects = models.Manager.from_queryset(TaskQuerySet)()

    class Meta:
        verbose_name = "Vazifa"
        verbose_name_plural = "Vazifalar"
        ordering = ["position", "-priority", "id"]
        unique_together = [("project", "number")]
        indexes = [
            models.Index(fields=["project", "status"]),
            models.Index(fields=["status", "-priority"]),
        ]

    def __str__(self):
        return "{} {}".format(self.code, self.title)

    def save(self, *args, **kwargs):
        if not self.pk:
            # Raqam olish va yozish bitta tranzaksiyada bo'lishi shart -
            # `next_task_number` qo'ygan qulf shunda ma'no kasb etadi.
            with transaction.atomic():
                self.number = self.project.next_task_number()
                return super().save(*args, **kwargs)
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("tasks:detail", args=[self.pk])

    @property
    def code(self):
        return "{}-{}".format(self.project.key, self.number)

    @property
    def assignee_list(self):
        return [a.user for a in self.assignments.all() if a.is_active]

    @property
    def is_open(self):
        return self.status not in (TaskStatus.DONE, TaskStatus.CANCELLED)

    @property
    def is_overdue(self):
        return bool(self.due_date and self.is_open and self.due_date < timezone.now())

    @property
    def priority_label(self):
        return TaskPriority(self.priority).label

    @property
    def status_slug(self):
        return self.status.lower().replace("_", "-")

    @property
    def logged_hours(self):
        """Vazifaga sarflangan soat.

        Ro'yxatda har vazifa uchun alohida `SUM` yuborilardi. Endi avval
        annotatsiya qaraladi (`logged_hours_sum`), u yo'q bo'lsagina bazaga
        boriladi - masalan bitta vazifa alohida ochilganda.
        """
        annotated = getattr(self, "logged_hours_sum", None)
        if annotated is not None:
            return annotated
        total = self.worklogs.aggregate(s=models.Sum("hours"))["s"]
        return total or 0

    @property
    def specialty_label(self):
        from apps.accounts.specialties import Specialty

        if not self.required_specialty:
            return ""
        return dict(Specialty.choices).get(self.required_specialty, self.required_specialty)

    def suitable_members(self):
        """Loyihada shu vazifaga mos azolar (mutaxassislik boyicha)."""
        members = self.project.memberships.filter(is_active=True).select_related("user")
        if not self.required_specialty:
            return [m.user for m in members]
        return [m.user for m in members if m.user.specialty == self.required_specialty]

    def mismatched_assignees(self):
        """Mutaxassisligi mos kelmaydigan ijrochilar - menejerga ogohlantirish uchun."""
        if not self.required_specialty:
            return []
        return [u for u in self.assignee_list if u.specialty != self.required_specialty]

    def allowed_transitions(self, access):
        """Foydalanuvchi shu taskni qaysi statuslarga otkaza oladi.

        «Bajarildi» ro'yxatda yo'q - uni qo'lda qo'yib bo'lmaydi. Vazifa
        tugadi deb faqat ish topshirilib, tekshiruvchi tasdiqlagandan keyin
        hisoblanadi (`/review/` APPROVED). Aks holda "bajarildi" degan raqam
        hech narsani anglatmay qoladi.
        """
        if access.can_review:
            return [s for s in TaskStatus.values
                    if s not in (self.status, TaskStatus.DONE)]
        if access.can_work:
            return list(DEVELOPER_TRANSITIONS.get(self.status, []))
        return []

    def apply_status(self, new_status):
        """Status ozgarganda vaqt belgilarini togrilaydi."""
        now = timezone.now()
        self.status = new_status
        if new_status == TaskStatus.IN_PROGRESS and not self.started_at:
            self.started_at = now
        if new_status == TaskStatus.IN_REVIEW:
            self.submitted_at = now
        if new_status == TaskStatus.DONE:
            self.completed_at = now
        if new_status not in (TaskStatus.DONE, TaskStatus.CANCELLED):
            self.completed_at = None
        if new_status != TaskStatus.BLOCKED:
            self.blocked_reason = ""


class TaskAssignment(models.Model):
    """Bitta taskka bir nechta dasturchi biriktirilishi mumkin."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="assignments")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="assignments")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name="given_assignments")
    assigned_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    unassigned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Biriktirish"
        verbose_name_plural = "Biriktirishlar"
        unique_together = [("task", "user")]
        ordering = ["assigned_at"]

    def __str__(self):
        return "{} -> {}".format(self.task.code, self.user)


class Comment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                               null=True, related_name="comments")
    body = models.TextField("Izoh")
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Izoh"
        verbose_name_plural = "Izohlar"
        ordering = ["created_at"]

    def __str__(self):
        return "{}: {}".format(self.author, self.body[:40])


class Review(models.Model):
    """Admin yoki menejer taskni tekshirgani - tarixda saqlanadi."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, related_name="given_reviews")
    verdict = models.CharField("Qaror", max_length=25, choices=ReviewVerdict.choices)
    comment = models.TextField("Izoh", blank=True,
                               help_text="Nimani tuzatish kerak - aniq yozing")
    round_no = models.PositiveSmallIntegerField("Aylana", default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Tekshiruv"
        verbose_name_plural = "Tekshiruvlar"
        ordering = ["-created_at"]

    def __str__(self):
        return "{} - {}".format(self.task.code, self.get_verdict_display())

    @property
    def is_positive(self):
        return self.verdict == ReviewVerdict.APPROVED


def attachment_path(instance, filename):
    return "tasks/{}/{}".format(instance.task_id, filename)


class Attachment(SoftDeleteModel):
    """Vazifaga biriktirilgan fayl: skrinshot, hujjat, log, arxiv."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="attachments")
    submission = models.ForeignKey("Submission", on_delete=models.CASCADE, null=True, blank=True,
                                   related_name="files", verbose_name="Topshiriq")
    file = models.FileField("Fayl", upload_to=attachment_path)
    original_name = models.CharField("Fayl nomi", max_length=255, blank=True)
    size = models.PositiveBigIntegerField("Hajmi (bayt)", default=0)
    content_type = models.CharField("Turi", max_length=120, blank=True)
    description = models.CharField("Izoh", max_length=250, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name="attachments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Biriktirilgan fayl"
        verbose_name_plural = "Biriktirilgan fayllar"
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
    def size_display(self):
        n = float(self.size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if n < 1024:
                return "{:.0f} {}".format(n, unit) if unit == "B" else "{:.1f} {}".format(n, unit)
            n /= 1024
        return "{:.1f} TB".format(n)

    @property
    def extension(self):
        name = self.original_name or str(self.file)
        return name.rsplit(".", 1)[-1].lower() if "." in name else ""

    @property
    def is_image(self):
        return self.extension in ("png", "jpg", "jpeg", "gif", "webp", "svg", "bmp")


class WorkLog(models.Model):
    """Dasturchi nima qilgani - keyingi odam ochib oqiy oladi."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="worklogs")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="worklogs")
    hours = models.DecimalField("Sarflangan soat", max_digits=5, decimal_places=1, default=0)
    note = models.TextField("Nima qilindi",
                            help_text="Qaysi fayl, qanday yechim, nimaga shunday qilindi")
    work_date = models.DateField("Sana", default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ish jurnali"
        verbose_name_plural = "Ish jurnallari"
        ordering = ["-work_date", "-created_at"]

    def __str__(self):
        return "{} - {} soat".format(self.user, self.hours)


class Submission(SoftDeleteModel):
    """Ish topshirig'i: dasturchi vazifani yakunlab, nima qilganini yozadi.

    Menejer (yoki loyiha admini) tasdiqlamaguncha vazifa tekshiruvda turadi -
    topshiriq esa shu tekshiruv aylanasining "hisoboti" bo'lib qoladi.

    Tahrirlash va o'chirish mumkin, lekin har bir tahrir `SubmissionEdit` da
    saqlanadi: kim, qachon, nimani o'zgartirgani ko'rinib tursin.
    """

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="submissions")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="submissions", verbose_name="Kim topshirdi")
    round_no = models.PositiveIntegerField("Tekshiruv aylanasi", default=1)
    text = models.TextField("Qilingan ish",
                            help_text="Nima qilindi, qaysi fayllar o'zgardi, nimaga e'tibor berish kerak")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    edited_count = models.PositiveIntegerField("Necha marta tahrirlangan", default=0)

    class Meta:
        verbose_name = "Ish topshirig'i"
        verbose_name_plural = "Ish topshiriqlari"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["task", "-created_at"])]

    def __str__(self):
        return "{} - {}".format(self.task.code, self.author)

    @property
    def is_edited(self):
        return self.edited_count > 0


class SubmissionEdit(models.Model):
    """Topshiriq tahrirlari tarixi - eski matn hech qachon yo'qolmaydi."""

    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="edits")
    editor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                               null=True, related_name="submission_edits")
    old_text = models.TextField("Eski matn")
    new_text = models.TextField("Yangi matn")
    edited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Topshiriq tahriri"
        verbose_name_plural = "Topshiriq tahrirlari"
        ordering = ["-edited_at"]

    def __str__(self):
        return "{} tahriri".format(self.submission_id)
