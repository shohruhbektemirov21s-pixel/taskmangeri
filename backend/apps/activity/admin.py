from django.contrib import admin

from .models import Activity


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("created_at", "verb", "actor", "project", "task", "summary")
    list_filter = ("verb", "project")
    search_fields = ("summary", "detail")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in Activity._meta.fields]
