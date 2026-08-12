from django.contrib import admin

from .models import ChatMessage


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("author", "project", "workspace", "created_at")
    list_filter = ("project", "workspace")
    search_fields = ("text", "author__full_name")
