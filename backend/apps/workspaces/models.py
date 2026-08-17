import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.urls import reverse
from django.utils.text import slugify

from apps.core.softdelete import SoftDeleteModel


# Ish maydoni rangi foydalanuvchidan sorlmaydi - shu palitradan avtomatik tanlanadi.
WORKSPACE_COLORS = [
    "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
    "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
]


def make_code(n=10):
    return secrets.token_urlsafe(n)[:n].upper()


class WorkspaceRole(models.TextChoices):
    OWNER = "OWNER", "Egasi"
    ADMIN = "ADMIN", "Administrator"
    MEMBER = "MEMBER", "Azo"


class Workspace(SoftDeleteModel):
    """GitHub organization kabi: ichida bir nechta loyiha va umumiy jamoa."""

    name = models.CharField("Nomi", max_length=120)
    slug = models.SlugField("Manzil", max_length=140, unique=True, blank=True)
    description = models.TextField("Tavsif", blank=True)
    color = models.CharField("Rang", max_length=9, blank=True, default="",
                             help_text="Tizim ozi tanlaydi - maydonlar royxatda ajralib tursin")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                              related_name="owned_workspaces", verbose_name="Egasi")
    join_code = models.CharField("Taklif kodi", max_length=12, unique=True, default=make_code)
    is_open = models.BooleanField("Ochiq (kod bilan qoshilsa boladi)", default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Ish maydoni"
        verbose_name_plural = "Ish maydonlari"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or "workspace"
            slug, i = base, 2
            # `all_objects`: o'chirilgan maydonning manzili ham band
            # hisoblanadi - aks holda `slug` unikalligi buzilardi.
            while Workspace.all_objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = "{}-{}".format(base, i)
                i += 1
            self.slug = slug
        if not (self.color or "").strip():
            self.color = self.pick_color()
        super().save(*args, **kwargs)

    def pick_color(self):
        """Rangni tizim ozi tanlaydi - egasining maydonlari bir xil rangda bolmasin."""
        used = set(
            Workspace.objects.filter(owner_id=self.owner_id)
            .exclude(pk=self.pk).values_list("color", flat=True)
        )
        free = [c for c in WORKSPACE_COLORS if c not in used]
        if free:
            return free[0]

        digest = hashlib.md5((self.name or "").encode("utf-8")).hexdigest()
        return WORKSPACE_COLORS[int(digest, 16) % len(WORKSPACE_COLORS)]

    def get_absolute_url(self):
        return reverse("workspaces:detail", args=[self.slug])

    def role_of(self, user):
        if not user.is_authenticated:
            return None
        m = self.memberships.filter(user=user).first()
        return m.role if m else None

    def can_manage(self, user):
        if not user.is_authenticated:
            return False
        return user.is_platform_admin or self.owner_id == user.id or \
            self.role_of(user) in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN)


class WorkspaceMember(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="workspace_memberships")
    role = models.CharField("Rol", max_length=20, choices=WorkspaceRole.choices,
                            default=WorkspaceRole.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ish maydoni azosi"
        verbose_name_plural = "Ish maydoni azolari"
        unique_together = [("workspace", "user")]
        ordering = ["role", "joined_at"]

    def __str__(self):
        return "{} @ {}".format(self.user, self.workspace)
