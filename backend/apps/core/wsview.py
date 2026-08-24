"""WebSocket chiptasini beruvchi endpoint.

Alohida faylda, `read.py` da emas: u o'qish shlyuzi va uning o'z
mavzusi bor. Chipta esa autentifikatsiyaga tegishli.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .wsticket import TTL, issue


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ws_ticket(request):
    """`POST /api/ws-ticket/` -> `{"ticket": ..., "expires_in": 30}`.

    Chipta so'rovchining O'ZIGA beriladi - boshqa odam uchun chipta
    so'rash imkoni yo'q. Asl tokenning tugash vaqti chiptaga ko'chiriladi
    (`wsticket.issue`), ya'ni ulanish tokendan uzoq yashamaydi.
    """
    token_exp = 0
    auth = getattr(request, "auth", None)
    if auth is not None:
        try:
            token_exp = int(auth.payload.get("exp") or 0)
        except Exception:
            # Sessiya bilan kirgan bo'lsa `auth` JWT emas - muddat yo'q,
            # soket faqat ruxsat tekshiruviga tayanadi (`LiveAuthMixin`).
            token_exp = 0
    return Response({"ticket": issue(request.user, token_exp), "expires_in": TTL})
