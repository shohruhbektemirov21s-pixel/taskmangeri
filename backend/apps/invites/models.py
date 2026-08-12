from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


class InviteStatus(models.TextChoices):
    PENDING = "PENDING", "Javob kutilmoqda"
    ACCEPTED = "ACCEPTED", "Qabul qilindi"
    DECLINED = "DECLINED", "Rad etildi"
    CANCELLED = "CANCELLED", "Bekor qilindi"


class Invitation(models.Model):
    """Menejer ro'yxatdan o'tgan foydalanuvchini jamoaga taklif qiladi.

    `projects.JoinRequest` ning teskarisi: u yerda foydalanuvchi so'raydi,
    bu yerda esa jamoa taklif qiladi va **qo'shilish faqat taklif qilingan
    odam tasdiqlagandan keyin** amalga oshadi.

    Bitta model ham ish maydoni, ham loyiha taklifiga xizmat qiladi -
    ikkovi uchun bir xil oqim, bir xil bildirishnoma, bir xil interfeys.
    """

    workspace = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE,
                                  null=True, blank=True, related_name="invitations",
                                  verbose_name="Ish maydoni")
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE,
                                null=True, blank=True, related_name="invitations",
                                verbose_name="Loyiha")

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="invitations", verbose_name="Kimga")
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="sent_invitations",
                                   verbose_name="Kim taklif qildi")

    role = models.CharField("Taklif qilinayotgan rol", max_length=20)
    message = models.TextField("Xabar", blank=True,
                               help_text="Nima uchun taklif qilinayotgani")
    status = models.CharField("Holat", max_length=20, choices=InviteStatus.choices,
                              default=InviteStatus.PENDING, db_index=True)
    responded_at = models.DateTimeField("Javob vaqti", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Taklif"
        verbose_name_plural = "Takliflar"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status", "-created_at"]),
        ]

    def __str__(self):
        return "{} -> {}".format(self.target_name, self.user)

    # ------------------------------------------------------------- xossalar
    @property
    def scope(self):
        return "project" if self.project_id else "workspace"

    @property
    def target(self):
        return self.project or self.workspace

    @property
    def target_name(self):
        target = self.target
        return target.name if target else ""

    @property
    def is_pending(self):
        return self.status == InviteStatus.PENDING

    @property
    def role_display(self):
        if self.project_id:
            from apps.projects.models import ProjectRole

            return dict(ProjectRole.choices).get(self.role, self.role)
        from apps.workspaces.models import WorkspaceRole

        return dict(WorkspaceRole.choices).get(self.role, self.role)

    @property
    def url(self):
        """Taklif qabul qilingach ochiladigan interfeys manzili."""
        if self.project_id:
            return "/loyiha/{}/jamoa".format(self.project_id)
        if self.workspace_id:
            return "/ish-maydoni/{}".format(self.workspace.slug)
        return "/takliflar"

    # ------------------------------------------------------------- amallar
    @transaction.atomic
    def accept(self):
        """Taklifni qabul qilish - a'zolik aynan shu yerda paydo bo'ladi."""
        from apps.projects.models import ProjectMember
        from apps.workspaces.models import WorkspaceMember, WorkspaceRole

        if self.project_id:
            ProjectMember.objects.update_or_create(
                project=self.project, user=self.user,
                defaults={"role": self.role, "is_active": True,
                          "left_at": None, "added_by": self.invited_by},
            )
            # Loyiha ish maydoni ichida - a'zo maydonni ham ko'ra olsin.
            WorkspaceMember.objects.get_or_create(
                workspace=self.project.workspace, user=self.user,
                defaults={"role": WorkspaceRole.MEMBER},
            )
        elif self.workspace_id:
            member, created = WorkspaceMember.objects.get_or_create(
                workspace=self.workspace, user=self.user,
                defaults={"role": self.role or WorkspaceRole.MEMBER},
            )
            if not created and member.role != WorkspaceRole.OWNER:
                member.role = self.role or member.role
                member.save(update_fields=["role"])

        self.status = InviteStatus.ACCEPTED
        self.responded_at = timezone.now()
        self.save(update_fields=["status", "responded_at"])
        return self

    def decline(self):
        self.status = InviteStatus.DECLINED
        self.responded_at = timezone.now()
        self.save(update_fields=["status", "responded_at"])
        return self

    def cancel(self):
        self.status = InviteStatus.CANCELLED
        self.responded_at = timezone.now()
        self.save(update_fields=["status", "responded_at"])
        return self
