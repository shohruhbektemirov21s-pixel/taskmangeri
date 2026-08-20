"""Taklif serializerlari.

IKKI SIR SHU YERDA SAQLANADI:

  1. **Anonim muallif.** `author` maydoni faqat taklif anonim BO'LMAGANDA
     to'ldiriladi. Anonim bo'lsa hech kim - boshliq ham - muallifni
     ko'rmaydi. Muallifning o'zi «bu meniki» ekanini `is_mine` orqali
     biladi, ismi esa baribir chiqmaydi.

  2. **Anonim taklifning fayli.** Fayl yonida «kim yukladi» ko'rsatiladi -
     lekin taklif anonim bo'lsa u ham yashiriladi
     (`SuggestionFileSerializer.get_uploaded_by`).

  3. **Ovoz bergan odam.** Tashqariga faqat sonlar (`for_count`,
     `against_count`, `neutral_count`) va so'ragan odamning O'Z tanlovi
     (`my_vote`) chiqadi. Kim nima bosgani hech qachon serializatsiya
     qilinmaydi.
"""
from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import (Suggestion, SuggestionFile, SuggestionScope, SuggestionStatus,
                     VoteChoice)


class SuggestionFileSerializer(serializers.ModelSerializer):
    """Taklifga biriktirilgan fayl.

    `uploaded_by` — «kim yuklagani» talabi. Anonim taklifda u `null`
    bo'ladi: aks holda anonimlik faylning ostidan buzilardi.
    """

    uploaded_by = serializers.SerializerMethodField()
    size_display = serializers.CharField(read_only=True)
    extension = serializers.CharField(read_only=True)
    is_image = serializers.BooleanField(read_only=True)
    url = serializers.SerializerMethodField()
    # Yuklashda kerak, javobda emas: javobda imzolangan `url` ketadi.
    file = serializers.FileField(write_only=True)

    class Meta:
        model = SuggestionFile
        fields = ["id", "file", "url", "original_name", "size", "size_display",
                  "content_type", "extension", "is_image", "uploaded_by", "created_at"]
        read_only_fields = ["original_name", "size", "content_type", "created_at"]

    def get_url(self, obj):
        # Nisbiy va imzolangan manzil - sababi `apps/core/media.py` da.
        from apps.core.media import media_url

        return media_url(obj.file)

    def get_uploaded_by(self, obj):
        if obj.suggestion.is_anonymous:
            return None
        if not obj.uploaded_by_id:
            return None
        return UserBriefSerializer(obj.uploaded_by, context=self.context).data

    def validate_file(self, value):
        # Hajm ham, tur ham bitta joyda: `apps/core/uploads.py`.
        from apps.core.uploads import check_upload

        return check_upload(value)


class SuggestionSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    decided_by = UserBriefSerializer(read_only=True)
    scope_display = serializers.CharField(source="get_scope_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    # Ovoz sonlari - `api.py` da annotatsiya qilinadi.
    for_count = serializers.IntegerField(read_only=True)
    against_count = serializers.IntegerField(read_only=True)
    neutral_count = serializers.IntegerField(read_only=True)
    score = serializers.IntegerField(read_only=True)
    my_vote = serializers.CharField(read_only=True, allow_null=True)

    files = SuggestionFileSerializer(many=True, read_only=True)

    is_mine = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_decide = serializers.SerializerMethodField()
    can_vote = serializers.SerializerMethodField()

    class Meta:
        model = Suggestion
        fields = [
            "id", "title", "body", "scope", "scope_display", "is_anonymous",
            "status", "status_display", "author",
            "decided_by", "decided_at", "decision_note",
            "for_count", "against_count", "neutral_count", "score", "my_vote",
            "files", "is_mine", "can_edit", "can_decide", "can_vote",
            "created_at", "updated_at",
        ]
        read_only_fields = ["status", "decided_by", "decided_at", "decision_note",
                            "created_at", "updated_at"]

    # ------------------------------------------------------------- maydonlar

    def get_author(self, obj):
        """Anonim taklifda muallif YO'Q - hech kim uchun."""
        if obj.is_anonymous:
            return None
        return UserBriefSerializer(obj.author, context=self.context).data

    def _me(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def get_is_mine(self, obj):
        me = self._me()
        return bool(me and me.is_authenticated and obj.author_id == me.id)

    def get_can_edit(self, obj):
        """Tahrirlash va o'chirish - faqat muallifga."""
        return self.get_is_mine(obj)

    def get_can_decide(self, obj):
        me = self._me()
        return bool(me and me.is_authenticated and me.is_boss)

    def get_can_vote(self, obj):
        """Ovoz faqat OCHIQ taklifda.

        Yopiq taklifni muallifdan va boshliqdan boshqa hech kim ko'rmaydi -
        u yerda ovoz berishning ma'nosi yo'q.
        """
        me = self._me()
        if not (me and me.is_authenticated):
            return False
        return obj.scope == SuggestionScope.OPEN

    # ------------------------------------------------------------- tekshiruv

    def validate_title(self, value):
        value = value.strip()
        if len(value) < 5:
            raise serializers.ValidationError("Sarlavha juda qisqa - kamida 5 belgi.")
        return value

    def validate_body(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError(
                "Taklif matni juda qisqa - nima taklif qilayotganingizni yozing.")
        return value

    def validate(self, attrs):
        """Yopiq taklif anonim bo'lmaydi.

        Yopiqni faqat muallif va boshliq ko'radi, ya'ni boshliq baribir
        kim yozganini bilishi kerak - aks holda savol berib bo'lmaydi.
        Anonimlik OCHIQ taklif uchun: jamoa oldida nomini aytmaslik uchun.
        """
        scope = attrs.get("scope", getattr(self.instance, "scope", SuggestionScope.OPEN))
        anon = attrs.get("is_anonymous", getattr(self.instance, "is_anonymous", False))
        if scope == SuggestionScope.CLOSED and anon:
            raise serializers.ValidationError(
                {"is_anonymous": "Yopiq taklif anonim bo'lmaydi - uni faqat boshliq ko'radi."})
        return attrs


class DecisionSerializer(serializers.Serializer):
    """Boshliqning qarori. Holatsiz yuborilsa - faqat izoh qoldiriladi."""

    status = serializers.ChoiceField(
        choices=[SuggestionStatus.APPROVED, SuggestionStatus.REJECTED],
        required=False)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)

    def validate(self, attrs):
        if "status" not in attrs and not attrs.get("note", "").strip():
            raise serializers.ValidationError(
                "Qaror yoki izoh - kamida bittasi bo'lsin.")
        # Rad etishda izoh majburiy: «yo'q» degan javob sababsiz qolmasin.
        if attrs.get("status") == SuggestionStatus.REJECTED and not attrs.get("note", "").strip():
            raise serializers.ValidationError(
                {"note": "Rad etish sababini yozing."})
        return attrs


class VoteSerializer(serializers.Serializer):
    choice = serializers.ChoiceField(choices=VoteChoice.choices)
