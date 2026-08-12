from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    author = UserBriefSerializer(read_only=True)
    recipient = UserBriefSerializer(read_only=True)
    recipient_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    scope = serializers.CharField(read_only=True)

    class Meta:
        model = ChatMessage
        fields = ["id", "scope", "project", "workspace",
                  "author", "recipient", "recipient_id", "text", "created_at"]
        read_only_fields = ["author", "created_at"]

    def validate_text(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Xabar bo'sh bo'lishi mumkin emas.")
        if len(value) > 4000:
            raise serializers.ValidationError("Xabar juda uzun (4000 belgidan ko'p).")
        return value

    def validate(self, attrs):
        targets = [attrs.get("project"), attrs.get("workspace"), attrs.get("recipient_id")]
        if sum(1 for t in targets if t) != 1:
            raise serializers.ValidationError({
                "detail": "Xabar aynan bitta manzilga yuborilishi kerak: "
                          "loyiha, ish maydoni yoki shaxsiy."})
        return attrs
