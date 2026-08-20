from django.contrib import admin

from .models import UiText


@admin.register(UiText)
class UiTextAdmin(admin.ModelAdmin):
    """Matnni shu yerdan tahrirlanadi — ro'yxatning o'zida.

    `list_editable` ataylab: odam odatda bitta so'zni tuzatish uchun keladi,
    har biri uchun alohida sahifa ochish ortiqcha qadam bo'lardi.
    """

    list_display = ("key", "value", "note", "updated_at")
    list_editable = ("value",)
    list_display_links = ("key",)
    list_filter = ("group",)
    search_fields = ("key", "value", "note")
    ordering = ("group", "key")
    list_per_page = 50
    readonly_fields = ("group", "updated_at")
    fields = ("key", "value", "note", "group", "updated_at")
