from django.contrib import admin

from .models import Invitation


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ("user", "target_name", "role", "status", "invited_by", "created_at")
    list_filter = ("status",)
    search_fields = ("user__email", "user__full_name")
