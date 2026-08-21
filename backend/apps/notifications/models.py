from django.conf import settings
from django.db import models

from apps.core.fields import JSONTextField


class NotificationKind(models.TextChoices):
    """Qo'ng'iroqqa nima tushadi.

    Ataylab qisqa ro'yxat: bildirishnoma javob talab qiladigan narsa uchun.
    Har bir jamoa harakati qo'ng'iroq chalsa, odam unga qarashni butunlay
    to'xtatadi va haqiqiy ish ham ko'zdan qoladi. Qolgani tarixda
    (`activity.Activity`) yoziladi va u yerdan o'qiladi.
    """

    # Ish - odamning o'z vazifasi
    TASK_ASSIGNED = "task.assigned", "Vazifa biriktirildi"
    # Ish boshqa odamga o'tdi: eski ijrochi eski topshiriq ustida ishlab
    # yurmasin. Yangi ijrochiga esa odatdagi "biriktirildi" ketadi.
    TASK_REASSIGNED = "task.reassigned", "Vazifa o'tkazildi"
    TASK_REVIEW = "task.review", "Tekshiruvga tushdi"
    TASK_DECIDED = "task.decided", "Tekshiruv natijasi"
    TASK_COMMENT = "task.comment", "Yangi izoh"
    # Suhbat - kimdir to'g'ridan-to'g'ri yozdi
    CHAT_MESSAGE = "chat.message", "Chat xabari"
    CHAT_DIRECT = "chat.direct", "Shaxsiy xabar"
    # Qo'shilish so'rovi - javobsiz qolmasin (so'rov ham, javobi ham)
    JOIN_REQUEST = "join.request", "Qo'shilish so'rovi"
    # Loyiha muddati yaqinlashdi - 1 hafta va 3 kun qolganda
    PROJECT_DEADLINE = "project.deadline", "Loyiha muddati yaqin"
    # Taklif - javob KUTIB turadigan narsa, shuning uchun qo'ng'iroqqa
    # tushadi: yangisi boshliqqa, qarori esa muallifga boradi. Ovoz
    # berilgani bu yerga TUSHMAYDI - u kutish emas, jamoaning fikri.
    SUGGESTION_NEW = "suggestion.new", "Yangi taklif"
    SUGGESTION_DECIDED = "suggestion.decided", "Taklif bo'yicha qaror"


class Notification(models.Model):
    """Bitta foydalanuvchiga atalgan xabar.

    Tarix (`activity.Activity`) dan farqi: tarix - loyiha xotirasi, o'chmaydi va
    hammaga tegishli. Bildirishnoma esa aniq bir odamga qaratilgan va o'qilgach
    so'nadi.
    """

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                  related_name="notifications", verbose_name="Kimga")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name="sent_notifications",
                              verbose_name="Kim sabab bo'ldi")

    kind = models.CharField("Turi", max_length=32, choices=NotificationKind.choices,
                            db_index=True)
    title = models.CharField("Sarlavha", max_length=200)
    body = models.CharField("Matn", max_length=400, blank=True)
    url = models.CharField("Havola", max_length=300, blank=True,
                           help_text="Interfeys ichidagi manzil, masalan /vazifa/12")
    meta = JSONTextField("Qo'shimcha", default=dict, blank=True)

    is_read = models.BooleanField("O'qilgan", default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Bildirishnoma"
        verbose_name_plural = "Bildirishnomalar"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
        ]

    def __str__(self):
        return "{} -> {}".format(self.kind, self.recipient)

    def mark_read(self):
        if not self.is_read:
            self.is_read = True
            self.save(update_fields=["is_read"])
        return self
