from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "full_name", "global_role", "is_active", "date_joined")
    list_filter = ("global_role", "is_active", "is_staff")
    search_fields = ("email", "full_name", "skills")
    ordering = ("-date_joined",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profil", {"fields": ("full_name", "job_title", "skills", "bio",
                               "github_username", "telegram", "avatar")}),
        ("Ruxsatlar", {"fields": ("global_role", "is_active", "is_staff",
                                  "is_superuser", "groups", "user_permissions")}),
        ("Sanalar", {"fields": ("last_login", "date_joined", "last_seen")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",),
                "fields": ("email", "full_name", "global_role", "password1", "password2")}),
    )
