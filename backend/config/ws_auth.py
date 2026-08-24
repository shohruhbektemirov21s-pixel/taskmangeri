"""WebSocket uchun JWT autentifikatsiya.

Brauzer WebSocket ochayotganda `Authorization` headerini qo'sha olmaydi,
shuning uchun access token so'rov satrida keladi:

    ws://host/ws/notifications/?ticket=<30 soniyalik chipta>

CHIPTA, TOKEN EMAS. Ilgari bu yerga to'g'ridan-to'g'ri 12 soatlik access
token qo'yilardi va so'rov satri hamma jurnalga tushadi (nginx, proksi,
APM) - ya'ni butun API ga yaraydigan token o'sha yerda qolib ketardi.
Chipta 30 soniya yashaydi va faqat soket uchun yaraydi
(`apps/core/wsticket.py`).

`?token=` hali ham qabul qilinadi: yangilanmagan mijoz uzilmasin.
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


@database_sync_to_async
def user_from_ticket(ticket):
    """Chiptadan foydalanuvchi - `(foydalanuvchi, token tugash vaqti)`."""
    from apps.core.wsticket import read

    user_id, exp = read(ticket)
    if not user_id:
        return AnonymousUser(), 0
    user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
    return (user, exp) if user else (AnonymousUser(), 0)


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

        # CHIPTA birinchi. U 30 soniya yashaydi va faqat soket uchun
        # yaraydi, ya'ni jurnalga tushsa ham zarari yo'q
        # (`apps/core/wsticket.py`).
        ticket = (params.get("ticket") or [""])[0]
        if ticket:
            scope["user"], scope["token_exp"] = await user_from_ticket(ticket)
            return await self.app(scope, receive, send)

        # ESKI YO'L. Yangilanmagan mijoz uzilib qolmasin - `?token=` hali
        # ham qabul qilinadi. Frontend chiptaga butunlay o'tgach bu shoxni
        # olib tashlash mumkin.
        raw = (params.get("token") or [""])[0]
        if raw:
            scope["user"], scope["token_exp"] = await user_from_token(raw)
        else:
            scope["user"], scope["token_exp"] = AnonymousUser(), 0
        return await self.app(scope, receive, send)
