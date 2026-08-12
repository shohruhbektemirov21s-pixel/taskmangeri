from django.conf import settings
from django.db import models


class NotificationKind(models.TextChoices):
    INVITE_RECEIVED = "invite.received", "Taklif keldi"
    INVITE_ACCEPTED = "invite.accepted", "Taklif qabul qilindi"
    INVITE_DECLINED = "invite.declined", "Taklif rad etildi"
    MEMBER_JOINED = "member.joined", "Yangi a'zo"
    JOIN_REQUEST = "join.request", "Qo'shilish so'rovi"
    TASK_ASSIGNED = "task.assigned", "Vazifa biriktirildi"
    TASK_REVIEW = "task.review", "Tekshiruvga tushdi"
    TASK_DECIDED = "task.decided", "Tekshiruv natijasi"
    TASK_COMMENT = "task.comment", "Yangi izoh"
    CHAT_MESSAGE = "chat.message", "Chat xabari"
    CHAT_DIRECT = "chat.direct", "Shaxsiy xabar"


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
    meta = models.JSONField("Qo'shimcha", default=dict, blank=True)

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
