from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import Activity


class ActivitySerializer(serializers.ModelSerializer):
    actor = UserBriefSerializer(read_only=True)
    icon = serializers.CharField(read_only=True)
    category = serializers.CharField(read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    task_code = serializers.SerializerMethodField()

    class Meta:
        model = Activity
        fields = ["id", "verb", "summary", "detail", "meta", "target_label", "icon",
                  "category", "actor", "project", "project_name", "task", "task_code",
                  "workspace", "created_at"]

    def get_task_code(self, obj):
        return obj.task.code if obj.task_id else None
