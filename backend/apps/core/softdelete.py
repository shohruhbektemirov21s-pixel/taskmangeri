"""Yumshoq o'chirish - «o'chirdim» degani «yo'qoldi» degani emas.

MUAMMO. Saytdan bir narsa o'chirilganda yozuv bazadan butunlay ketardi va
u bilan birga bog'liq hamma narsa ham: vazifa o'chirilsa izohlari, ish
jurnali, tekshiruvlari va biriktirilgan fayllari `CASCADE` bilan yo'q
bo'lardi; ish maydoni o'chirilsa ichidagi barcha loyihalar ketardi; fayl
o'chirilsa uning baytlari diskdan ham o'chirilardi. Bittagina noto'g'ri
bosilgan tugma qaytarib bo'lmaydigan yo'qotishga aylanardi.

YECHIM. Yozuv joyida qoladi, faqat `deleted_at` belgilanadi. Standart
menejer (`objects`) bunday qatorlarni ko'rsatmaydi - ya'ni ro'yxatlar,
sanoqlar va API javoblari oldingidek ishlayveradi. Hamma narsa kerak
bo'lsa `all_objects` bor: admin paneli, tekshiruv va tiklash shu orqali.

`projects.Project` da bu naqsh ilgaridan bor edi; shu modul uni umumiy
qilib beradi. Project o'zining maydonlarini saqlab qoldi (`deleted_by`
uchun `related_name="deleted_projects"` allaqachon ishlatilyapti va uni
o'zgartirish mavjud migratsiyalarga tegib ketardi).

NIMA O'CHADI. Bu qatlam «tarix» ma'nosidagi ma'lumot uchun. Foydalanuvchi
o'z bildirishnomalarini tozalagani - ma'lumot yo'qotish emas, shuning
uchun `Notification` bunga kirmaydi.
"""
from django.conf import settings
from django.contrib import admin
from django.db import models
from django.utils import timezone


class SoftDeleteQuerySet(models.QuerySet):
    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def dead(self):
        return self.filter(deleted_at__isnull=False)


class AliveManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    """Standart menejer: o'chirilgan qatorlarni ko'rsatmaydi.

    DIQQAT. Django teskari bog'lanish menejerini (`project.tasks`) STANDART
    menejer sinfidan yasaydi - demak u ham o'chirilganlarni yashiradi. Bu
    ro'yxatlar uchun to'g'ri, lekin «hammasi» kerak bo'lgan joyda (masalan
    vazifa raqamini tanlashda) ataylab `all_objects` yozilishi shart.
    """

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class SoftDeleteModel(models.Model):
    """Meros olgan model o'chirilganda yozuv bazada qoladi."""

    deleted_at = models.DateTimeField("Ochirilgan", null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True,
                                   related_name="%(app_label)s_%(class)s_deleted",
                                   verbose_name="Kim ochirgan")

    # Tartib muhim: birinchi menejer - standart menejer.
    objects = AliveManager()
    all_objects = models.Manager.from_queryset(SoftDeleteQuerySet)()

    class Meta:
        abstract = True

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    def _touch_fields(self, *names):
        """Faqat modelda haqiqatan bor maydonlarni qaytaradi.

        `updated_at` hamma modelda yo'q, `update_fields` ga yo'q maydonni
        bersak Django xato beradi.
        """
        have = {f.name for f in self._meta.fields}
        return [n for n in names if n in have]

    def soft_delete(self, actor=None):
        """Saytdan o'chirish: ma'lumot bazada qoladi."""
        if self.deleted_at is not None:
            return self
        self.deleted_at = timezone.now()
        self.deleted_by = actor if getattr(actor, "pk", None) else None
        self.save(update_fields=self._touch_fields(
            "deleted_at", "deleted_by", "updated_at"))
        return self

    def restore(self):
        """Qaytarish - admin panelidan yoki qo'lda."""
        self.deleted_at = None
        self.deleted_by = None
        self.save(update_fields=self._touch_fields(
            "deleted_at", "deleted_by", "updated_at"))
        return self


class SoftDeleteAdminMixin:
    """Admin panelida o'chirilganlar ham ko'rinadi va tiklanadi.

    Aks holda yumshoq o'chirilgan yozuvga umuman yeta olmasdik: standart
    menejer uni yashiradi, admin esa o'shani ishlatadi.
    """

    actions = ["restore_selected"]

    def get_queryset(self, request):
        model = self.model
        manager = getattr(model, "all_objects", model._default_manager)
        qs = manager.get_queryset()
        ordering = self.get_ordering(request)
        return qs.order_by(*ordering) if ordering else qs

    @admin.display(boolean=True, description="O'chirilgan")
    def ochirilgan(self, obj):
        return obj.deleted_at is not None

    def restore_selected(self, request, queryset):
        n = 0
        for obj in queryset:
            if obj.deleted_at is not None:
                obj.restore()
                n += 1
        self.message_user(request, "{} ta yozuv tiklandi.".format(n))

    restore_selected.short_description = "Tanlanganlarni tiklash"
