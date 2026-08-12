from django.contrib import admin

from .models import Attachment, Comment, Label, Review, Task, TaskAssignment, WorkLog


class AssignmentInline(admin.TabularInline):
    model = TaskAssignment
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("code_display", "title", "project", "status", "priority", "due_date", "updated_at")
    list_filter = ("status", "priority", "task_type", "project")
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
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("original_name", "task", "size_display", "uploaded_by", "created_at")
    search_fields = ("original_name",)


admin.site.register([Comment, Label, TaskAssignment])
