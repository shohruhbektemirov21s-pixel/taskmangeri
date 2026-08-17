from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from apps.core.consumers import LiveAuthMixin

from .models import direct_room, room_name


class ChatConsumer(LiveAuthMixin, AsyncJsonWebsocketConsumer):
    """ws/chat/<scope>/<id>/ - loyiha, ish maydoni yoki shaxsiy suhbat.

    Ulanish faqat o'qish uchun: xabar REST orqali yuboriladi, bu yerga esa
    yangi xabarlar tushadi. Shu tufayli ruxsat tekshiruvi bitta joyda qoladi.
    """

    group = None

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        scope = self.scope["url_route"]["kwargs"]["scope"]
        scope_id = self.scope["url_route"]["kwargs"]["scope_id"]
        if scope not in ("project", "workspace", "direct"):
            await self.close(code=4400)
            return

        # Keyingi tekshiruvlar uchun eslab qolamiz (`recheck_allowed`).
        self.room_scope, self.room_id = scope, scope_id

        if not await self.allowed(user, scope, scope_id):
            await self.close(code=4403)
            return

        # Shaxsiy suhbat nomi juftlikdan yasaladi - kim ulanishidan qat'i nazar
        # ikkalasi bitta guruhda bo'ladi.
        self.group = (direct_room(user.pk, scope_id) if scope == "direct"
                      else room_name(scope, scope_id))
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "ready", "room": self.group})

    async def disconnect(self, code):
        if self.group:
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("event") == "ping":
            await self.send_json({"event": "pong"})

    # `fanout` `LiveAuthMixin` dan: har xabardan oldin token muddati va
    # (30 soniyada bir marta) a'zolik qayta tekshiriladi.
    async def recheck_allowed(self):
        """Odam hali ham shu suhbatni o'qiy oladimi.

        Ilgari ruxsat faqat ULANISHDA tekshirilardi: loyihadan chiqarilgan
        odamning ochiq soketi xabar olishda davom etardi.
        """
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            return False
        return await self.allowed(user, self.room_scope, self.room_id)

    @database_sync_to_async
    def allowed(self, user, scope, scope_id):
        from django.contrib.auth import get_user_model

        from apps.projects.models import Project
        from apps.workspaces.models import Workspace

        from .services import can_read

        if scope == "direct":
            partner = get_user_model().objects.filter(pk=scope_id, is_active=True).first()
            return bool(partner) and can_read(user, partner=partner)

        if scope == "project":
            project = Project.objects.filter(pk=scope_id).first()
            return bool(project) and can_read(user, project=project)

        workspace = Workspace.objects.filter(pk=scope_id).first()
        return bool(workspace) and can_read(user, workspace=workspace)
