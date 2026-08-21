from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import Workspace, WorkspaceMember, WorkspaceRole


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
    # Loyihadagi bilan bir xil qoida (`projects.ProjectSerializer.join_code`):
    # taklif kodi bilan kelgan odam YOPIQ maydonga ham so'rovsiz kiradi
    # (`WorkspaceViewSet.join`), ya'ni kod - parol. Hamma loyihani
    # ko'radiganlar (boshliq, global menejer) ro'yxatda yopiq maydonlarni
    # ham ko'radigan bo'lgandan keyin, kodning javobda turishi ularga
    # istalgan maydonga kirish yo'lini ochib qo'yardi.
    join_code = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = ["id", "name", "slug", "description", "color", "owner", "join_code",
                  "is_open", "created_at", "member_count", "project_count",
                  "my_role", "can_manage"]
        read_only_fields = ["slug", "owner", "color"]

    def _user(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def _role(self, obj, user):
        """Foydalanuvchining shu maydondagi roli (yoki `None`).

        `WorkspaceViewSet` uni ro'yxat bilan birga oldindan oladi
        (`my_role_value`). Annotatsiya bo'lmasa - bitta yozuv alohida
        olinganda, masalan yaratilgandan keyin - bazadan o'qiydi.

        NEGA MUHIM. `my_role` va `can_manage` ikkovi ham shu javobga
        kerak va ikkovi ham a'zolikni so'raydi: annotatsiyasiz ro'yxatdagi
        HAR BIR maydon uchun ikkitadan qo'shimcha so'rov ketardi. Loyihalar
        ro'yxati bu qoidaga ilgaridan amal qiladi (`prefetch_related`),
        ish maydonlari esa chetda qolib ketgan edi.
        """
        if hasattr(obj, "my_role_value"):
            return obj.my_role_value
        return obj.role_of(user)

    def get_my_role(self, obj):
        user = self._user()
        if not user or not user.is_authenticated:
            return None
        return self._role(obj, user)

    def get_can_manage(self, obj):
        """`Workspace.can_manage` bilan AYNI qoida, faqat so'rovsiz.

        Model metodi joyida qoladi - view'lar (`perform_update`,
        `set_member`) bitta obyekt ustida ishlaganda o'shani chaqiradi.
        Bu yerda esa ro'yxat bor, shuning uchun javob annotatsiyadan
        yig'iladi.
        """
        from apps.projects.permissions import runs_everything

        user = self._user()
        if not user or not user.is_authenticated:
            return False
        if runs_everything(user) or obj.owner_id == user.id:
            return True
        return self._role(obj, user) in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN)

    def get_join_code(self, obj):
        """Kodni faqat maydonni BOSHQARADIGAN odam ko'radi (aks holda `null`)."""
        return obj.join_code if self.get_can_manage(obj) else None


class WorkspaceDetailSerializer(WorkspaceSerializer):
    members = WorkspaceMemberSerializer(source="memberships", many=True, read_only=True)

    class Meta(WorkspaceSerializer.Meta):
        fields = WorkspaceSerializer.Meta.fields + ["members"]
