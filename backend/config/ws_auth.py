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
    """(foydalanuvchi, token tugash vaqti) - yaroqsiz bo'lsa (Anonymous, 0)."""
    from rest_framework_simplejwt.tokens import AccessToken

    try:
        token = AccessToken(raw)
        user = get_user_model().objects.get(pk=token["user_id"], is_active=True)
        return user, int(token.payload.get("exp") or 0)
    except Exception:
        return AnonymousUser(), 0


class JWTAuthMiddleware:
    """scope["user"] ni tokendan to'ldiradi. Token bo'lmasa - AnonymousUser.

    Tokenning TUGASH VAQTI ham saqlanadi (`scope["token_exp"]`). Sababi:
    tekshiruv faqat ulanish paytida bo'lsa, ochilgan soket token muddatidan
    ancha uzoq tirik qolaverardi - ulanish soatlab ochiq turadi. Consumer
    shu vaqtga qarab o'zini yopadi, mijoz esa yangi token bilan qayta
    ulanadi (`socket.ts` har ulanishda tokenning eng so'nggisini oladi).
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        params = parse_qs((scope.get("query_string") or b"").decode())
        raw = (params.get("token") or [""])[0]
        if raw:
            scope["user"], scope["token_exp"] = await user_from_token(raw)
        else:
            scope["user"], scope["token_exp"] = AnonymousUser(), 0
        return await self.app(scope, receive, send)
