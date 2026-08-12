"""WebSocket uchun JWT autentifikatsiya.

Brauzer WebSocket ochayotganda `Authorization` headerini qo'sha olmaydi,
shuning uchun access token so'rov satrida keladi:

    ws://host/ws/bildirishnoma/?token=<access>

Token faqat o'qiladi va tekshiriladi - hech qayerga yozilmaydi.
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def user_from_token(raw):
    from rest_framework_simplejwt.tokens import AccessToken

    try:
        token = AccessToken(raw)
        return get_user_model().objects.get(pk=token["user_id"], is_active=True)
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware:
    """scope["user"] ni tokendan to'ldiradi. Token bo'lmasa - AnonymousUser."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        params = parse_qs((scope.get("query_string") or b"").decode())
        raw = (params.get("token") or [""])[0]
        scope["user"] = await user_from_token(raw) if raw else AnonymousUser()
        return await self.app(scope, receive, send)
