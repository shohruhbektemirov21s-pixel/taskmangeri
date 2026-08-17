from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import (TokenObtainPairSerializer,
                                                  TokenRefreshSerializer)

from .models import GlobalRole
from .specialties import Seniority, Specialty, specialty_catalog

User = get_user_model()


class UserBriefSerializer(serializers.ModelSerializer):
    """Kartochkalar va avatarlar uchun minimal ma'lumot."""

    initials = serializers.CharField(read_only=True)
    avatar_color = serializers.CharField(read_only=True)
    specialty_display = serializers.CharField(source="get_specialty_display", read_only=True)
    specialty_icon = serializers.CharField(read_only=True)
    specialty_color = serializers.CharField(read_only=True)
    seniority_display = serializers.CharField(source="get_seniority_display", read_only=True)
    # Nisbiy manzil: proksi Host ni almashtirsa ham brauzer rasmni ocha oladi.
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "full_name", "email", "job_title", "initials", "avatar_color", "avatar",
                  "is_platform_admin",
                  "specialty", "specialty_display", "specialty_icon", "specialty_color",
                  "seniority", "seniority_display"]

    def get_avatar(self, obj):
        from apps.core.media import media_url

        return media_url(obj.avatar)


class UserSerializer(serializers.ModelSerializer):
    initials = serializers.CharField(read_only=True)
    avatar_color = serializers.CharField(read_only=True)
    is_platform_admin = serializers.BooleanField(read_only=True)
    can_create_project = serializers.BooleanField(read_only=True)
    skill_list = serializers.ListField(read_only=True)
    global_role_display = serializers.CharField(source="get_global_role_display", read_only=True)

    # mutaxassislikka bogliq xususiyatlar
    specialty_display = serializers.CharField(source="get_specialty_display", read_only=True)
    seniority_display = serializers.CharField(source="get_seniority_display", read_only=True)
    specialty_icon = serializers.CharField(read_only=True)
    specialty_color = serializers.CharField(read_only=True)
    suggested_task_types = serializers.ListField(read_only=True)
    suggested_skills = serializers.ListField(read_only=True)
    quality_checklist = serializers.ListField(read_only=True)
    default_project_role = serializers.CharField(read_only=True)
    # Tajriba chegarasi royxatdan otishdagi bilan bir xil: 0-30 yil.
    years_experience = serializers.IntegerField(required=False, min_value=0, max_value=30)
    # Rasm /api/auth/me/avatar/ orqali yuklanadi, bu yerda faqat o'qiladi.
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "job_title", "global_role", "global_role_display",
            "specialty", "specialty_display", "specialty_icon", "specialty_color",
            "seniority", "seniority_display", "years_experience",
            "suggested_task_types", "suggested_skills", "quality_checklist",
            "default_project_role",
            "bio", "skills", "skill_list", "github_username", "telegram", "avatar",
            "initials", "avatar_color", "is_platform_admin", "can_create_project",
            "is_active", "date_joined",
        ]
        read_only_fields = ["email", "global_role", "is_active", "date_joined"]

    def get_avatar(self, obj):
        from apps.core.media import media_url

        return media_url(obj.avatar)


class UserAdminSerializer(UserSerializer):
    """Admin foydalanuvchi rolini va mutaxassisligini boshqara oladi."""

    project_count = serializers.IntegerField(read_only=True)
    open_tasks = serializers.IntegerField(read_only=True)

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["project_count", "open_tasks"]
        read_only_fields = ["email", "date_joined"]


