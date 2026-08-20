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
    is_boss = serializers.BooleanField(read_only=True)
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
            "bio", "skills", "skill_list", "telegram", "avatar",
            "initials", "avatar_color", "is_platform_admin", "is_boss", "can_create_project",
            "is_active", "date_joined",
        ]
        read_only_fields = ["email", "global_role", "is_active", "date_joined"]

    def get_avatar(self, obj):
        from apps.core.media import media_url

        return media_url(obj.avatar)


class MeSerializer(UserSerializer):
    """O'z hisobi - `/api/auth/me/`, kirish va ro'yxatdan o'tish javobi.

    `manages_projects` FAQAT shu yerda: interfeys shunga qarab ikkiga
    bo'linadi - loyihalarni boshqaradigan odam loyihalar ro'yxatini va
    jamoaning ish yukini ko'radi, ijrochi esa o'z vazifalarini.

    NEGA `UserSerializer` DA EMAS. Bu maydon bazaga so'rov qiladi, o'sha
    seriyalizator esa foydalanuvchilar RO'YXATIDA ham ishlatiladi
    (`UserAdminSerializer`) - u yerda har odam uchun bitta qo'shimcha
    so'rov bo'lardi (N+1). O'z hisobi esa bitta.

    `can_create_project` bilan aralashtirmang: u ROLdan kelib chiqadi
    (menejer/admin yangi loyiha ocha oladi), bu esa AMALDAGI holat -
    global roli dasturchi bo'lgan odam ham biror loyihaga menejer qilib
    qo'yilgan bo'lishi mumkin.
    """

    manages_projects = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["manages_projects"]

    def get_manages_projects(self, obj):
        from apps.core.permissions import managed_projects_q
        from apps.projects.models import Project

        if obj.is_platform_admin:
            return True
        return Project.objects.filter(managed_projects_q(obj)).exists()


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
    so'rovda tizimdagi HAMMA odamning `bio`, `skills` va `telegram`
    maydonlari ham chiqib ketardi. Ro'yxatda ular
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


class AdminCreateUserSerializer(serializers.ModelSerializer):
    """Admin panelidan hisob ochish.

    `RegisterSerializer` dan farqi ikkita:
      * parol TAKRORLANMAYDI - uni admin qo'yadi, egasiga aytadi;
      * `email` odatdagi pochta bo'lishi shart emas. Bo'limda loginlar
        familiya ko'rinishida beriladi (`Abdraxmanov`) va tizim shu
        maydonni login sifatida ishlatadi (`USERNAME_FIELD = "email"`).

    Parol siyosati esa BIR XIL: `validate_password` shu yerda ham
    chaqiriladi, ya'ni admin ham qisqa parol qo'ya olmaydi.
    """

    # `EmailField` EMAS: model maydoni `EmailField` bo'lgani uchun
    # `ModelSerializer` uni o'zi shunday yasab qo'yardi va `Abdraxmanov`
    # kabi login «to'g'ri pochta emas» deb rad etilardi. Tekshiruv
    # `validate_email` da - u loginga mos qoidalarni qo'llaydi.
    email = serializers.CharField(max_length=254)
    password = serializers.CharField(write_only=True, min_length=8)
    specialty = serializers.ChoiceField(choices=Specialty.choices, required=False,
                                        default=Specialty.BACKEND)
    seniority = serializers.ChoiceField(choices=Seniority.choices, required=False,
                                        default=Seniority.JUNIOR)
    global_role = serializers.ChoiceField(choices=GlobalRole.choices, required=False,
                                          default=GlobalRole.DEVELOPER)

    class Meta:
        model = User
        fields = ["email", "full_name", "specialty", "seniority", "global_role",
                  "job_title", "password"]

    def validate_email(self, value):
        login = (value or "").strip().lower()
        if not login:
            raise serializers.ValidationError("Login yozing.")
        if " " in login:
            raise serializers.ValidationError("Loginda bo'sh joy bo'lmaydi.")
        if User.objects.filter(email__iexact=login).exists():
            raise serializers.ValidationError("Bu login band.")
        return login

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, data):
        password = data.pop("password")
        user = User(**data)
        user.set_password(password)
        user.save()
        return user


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
                  "job_title", "skills", "password", "password_confirm"]

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
        data["user"] = MeSerializer(self.user, context=self.context).data
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
