from django.conf import settings
from django.db import models

from apps.core.fields import JSONTextField

# verb -> (belgi, matn shabloni uchun kategoriya)
VERB_META = {
    "user.registered": ("+", "user"),
    "user.role_changed": ("*", "user"),
    "workspace.created": ("W", "workspace"),
    "workspace.joined": ("+", "workspace"),
    "project.created": ("P", "project"),
    "project.updated": ("*", "project"),
    "project.archived": ("#", "project"),
    "project.brief_updated": ("B", "project"),
    "member.requested": ("?", "member"),
    "member.invited": ("@", "member"),
    "member.approved": ("+", "member"),
    "member.rejected": ("-", "member"),
    "member.added": ("+", "member"),
    "member.removed": ("-", "member"),
    "member.role_changed": ("*", "member"),
    "member.left": ("-", "member"),
    "task.created": ("T", "task"),
    "task.assigned": ("@", "task"),
    "task.unassigned": ("@", "task"),
    "task.reassigned": ("@", "task"),
    "task.status": (">", "task"),
    "task.updated": ("*", "task"),
    "task.submitted": ("^", "review"),
    "task.handover": ("^", "review"),
    "task.handover_edited": ("*", "review"),
    "task.handover_deleted": ("X", "review"),
    "project.file": ("F", "project"),
    "project.file_deleted": ("F", "project"),
    "task.approved": ("V", "review"),
    "task.changes_requested": ("!", "review"),
    "task.rejected": ("X", "review"),
    "task.commented": ("C", "task"),
    "task.worklog": ("H", "task"),
    "task.attachment": ("F", "task"),
    "task.attachment_deleted": ("F", "task"),
    "task.blocked": ("!", "task"),
    "task.deleted": ("X", "task"),
}


class ActivityQuerySet(models.QuerySet):
    def for_project(self, project):
        return self.filter(project=project)

    def timeline(self):
        # `task__project` ham kerak: `task_code` vazifa kodini so'raydi, u esa
        # loyiha kalitidan yasaladi - aks holda har yozuv uchun alohida
        # so'rov ketardi.
        return (self.select_related("actor", "project", "task", "task__project", "workspace")
                .order_by("-created_at"))


# Tarix filtri uchun turkumlar. Nomlar `VERB_META` dan olinadi - ro'yxat
# ikki joyda ikki xil bo'lib qolmasin: yangi harakat qo'shilsa filtrda ham
# o'zi paydo bo'ladi.
CATEGORY_LABELS = {
    "task": "Vazifalar",
    "review": "Tekshiruvlar",
    "member": "Jamoa",
    "project": "Loyiha",
    "workspace": "Ish maydoni",
    "user": "Foydalanuvchi",
    "other": "Boshqa",
}


def category_choices():
    """Haqiqatan ishlatilayotgan turkumlar, barqaror tartibda."""
    order = list(CATEGORY_LABELS)
    used = {cat for _, cat in VERB_META.values()}
    return [{"value": c, "label": CATEGORY_LABELS.get(c, c)}
            for c in order if c in used]


class Activity(models.Model):
    """Ozgarmas tarix yozuvi. Hech qachon tahrirlanmaydi - loyiha xotirasi shu."""

    workspace = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE,
                                  null=True, blank=True, related_name="activities")
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE,
                                null=True, blank=True, related_name="activities")
    task = models.ForeignKey("tasks.Task", on_delete=models.SET_NULL,
                             null=True, blank=True, related_name="activities")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                              null=True, related_name="activities")

    verb = models.CharField("Amal", max_length=50, db_index=True)
    summary = models.CharField("Qisqacha", max_length=300)
    detail = models.TextField("Batafsil", blank=True)
    meta = JSONTextField("Qoshimcha", default=dict, blank=True)

    target_label = models.CharField("Obyekt", max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    objects = ActivityQuerySet.as_manager()

    class Meta:
        verbose_name = "Tarix yozuvi"
        verbose_name_plural = "Loyiha tarixi"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["project", "-created_at"]),
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["task", "-created_at"]),
        ]

    def __str__(self):
        return "{} - {}".format(self.verb, self.summary)

    @property
    def icon(self):
        return VERB_META.get(self.verb, ("*", "other"))[0]

    @property
    def category(self):
        return VERB_META.get(self.verb, ("*", "other"))[1]
