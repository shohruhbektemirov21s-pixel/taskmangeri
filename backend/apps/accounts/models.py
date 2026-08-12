import hashlib

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from .specialties import Seniority, Specialty, profile_for

AVATAR_COLORS = [
    "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
    "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
]


class GlobalRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    MANAGER = "MANAGER", "Loyiha menejeri"
    DEVELOPER = "DEVELOPER", "Dasturchi"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email majburiy")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("global_role", GlobalRole.ADMIN)
        if extra.get("is_staff") is not True or extra.get("is_superuser") is not True:
            raise ValueError("Superuser is_staff/is_superuser=True bo'lishi kerak")
        return self._create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField("Email", unique=True)
    full_name = models.CharField("F.I.Sh.", max_length=150)
    job_title = models.CharField("Lavozim", max_length=100, blank=True,
                                 help_text="Masalan: Backend dasturchi")
    global_role = models.CharField("Tizim roli", max_length=20,
                                   choices=GlobalRole.choices, default=GlobalRole.DEVELOPER)
    specialty = models.CharField("Mutaxassislik", max_length=20, choices=Specialty.choices,
                                 default=Specialty.BACKEND,
                                 help_text="Royxatdan otishda tanlanadi va vazifa taqsimotiga tasir qiladi")
    seniority = models.CharField("Daraja", max_length=20, choices=Seniority.choices,
                                 default=Seniority.JUNIOR)
    years_experience = models.PositiveSmallIntegerField("Tajriba (yil)", default=0)
    bio = models.TextField("Qisqacha ma'lumot", blank=True)
    skills = models.CharField("Ko'nikmalar", max_length=255, blank=True,
                              help_text="Vergul bilan: Python, Django, React")
    github_username = models.CharField("GitHub username", max_length=80, blank=True)
    telegram = models.CharField("Telegram", max_length=80, blank=True)
    avatar = models.ImageField("Rasm", upload_to="avatars/", blank=True, null=True)

    is_active = models.BooleanField("Faol", default=True)
    is_staff = models.BooleanField("Xodim (django-admin)", default=False)
    date_joined = models.DateTimeField("Ro'yxatdan o'tgan", default=timezone.now)
    last_seen = models.DateTimeField("Oxirgi faollik", null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        verbose_name = "Foydalanuvchi"
        verbose_name_plural = "Foydalanuvchilar"
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name or self.email

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        return (self.full_name or self.email).split(" ")[0]

    @property
    def is_platform_admin(self):
        return self.global_role == GlobalRole.ADMIN or self.is_superuser

    @property
    def initials(self):
        parts = [p for p in (self.full_name or self.email).split() if p]
        if not parts:
            return "?"
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[1][0]).upper()

    @property
    def avatar_color(self):
        digest = hashlib.md5(self.email.encode()).hexdigest()
        return AVATAR_COLORS[int(digest, 16) % len(AVATAR_COLORS)]

    @property
    def skill_list(self):
        return [s.strip() for s in self.skills.split(",") if s.strip()]

    # ---------------- mutaxassislikka bogliq xususiyatlar ----------------
    @property
    def specialty_profile(self):
        return profile_for(self.specialty)

    @property
    def specialty_icon(self):
        return self.specialty_profile["icon"]

    @property
    def specialty_color(self):
        return self.specialty_profile["color"]

    @property
    def suggested_task_types(self):
        """Shu mutaxassisga mos vazifa turlari."""
        return self.specialty_profile["task_types"]

    @property
    def suggested_skills(self):
        return self.specialty_profile["skills"]

    @property
    def default_project_role(self):
        """Loyihaga qoshilganda taklif etiladigan rol."""
        return self.specialty_profile["default_project_role"]

    @property
    def quality_checklist(self):
        """Ishni topshirishdan oldin tekshiriladigan royxat."""
        return self.specialty_profile["checklist"]

    def matches_task(self, task):
        """Vazifa shu mutaxassisga mos keladimi."""
        required = getattr(task, "required_specialty", "")
        if not required:
            return True
        return required == self.specialty
