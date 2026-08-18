"""Profil sahifasi uchun: bog'lanish holati, ovozni o'chirish, uzish.

Bu yerda USERNAME saqlanmaydi — u profilning o'z maydonida
(`accounts.User.telegram`) va odatdagi profil formasi orqali yoziladi.
Bu endpoint faqat bog'lanishning o'zi bilan ishlaydi va faqat
`request.user` niki bilan.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import client
from .models import TelegramLink, normalize_username


def state(user):
    """Profilda ko'rsatiladigan holat."""
    link = TelegramLink.objects.filter(user=user).first()
    return {
        # Token qo'yilmagan bo'lsa frontend bo'limni umuman ko'rsatmaydi.
        "enabled": client.is_configured(),
        "bot_username": client.bot_username(),
        # Profilga yozilgan nom - bot aynan shuni qidiradi.
        "username": normalize_username(user.telegram),
        "is_linked": link is not None,
        "is_muted": bool(link and link.is_muted),
        "linked_at": link.linked_at if link else None,
    }


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
def telegram_link(request):
    """GET - holat, POST - xabarlarni yoqish/o'chirish, DELETE - uzish."""
    user = request.user

    if request.method == "DELETE":
        TelegramLink.objects.filter(user=user).delete()
    elif request.method == "POST":
        link = TelegramLink.objects.filter(user=user).first()
        if link is not None and "is_muted" in request.data:
            link.is_muted = bool(request.data.get("is_muted"))
            link.save(update_fields=["is_muted"])

    return Response(state(user))
