"""Bildirishnoma yaratish va uni real vaqtda yetkazish uchun yagona kirish nuqtasi.

Barcha viewlar shu yerdagi `notify()` ni chaqiradi - shunda bildirishnoma
bir xil formatda saqlanadi va WebSocket orqali darrov egasiga boradi.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def user_group(user_id):
    """Bitta foydalanuvchining shaxsiy kanali."""
    return "user.{}".format(user_id)


def send_to_user(user_id, payload):
    """Foydalanuvchining ochiq WebSocket ulanishlariga xabar uzatadi.

    Redis ishlamay qolsa ham asosiy amal buzilmasligi kerak - shuning uchun
    xatolik faqat logga yoziladi.
    """
    try:
        layer = get_channel_layer()
        if layer is None:
            return False
        async_to_sync(layer.group_send)(user_group(user_id), {"type": "fanout", "payload": payload})
        return True
    except Exception:
        logger.exception("WebSocket orqali yuborib bo'lmadi: user=%s", user_id)
        return False


def serialize(notification):
    from .serializers import NotificationSerializer

    return NotificationSerializer(notification).data


def notify(recipient, kind, title, body="", url="", actor=None, meta=None, collapse=False):
    """Bitta odamga bildirishnoma yozadi va darrov yuboradi.

    `collapse=True` bo'lsa (masalan chat xabarlari) - o'sha havola bo'yicha
    o'qilmagan bildirishnoma bor bo'lsa, yangisini yaratmay eskisini yangilaydi.
    Shunda 50 ta chat xabari 50 ta qo'ng'iroq bo'lib qolmaydi.
    """
    from .models import Notification

    if recipient is None or not getattr(recipient, "pk", None):
        return None
    # O'z harakati uchun o'ziga xabar kelmasin.
    if actor is not None and getattr(actor, "pk", None) == recipient.pk:
        return None

    try:
        obj = None
        if collapse and url:
            obj = Notification.objects.filter(
                recipient=recipient, kind=kind, url=url, is_read=False).first()

        if obj is not None:
            obj.title = title[:200]
            obj.body = body[:400]
            obj.actor = actor if (actor and getattr(actor, "pk", None)) else None
            obj.meta = meta or {}
            obj.save(update_fields=["title", "body", "actor", "meta"])
        else:
            obj = Notification.objects.create(
                recipient=recipient,
                actor=actor if (actor and getattr(actor, "pk", None)) else None,
                kind=kind, title=title[:200], body=body[:400], url=url[:300],
                meta=meta or {},
            )
    except Exception:
        logger.exception("Bildirishnoma yozib bo'lmadi: %s", kind)
        return None

    send_to_user(obj.recipient_id, {"event": "notification", "notification": serialize(obj)})
    return obj


def notify_many(recipients, kind, title, body="", url="", actor=None, meta=None, collapse=False):
    """Bir nechta odamga bir xil bildirishnoma."""
    out = []
    seen = set()
    for user in recipients:
        uid = getattr(user, "pk", None)
        if not uid or uid in seen:
            continue
        seen.add(uid)
        obj = notify(user, kind, title, body=body, url=url, actor=actor,
                     meta=meta, collapse=collapse)
        if obj is not None:
            out.append(obj)
    return out
