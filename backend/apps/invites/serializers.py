from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import Invitation


class InvitationSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True)
    invited_by = UserBriefSerializer(read_only=True)

    scope = serializers.CharField(read_only=True)
    target_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(read_only=True)
    url = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True, default="")
    project_key = serializers.CharField(source="project.key", read_only=True, default="")

    class Meta:
        model = Invitation
        fields = ["id", "scope", "workspace", "workspace_slug", "project", "project_key",
                  "target_name", "user", "user_id", "invited_by", "role", "role_display",
                  "message", "status", "status_display", "url", "responded_at", "created_at"]
        read_only_fields = ["status", "responded_at", "invited_by"]
        extra_kwargs = {
            "workspace": {"required": False, "allow_null": True},
            "project": {"required": False, "allow_null": True},
        }

    def validate(self, attrs):
        if bool(attrs.get("workspace")) == bool(attrs.get("project")):
            raise serializers.ValidationError(
                {"detail": "Taklif yo ish maydoniga, yo loyihaga bo'lishi kerak."})
        return attrs
