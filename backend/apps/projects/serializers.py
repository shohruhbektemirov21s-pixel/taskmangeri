from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import (JoinRequest, Project, ProjectBrief, ProjectFile, ProjectMember,
                     ProjectRole)


class ProjectMemberSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    open_tasks = serializers.IntegerField(read_only=True)
    done_tasks = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProjectMember
        fields = ["id", "user", "user_id", "role", "role_display", "is_active",
                  "joined_at", "left_at", "handover_note", "open_tasks", "done_tasks"]
        read_only_fields = ["is_active", "joined_at", "left_at"]


class JoinRequestSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)
    decided_by = UserBriefSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    desired_role_display = serializers.CharField(source="get_desired_role_display", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)

    class Meta:
        model = JoinRequest
        fields = ["id", "project", "project_name", "user", "message", "desired_role",
                  "desired_role_display", "status", "status_display", "decided_by",
                  "decided_at", "decision_note", "created_at"]
        read_only_fields = ["project", "user", "status", "decided_by", "decided_at"]

    def validate_desired_role(self, value):
        if value == ProjectRole.MANAGER:
            raise serializers.ValidationError("Menejer rolini sorab bolmaydi.")
        return value


class ProjectBriefSerializer(serializers.ModelSerializer):
    updated_by = UserBriefSerializer(read_only=True)
    filled_ratio = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProjectBrief
        fields = ["goal", "tech_stack", "architecture", "setup_steps", "conventions",
                  "definition_of_done", "pitfalls", "contacts", "updated_by",
                  "updated_at", "filled_ratio"]


class ProjectSerializer(serializers.ModelSerializer):
    manager = UserBriefSerializer(read_only=True)
    manager_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    created_by = UserBriefSerializer(read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    member_count = serializers.IntegerField(read_only=True)
    open_tasks = serializers.IntegerField(read_only=True)
    done_tasks = serializers.IntegerField(read_only=True)
    my_tasks = serializers.IntegerField(read_only=True)
    progress = serializers.SerializerMethodField()
    access = serializers.SerializerMethodField()
    needed_specialty_labels = serializers.SerializerMethodField()
    team_composition = serializers.SerializerMethodField()
    specialty_gaps = serializers.SerializerMethodField()
    matches_my_specialty = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ["id", "workspace", "workspace_name", "workspace_slug", "name", "key",
                  "description", "status", "status_display", "color", "manager", "manager_id",
                  "created_by", "repo_url", "docs_url", "start_date", "due_date",
                  "is_public", "join_code", "auto_accept", "created_at", "updated_at",
                  "member_count", "open_tasks", "done_tasks", "my_tasks", "progress", "access",
                  "needed_specialties", "needed_specialty_labels", "team_composition",
                  "specialty_gaps", "matches_my_specialty"]
        read_only_fields = ["join_code", "created_by", "key", "color"]

    def validate(self, attrs):
        """Tugash sanasi boshlanishdan oldin bo'lib qolmasin.

        Interfeys ham buni to'sadi, lekin API to'g'ridan-to'g'ri chaqirilsa
        teskari sanalar muddat bashoratini ma'nosiz qilib qo'yardi.
        """
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        due = attrs.get("due_date", getattr(self.instance, "due_date", None))
        if start and due and due < start:
            raise serializers.ValidationError({
                "due_date": "Tugash sanasi boshlanish sanasidan oldin bo'la olmaydi."
            })
        return attrs

    def get_progress(self, obj):
        return obj.progress()

    def get_needed_specialty_labels(self, obj):
        return obj.needed_specialty_labels()

    def get_team_composition(self, obj):
        return obj.team_composition()

    def get_specialty_gaps(self, obj):
        from apps.accounts.specialties import Specialty

        names = dict(Specialty.choices)
        return [{"value": v, "label": names.get(v, v)} for v in obj.specialty_gaps()]

    def get_matches_my_specialty(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.matches_user(request.user)

    def get_access(self, obj):
        from apps.core.permissions import ProjectAccess

        request = self.context.get("request")
        if not request:
            return {}
        return ProjectAccess(request.user, obj).as_dict()


class ProjectDetailSerializer(ProjectSerializer):
    brief = ProjectBriefSerializer(read_only=True)
    members = serializers.SerializerMethodField()
    status_counts = serializers.SerializerMethodField()
    pending_requests = serializers.SerializerMethodField()

    class Meta(ProjectSerializer.Meta):
        fields = ProjectSerializer.Meta.fields + ["brief", "members", "status_counts",
                                                  "pending_requests"]

    def get_members(self, obj):
        qs = obj.memberships.filter(is_active=True).select_related("user").order_by("role")
        return ProjectMemberSerializer(qs, many=True, context=self.context).data

    def get_status_counts(self, obj):
        from django.db.models import Count

        from apps.tasks.models import TaskStatus

        counts = {s: 0 for s in TaskStatus.values}
        for row in obj.tasks.values("status").annotate(c=Count("id")):
            counts[row["status"]] = row["c"]
        return counts

    def get_pending_requests(self, obj):
        from .models import RequestStatus

        return obj.join_requests.filter(status=RequestStatus.PENDING).count()


class ProjectFileSerializer(serializers.ModelSerializer):
    """Loyihaga biriktirilgan fayl."""

    uploaded_by = UserBriefSerializer(read_only=True)
    size_display = serializers.CharField(read_only=True)
    extension = serializers.CharField(read_only=True)
    is_image = serializers.BooleanField(read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = ProjectFile
        fields = ["id", "file", "url", "original_name", "size", "size_display", "content_type",
                  "description", "extension", "is_image", "uploaded_by", "created_at"]
        read_only_fields = ["original_name", "size", "content_type", "uploaded_by", "created_at"]

    def get_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.file.url) if request else obj.file.url

    def validate_file(self, value):
        limit = 25 * 1024 * 1024
        if value.size > limit:
            raise serializers.ValidationError("Fayl hajmi 25 MB dan oshmasligi kerak.")
        return value
