from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from apps.core.consumers import LiveAuthMixin

from .services import user_group


class NotificationConsumer(LiveAuthMixin, AsyncJsonWebsocketConsumer):
    """Har bir foydalanuvchining shaxsiy kanali.

    Bu yerga bildirishnomalar ham, chatdagi yangi xabar haqidagi kichik
    signal ham tushadi - shunda foydalanuvchi qaysi sahifada bo'lishidan
    qat'i nazar xabardor bo'ladi.
    """

    group = None

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)  # token yo'q yoki yaroqsiz
            return

        self.group = user_group(user.pk)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "ready", "unread": await self.unread_count(user)})

    async def disconnect(self, code):
        if self.group:
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Ulanishni tirik saqlash uchun oddiy ping/pong.
        if content.get("event") == "ping":
            await self.send_json({"event": "pong"})

    # `fanout` `LiveAuthMixin` dan keladi: token muddati tugagan soketga
    # xabar yuborilmaydi. Bu yerda qo'shimcha ruxsat tekshiruvi shart emas -
    # kanal foydalanuvchining o'ziniki.

    @database_sync_to_async
    def unread_count(self, user):
        from .models import Notification

        return Notification.objects.filter(recipient=user, is_read=False).count()
