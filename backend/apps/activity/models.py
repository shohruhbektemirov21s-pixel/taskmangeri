from django.conf import settings
from django.db import models

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
        return self.select_related("actor", "project", "task", "workspace").order_by("-created_at")


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
    meta = models.JSONField("Qoshimcha", default=dict, blank=True)

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
