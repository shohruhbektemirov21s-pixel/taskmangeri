from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import (Attachment, Comment, Label, Review, ReviewVerdict, Task,
                     TaskAssignment, TaskPriority, TaskStatus, TaskType, WorkLog)


class LabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = ["id", "name", "color"]


class AttachmentSerializer(serializers.ModelSerializer):
    """Vazifaga biriktirilgan fayl."""

    uploaded_by = UserBriefSerializer(read_only=True)
    size_display = serializers.CharField(read_only=True)
    extension = serializers.CharField(read_only=True)
    is_image = serializers.BooleanField(read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
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


class CommentSerializer(serializers.ModelSerializer):
    author = UserBriefSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "author", "body", "created_at", "edited_at"]
        read_only_fields = ["author", "created_at", "edited_at"]


class WorkLogSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)
    task_code = serializers.CharField(source="task.code", read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)

    class Meta:
        model = WorkLog
        fields = ["id", "user", "hours", "note", "work_date", "created_at",
                  "task", "task_code", "task_title"]
        read_only_fields = ["user", "task", "created_at"]


class ReviewSerializer(serializers.ModelSerializer):
    reviewer = UserBriefSerializer(read_only=True)
    verdict_display = serializers.CharField(source="get_verdict_display", read_only=True)
    task_code = serializers.CharField(source="task.code", read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "reviewer", "verdict", "verdict_display", "comment",
                  "round_no", "created_at", "task", "task_code", "task_title"]
        read_only_fields = ["reviewer", "round_no", "created_at", "task"]

    def validate(self, attrs):
        verdict = attrs.get("verdict")
        comment = (attrs.get("comment") or "").strip()
        if verdict in (ReviewVerdict.CHANGES_REQUESTED, ReviewVerdict.REJECTED) and not comment:
            raise serializers.ValidationError({
                "comment": "Qaytarayotgan bolsangiz sababini yozing - aks holda dasturchi vaqt yoqotadi."
            })
        return attrs


class TaskSerializer(serializers.ModelSerializer):
    code = serializers.CharField(read_only=True)
    assignees = serializers.SerializerMethodField()
    assignee_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True,
                                         required=False)
    reviewer = UserBriefSerializer(read_only=True)
    reviewer_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    created_by = UserBriefSerializer(read_only=True)
    labels = LabelSerializer(many=True, read_only=True)
    label_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True,
                                      required=False)

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_label = serializers.CharField(read_only=True)
    type_display = serializers.CharField(source="get_task_type_display", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    project_key = serializers.CharField(source="project.key", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    logged_hours = serializers.DecimalField(max_digits=8, decimal_places=1, read_only=True)
    specialty_label = serializers.CharField(read_only=True)
    attachment_count = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = ["id", "project", "project_name", "project_key", "number", "code",
                  "title", "description", "acceptance_criteria",
                  "status", "status_display", "priority", "priority_label",
                  "task_type", "type_display", "required_specialty", "specialty_label",
                  "created_by", "reviewer", "reviewer_id",
                  "parent", "labels", "label_ids", "assignees", "assignee_ids",
                  "due_date", "estimate_hours", "branch_name", "pr_url", "blocked_reason",
                  "review_round", "is_overdue", "logged_hours", "attachment_count",
                  "created_at", "updated_at", "started_at", "submitted_at", "completed_at"]
        read_only_fields = ["project", "number", "created_by", "review_round",
                            "started_at", "submitted_at", "completed_at"]

    def get_attachment_count(self, obj):
        return obj.attachments.count()

    def get_assignees(self, obj):
        users = [a.user for a in obj.assignments.all() if a.is_active]
        return UserBriefSerializer(users, many=True, context=self.context).data


class TaskDetailSerializer(TaskSerializer):
    comments = CommentSerializer(many=True, read_only=True)
    reviews = ReviewSerializer(many=True, read_only=True)
    worklogs = WorkLogSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    subtasks = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()
    access = serializers.SerializerMethodField()
    suitable_members = serializers.SerializerMethodField()
    mismatched_assignees = serializers.SerializerMethodField()
    quality_checklist = serializers.SerializerMethodField()

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + ["comments", "reviews", "worklogs",
                                               "attachments",
                                               "subtasks", "allowed_transitions", "access",
                                               "suitable_members", "mismatched_assignees",
                                               "quality_checklist"]

    def get_suitable_members(self, obj):
        return UserBriefSerializer(obj.suitable_members(), many=True, context=self.context).data

    def get_mismatched_assignees(self, obj):
        return UserBriefSerializer(obj.mismatched_assignees(), many=True,
                                   context=self.context).data

    def get_quality_checklist(self, obj):
        from apps.accounts.specialties import profile_for

        if obj.required_specialty:
            return profile_for(obj.required_specialty)["checklist"]
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return request.user.quality_checklist
        return []

    def get_subtasks(self, obj):
        return TaskSerializer(obj.subtasks.all(), many=True, context=self.context).data

    def _access(self):
        from apps.core.permissions import ProjectAccess

        request = self.context.get("request")
        return ProjectAccess(request.user, self.instance.project) if request else None

    def get_allowed_transitions(self, obj):
        access = self._access()
        if not access:
            return []
        return [{"value": s, "label": TaskStatus(s).label} for s in obj.allowed_transitions(access)]

    def get_access(self, obj):
        access = self._access()
        return access.as_dict() if access else {}


class BulkTaskSerializer(serializers.Serializer):
    """Bir nechta vazifani bir urinishda yaratish."""

    titles = serializers.ListField(child=serializers.CharField(max_length=250),
                                   allow_empty=False, max_length=100)
    assignee_ids = serializers.ListField(child=serializers.IntegerField(), required=False,
                                         default=list)
    distribute = serializers.BooleanField(default=False)
    priority = serializers.ChoiceField(choices=TaskPriority.choices,
                                       default=TaskPriority.MEDIUM)
    task_type = serializers.ChoiceField(choices=TaskType.choices, default=TaskType.FEATURE)
    status = serializers.ChoiceField(choices=TaskStatus.choices, default=TaskStatus.TODO)
    required_specialty = serializers.CharField(required=False, allow_blank=True, default="")
    match_by_specialty = serializers.BooleanField(
        default=False,
        help_text="Belgilansa vazifalar faqat mos mutaxassislarga taqsimlanadi")
    due_date = serializers.DateField(required=False, allow_null=True)
    acceptance_criteria = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_titles(self, value):
        cleaned = [t.strip(" -*\t") for t in value]
        cleaned = [t for t in cleaned if t]
        if not cleaned:
            raise serializers.ValidationError("Kamida bitta vazifa yozing.")
        return cleaned


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=TaskStatus.choices)
    blocked_reason = serializers.CharField(required=False, allow_blank=True, default="")
