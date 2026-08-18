from django.contrib import admin

from .models import TelegramLink


@admin.register(TelegramLink)
class TelegramLinkAdmin(admin.ModelAdmin):
    list_display = ["user", "chat_id", "is_muted", "linked_at"]
    list_filter = ["is_muted"]
    # Username bu jadvalda yo'q - u profilda (`accounts.User.telegram`).
    search_fields = ["user__email", "user__full_name", "user__telegram"]
    raw_id_fields = ["user"]
