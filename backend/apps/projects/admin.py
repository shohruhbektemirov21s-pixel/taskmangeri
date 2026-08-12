from django.contrib import admin

from .models import JoinRequest, Project, ProjectBrief, ProjectMember


class MemberInline(admin.TabularInline):
    model = ProjectMember
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "workspace", "manager", "status", "updated_at")
    list_filter = ("status", "workspace")
    search_fields = ("name", "key", "description")
    inlines = [MemberInline]


@admin.register(ProjectMember)
class ProjectMemberAdmin(admin.ModelAdmin):
    list_display = ("project", "user", "role", "is_active", "joined_at", "left_at")
    list_filter = ("role", "is_active")


@admin.register(JoinRequest)
class JoinRequestAdmin(admin.ModelAdmin):
    list_display = ("project", "user", "desired_role", "status", "created_at", "decided_by")
    list_filter = ("status", "desired_role")


@admin.register(ProjectBrief)
class ProjectBriefAdmin(admin.ModelAdmin):
    list_display = ("project", "updated_by", "updated_at")
