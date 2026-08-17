from django.contrib import admin

from apps.core.softdelete import SoftDeleteAdminMixin

from .models import Attachment, Comment, Label, Review, Task, TaskAssignment, WorkLog


class AssignmentInline(admin.TabularInline):
    model = TaskAssignment
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(Task)
class TaskAdmin(SoftDeleteAdminMixin, admin.ModelAdmin):
    list_display = ("code_display", "title", "project", "status", "priority", "due_date",
                    "updated_at", "ochirilgan")
    list_filter = ("status", "priority", "task_type", "project", "deleted_at")
    search_fields = ("title", "description")
    inlines = [AssignmentInline]

    @admin.display(description="Kod")
    def code_display(self, obj):
        return obj.code


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("task", "reviewer", "verdict", "round_no", "created_at")
    list_filter = ("verdict",)


@admin.register(WorkLog)
class WorkLogAdmin(admin.ModelAdmin):
    list_display = ("task", "user", "hours", "work_date")


@admin.register(Attachment)
class AttachmentAdmin(SoftDeleteAdminMixin, admin.ModelAdmin):
    list_display = ("original_name", "task", "size_display", "uploaded_by", "created_at",
                    "ochirilgan")
    list_filter = ("deleted_at",)
    search_fields = ("original_name",)


admin.site.register([Comment, Label, TaskAssignment])