class UserListSerializer(UserBriefSerializer):
    """Odamlar ro'yxati - kartochka uchun yetarli, shaxsiy kontaktsiz.

    Ilgari ro'yxat `UserAdminSerializer` bilan qaytardi, ya'ni har bir
    so'rovda tizimdagi HAMMA odamning `bio`, `skills`, `telegram` va
    `github_username` maydonlari ham chiqib ketardi. Ro'yxatda ular
    ko'rsatilmaydi ham - kerak bo'lsa odamning o'z sahifasidan o'qiladi
    (`GET /api/users/<id>/`).

    Email qoldi: u jamoa ichida odamni aniqlashning asosiy yo'li -
    qidiruv ham, odam tanlash oynasi ham unga tayanadi.
    """

    global_role_display = serializers.CharField(source="get_global_role_display",
                                                read_only=True)
    project_count = serializers.IntegerField(read_only=True)
    open_tasks = serializers.IntegerField(read_only=True)

    class Meta(UserBriefSerializer.Meta):
        fields = UserBriefSerializer.Meta.fields + [
            "global_role", "global_role_display", "years_experience",
            "is_active", "date_joined", "project_count", "open_tasks",
        ]


class RegisterSerializer(serializers.ModelSerializer):
    """Royxatdan otish - faqat mutaxassislik majburiy.

    Daraja va tajriba keyinchalik profilda toldiriladi.
    """

    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    specialty = serializers.ChoiceField(choices=Specialty.choices, required=True)
    seniority = serializers.ChoiceField(choices=Seniority.choices, required=False,
                                        default=Seniority.JUNIOR)
    years_experience = serializers.IntegerField(required=False, min_value=0, max_value=30,
                                                default=0)

    class Meta:
        model = User
        fields = ["email", "full_name", "specialty", "seniority", "years_experience",
                  "job_title", "skills", "github_username", "password", "password_confirm"]

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Bu email allaqachon royxatdan otgan.")
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "Parollar mos kelmadi."})
        validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        """Lavozim mutaxassislikdan olinadi, ko'nikmalar esa - yo'q.

        Ilgari tanlangan yo'nalishga qarab ko'nikmalar ham to'ldirilardi
        (Backend -> Python, Django, PostgreSQL...). Bu noto'g'ri edi: odam
        o'zi aytmagan narsa profilida bilaman deb turardi. Endi ko'nikmalarni
        faqat egasi qo'shadi - katalogdagi ro'yxat esa profil tahririda
        bosib qo'shiladigan taklif sifatida qoladi (`suggested_skills`).
        """
        specialty = validated_data.get("specialty")

        if not (validated_data.get("job_title") or "").strip():
            validated_data["job_title"] = dict(Specialty.choices).get(specialty, "")
        # Loyiha menejeri mutaxassisligi tanlansa tizim roli ham menejer boladi
        if specialty == Specialty.PM:
            validated_data["global_role"] = GlobalRole.MANAGER

        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class TokenSerializer(TokenObtainPairSerializer):
    """Login javobiga foydalanuvchi ma'lumotini ham qoshamiz."""

    username_field = "email"

    default_error_messages = {
        "no_active_account": "Email yoki parol xato.",
    }

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["full_name"] = user.full_name
        token["role"] = user.global_role
        token["specialty"] = user.specialty
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user, context=self.context).data
        return data


class RefreshSerializer(TokenRefreshSerializer):
    """`djangorestframework-simplejwt` 5.5.1 dagi xato ustidan qoplama.

    Kutubxona refresh tokendagi foydalanuvchini `objects.get()` bilan oladi
    va topilmasa `DoesNotExist` ni ushlamaydi. Natijada hisobi o'chirilgan
    odamning brauzeri token yangilashga urinsa 401 o'rniga 500 ko'rardi.
    Token to'g'ri-yu egasi yo'q bo'lsa - bu autentifikatsiya xatosi,
    server xatosi emas.
    """

    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except User.DoesNotExist:
            raise AuthenticationFailed("Hisob topilmadi yoki o'chirilgan.",
                                       code="no_active_account")


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class SpecialtyCatalogSerializer(serializers.Serializer):
    """Frontend uchun mutaxassisliklar katalogi (faqat o'qish)."""

    @staticmethod
    def catalog():
        return specialty_catalog()
