from django.conf import settings
from django.db import models

from apps.core.softdelete import SoftDeleteModel


class ChatMessage(SoftDeleteModel):
    """Suhbat xabari - uchta ko'rinishda.

    Vazifa izohlari (`tasks.Comment`) aniq bir ishga bog'langan va tarixda
    qoladi. Chat esa tezkor muloqot uchun: "kim band?", "buni kim biladi?".

    Xabar aynan bitta manzilga tegishli bo'ladi:
    `project` (loyiha suhbati), `workspace` (maydon suhbati) yoki
    `recipient` (ikki kishilik shaxsiy yozishma).
    """

    workspace = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE,
                                  null=True, blank=True, related_name="chat_messages",
                                  verbose_name="Ish maydoni")
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE,
                                null=True, blank=True, related_name="chat_messages",
                                verbose_name="Loyiha")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                  null=True, blank=True, related_name="direct_messages",
                                  verbose_name="Kimga (shaxsiy)")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="chat_messages", verbose_name="Muallif")
    text = models.TextField("Xabar")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Chat xabari"
        verbose_name_plural = "Chat xabarlari"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["project", "-created_at"]),
            models.Index(fields=["workspace", "-created_at"]),
            models.Index(fields=["recipient", "-created_at"]),
            models.Index(fields=["author", "-created_at"]),
        ]

    def __str__(self):
        return "{}: {}".format(self.author, self.text[:40])

    @property
    def scope(self):
        if self.recipient_id:
            return "direct"
        return "project" if self.project_id else "workspace"

    @property
    def scope_id(self):
        return self.recipient_id or self.project_id or self.workspace_id

    @property
    def room(self):
        if self.recipient_id:
            return direct_room(self.author_id, self.recipient_id)
        return room_name(self.scope, self.scope_id)

    def partner_for(self, user):
        """Shaxsiy yozishmada "qarshi tomon" kim ekanini qaytaradi."""
        if not self.recipient_id:
            return None
        return self.recipient if self.author_id == getattr(user, "pk", None) else self.author


def room_name(scope, scope_id):
    """WebSocket guruh nomi: chat.project.12 / chat.workspace.3"""
    return "chat.{}.{}".format(scope, scope_id)


def direct_room(user_a_id, user_b_id):
    """Ikki kishilik suhbat nomi - kim birinchi yozishidan qat'i nazar bir xil.

    Shu sabab id lar tartiblanadi: chat.direct.3.7
    """
    low, high = sorted([int(user_a_id), int(user_b_id)])
    return "chat.direct.{}.{}".format(low, high)
