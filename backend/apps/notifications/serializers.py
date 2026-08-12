from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserBriefSerializer(read_only=True)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "kind", "kind_display", "title", "body", "url",
                  "meta", "is_read", "actor", "created_at"]
        read_only_fields = fields
