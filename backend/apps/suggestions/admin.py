"""Takliflar `django-admin/` da.

`SuggestionVote` ATAYLAB ro'yxatdan o'tkazilmagan: «kim bosgani
ko'rinmasin» degan talab admin paneliga ham tegishli. Ovozlar faqat
sonlar ko'rinishida - taklif qatoridagi ustunlarda - ko'rsatiladi.
"""
from django.contrib import admin

from apps.core.queries import related_count

from .models import Suggestion, SuggestionVote, VoteChoice


@admin.register(Suggestion)
class SuggestionAdmin(admin.ModelAdmin):
    list_display = ("title", "scope", "status", "who", "for_votes", "against_votes",
                    "neutral_votes", "created_at")
    list_filter = ("scope", "status", "is_anonymous")
    search_fields = ("title", "body")
    ordering = ("-created_at",)
    readonly_fields = ("author", "decided_by", "decided_at", "created_at", "updated_at")

    def get_queryset(self, request):
        # `Count(...)` emas, ichki so'rov: Db2 `GROUP BY` ichida CLOB
        # (`Suggestion.body`) ni qo'llamaydi - `apps/core/queries.py`.
        return super().get_queryset(request).select_related("author", "decided_by").annotate(
            n_for=related_count(SuggestionVote, group_by="suggestion",
                                choice=VoteChoice.FOR),
            n_against=related_count(SuggestionVote, group_by="suggestion",
                                    choice=VoteChoice.AGAINST),
            n_neutral=related_count(SuggestionVote, group_by="suggestion",
                                    choice=VoteChoice.NEUTRAL),
        )

    @admin.display(description="Muallif")
    def who(self, obj):
        # Anonimlik admin panelida ham buzilmaydi.
        return "— (anonim)" if obj.is_anonymous else obj.author.full_name

    @admin.display(description="Qo'shilaman", ordering="n_for")
    def for_votes(self, obj):
        return obj.n_for

    @admin.display(description="Qo'shilmayman", ordering="n_against")
    def against_votes(self, obj):
        return obj.n_against

    @admin.display(description="Betaraf", ordering="n_neutral")
    def neutral_votes(self, obj):
        return obj.n_neutral
