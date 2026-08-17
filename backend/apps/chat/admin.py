from django.contrib import admin

from apps.core.softdelete import SoftDeleteAdminMixin

from .models import ChatMessage


@admin.register(ChatMessage)
class ChatMessageAdmin(SoftDeleteAdminMixin, admin.ModelAdmin):
    list_display = ("author", "project", "workspace", "created_at", "ochirilgan")
    list_filter = ("project", "workspace", "deleted_at")
    search_fields = ("text", "author__full_name")
