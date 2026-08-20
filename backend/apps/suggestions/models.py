"""Takliflar — jamoa nima o'zgarishini xohlaydi va boshliq nima deydi.

IKKI XIL TAKLIF:

  * **Ochiq** — hamma ko'radi va ovoz beradi. Ko'p qo'llab-quvvatlangani
    ro'yxatning boshiga chiqadi, ya'ni boshliq eng ko'p kutilgan
    o'zgarishni birinchi ko'radi.
  * **Yopiq** — faqat muallif va boshliq ko'radi. Jamoa oldida aytilmaydigan
    gap uchun: shikoyat, maosh, shaxsiy holat.

IKKI XIL MUALLIF. Ochiq taklif nomi bilan ham, anonim ham bo'ladi. Anonim
tanlangan bo'lsa muallif HECH KIMGA ko'rsatilmaydi — boshliqqa ham. Aks
holda anonimlik va'da bo'lib qolardi-yu, himoya bo'lmasdi.

OVOZ BERGAN KIM — SIR. Jadvalda `user` bor (bir odam bir marta ovoz
bersin), lekin u hech qayerda ko'rsatilmaydi: na API da, na `django-admin/`
da. Tashqariga faqat SONLAR chiqadi va so'rayotgan odamning O'Z tanlovi.
"""
from django.conf import settings
from django.db import models


class SuggestionScope(models.TextChoices):
    OPEN = "OPEN", "Ochiq"
    CLOSED = "CLOSED", "Yopiq"


class SuggestionStatus(models.TextChoices):
    PENDING = "PENDING", "Ko'rib chiqilmoqda"
    APPROVED = "APPROVED", "Tasdiqlangan"
    REJECTED = "REJECTED", "Rad etilgan"


class VoteChoice(models.TextChoices):
    FOR = "FOR", "Qo'shilaman"
    AGAINST = "AGAINST", "Qo'shilmayman"
    NEUTRAL = "NEUTRAL", "Betarafman"


class Suggestion(models.Model):
    """Bitta taklif."""

    title = models.CharField("Sarlavha", max_length=200)
    body = models.TextField("Taklif matni")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="suggestions", verbose_name="Muallif")
    scope = models.CharField("Turi", max_length=10, choices=SuggestionScope.choices,
                             default=SuggestionScope.OPEN, db_index=True)
    is_anonymous = models.BooleanField("Anonim", default=False,
                                       help_text="Muallif hech kimga ko'rsatilmaydi")

    status = models.CharField("Holat", max_length=10, choices=SuggestionStatus.choices,
                              default=SuggestionStatus.PENDING, db_index=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="decided_suggestions",
                                   verbose_name="Qaror qilgan")
    decided_at = models.DateTimeField("Qaror vaqti", null=True, blank=True)
    decision_note = models.TextField("Boshliq izohi", blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Taklif"
        verbose_name_plural = "Takliflar"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["scope", "-created_at"]),
            models.Index(fields=["author", "-created_at"]),
        ]

    def __str__(self):
        return self.title

    @property
    def is_open(self):
        return self.scope == SuggestionScope.OPEN

    @property
    def is_decided(self):
        return self.status != SuggestionStatus.PENDING

    def clear_decision(self):
        """Qarorni bekor qiladi — taklif matni o'zgarganda chaqiriladi.

        NEGA. Boshliq «A» ni tasdiqlagan bo'lsa va muallif matnni «B» ga
        almashtirsa, tasdiq boshqa narsaga yopishib qolardi. Shuning uchun
        tahrirdan keyin taklif yana navbatga tushadi va boshliq yangi
        matnni ko'radi.
        """
        self.status = SuggestionStatus.PENDING
        self.decided_by = None
        self.decided_at = None
        self.decision_note = ""


class SuggestionVote(models.Model):
    """Bir odamning bir taklifga bergan ovozi.

    Fikri o'zgarsa qayta bosadi — yangi qator yaratilmaydi, borig'i
    yangilanadi (`unique_together`).
    """

    suggestion = models.ForeignKey(Suggestion, on_delete=models.CASCADE,
                                   related_name="votes", verbose_name="Taklif")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="suggestion_votes", verbose_name="Kim")
    choice = models.CharField("Tanlov", max_length=10, choices=VoteChoice.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Taklif ovozi"
        verbose_name_plural = "Taklif ovozlari"
        unique_together = ("suggestion", "user")
        indexes = [models.Index(fields=["suggestion", "choice"])]

    def __str__(self):
        # Kim ovoz berganini yozmaymiz - log va admin ro'yxatida ham sir qolsin.
        return "{}: {}".format(self.suggestion_id, self.get_choice_display())


def suggestion_file_path(instance, filename):
    return "suggestions/{}/{}".format(instance.suggestion_id, filename)


class SuggestionFile(models.Model):
    """Taklifga biriktirilgan fayl: hujjat, chizma, hisob-kitob.

    KIM YUKLAGANI KO'RINADI — ro'yxatda fayl nomi yonida odamning ismi
    turadi. YAGONA ISTISNO: anonim taklif. U yerda ism chiqsa anonimlik
    faylning ostidan buzilardi, shuning uchun `SuggestionFileSerializer`
    anonim taklifda yuklovchini ham yashiradi.

    Faylni faqat taklif muallifi qo'shadi va o'chiradi — taklifning o'zi
    ham faqat unga tegishli.
    """

    suggestion = models.ForeignKey(Suggestion, on_delete=models.CASCADE,
                                   related_name="files", verbose_name="Taklif")
    file = models.FileField("Fayl", upload_to=suggestion_file_path)
    original_name = models.CharField("Fayl nomi", max_length=255, blank=True)
    size = models.PositiveBigIntegerField("Hajmi (bayt)", default=0)
    content_type = models.CharField("Turi", max_length=120, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name="suggestion_files",
                                    verbose_name="Yuklagan")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Taklif fayli"
        verbose_name_plural = "Taklif fayllari"
        ordering = ["created_at"]

    def __str__(self):
        return self.original_name or str(self.file)

    def save(self, *args, **kwargs):
        # Asl nomi va hajmi bir marta - fayl birinchi saqlanganda - yoziladi.
        # `upload_to` nomni o'zgartirishi mumkin, ro'yxatda esa odam
        # yuborgan nom ko'rinishi kerak.
        if self.file and not self.original_name:
            self.original_name = self.file.name.rsplit("/", 1)[-1][:255]
        if self.file and not self.size:
            try:
                self.size = self.file.size
            except Exception:
                self.size = 0
        super().save(*args, **kwargs)

    @property
    def size_display(self):
        n = float(self.size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if n < 1024:
                return "{:.0f} {}".format(n, unit) if unit == "B" else "{:.1f} {}".format(n, unit)
            n /= 1024
        return "{:.1f} TB".format(n)

    @property
    def extension(self):
        name = self.original_name or str(self.file)
        return name.rsplit(".", 1)[-1].lower() if "." in name else ""

    @property
    def is_image(self):
        return self.extension in ("png", "jpg", "jpeg", "gif", "webp", "bmp")
