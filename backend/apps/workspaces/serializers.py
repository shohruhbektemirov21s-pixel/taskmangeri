from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import Workspace, WorkspaceMember


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = ["id", "user", "user_id", "role", "role_display", "joined_at"]


class WorkspaceSerializer(serializers.ModelSerializer):
    owner = UserBriefSerializer(read_only=True)
    member_count = serializers.IntegerField(read_only=True)
    project_count = serializers.IntegerField(read_only=True)
    my_role = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = ["id", "name", "slug", "description", "color", "owner", "join_code",
                  "is_open", "created_at", "member_count", "project_count",
                  "my_role", "can_manage"]
        read_only_fields = ["slug", "join_code", "owner"]

    def _user(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def get_my_role(self, obj):
        user = self._user()
        if not user or not user.is_authenticated:
            return None
        return obj.role_of(user)

    def get_can_manage(self, obj):
        user = self._user()
        return bool(user and user.is_authenticated and obj.can_manage(user))


class WorkspaceDetailSerializer(WorkspaceSerializer):
    members = WorkspaceMemberSerializer(source="memberships", many=True, read_only=True)

    class Meta(WorkspaceSerializer.Meta):
        fields = WorkspaceSerializer.Meta.fields + ["members"]
