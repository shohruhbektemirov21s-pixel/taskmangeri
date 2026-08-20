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


def send_to_users(users, payload):
    """Bir nechta odamning shaxsiy kanaliga bir xil xabar uzatadi.

    Bu bildirishnoma EMAS: bazaga hech narsa yozilmaydi va qo'ng'iroq
    chalinmaydi. Bu - ochiq turgan sahifaga "shu joyda nimadir o'zgardi"
    degan kichik signal (masalan doska o'zini yangilashi uchun). Shuning
    uchun uni ko'p yuborish ham xavfsiz.
    """
    sent = 0
    seen = set()
    for user in users:
        uid = getattr(user, "pk", user)
        if not uid or uid in seen:
            continue
        seen.add(uid)
        if send_to_user(uid, payload):
            sent += 1
    return sent


def serialize(notification):
    from .serializers import NotificationSerializer

    return NotificationSerializer(notification).data


def clip(text, limit):
    """Matnni ustunga sig'diradi - BELGI emas, BAYT bo'yicha.

    Db2 da `CharField(max_length=200)` VARCHAR(200) bo'lib, uning o'lchovi
    baytda. O'zbekcha matnda esa bitta belgi ko'pincha ikki-uch bayt:
    «—», «…», ismlardagi «ʻ». Shu sabab 200 belgilik matn bemalol 400
    baytdan oshib ketardi va yozuv `SQL0302N` (SQLSTATE 22001) bilan
    yiqilardi - bildirishnoma umuman yozilmasdi.

    Kesilgan joyda yarim belgi qolmasin uchun `errors="ignore"` bilan
    qaytariladi: buzuq bayt tashlab yuboriladi.
    """
    data = (text or "").encode("utf-8")
    if len(data) <= limit:
        return text or ""
    return data[:limit].decode("utf-8", "ignore")


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
            obj.title = clip(title, 200)
            obj.body = clip(body, 400)
            obj.actor = actor if (actor and getattr(actor, "pk", None)) else None
            obj.meta = meta or {}
            obj.save(update_fields=["title", "body", "actor", "meta"])
        else:
            obj = Notification.objects.create(
                recipient=recipient,
                actor=actor if (actor and getattr(actor, "pk", None)) else None,
                kind=kind, title=clip(title, 200), body=clip(body, 400),
                url=clip(url, 300),
                meta=meta or {},
            )
    except Exception:
        logger.exception("Bildirishnoma yozib bo'lmadi: %s", kind)
        return None

    send_to_user(obj.recipient_id, {"event": "notification", "notification": serialize(obj)})
    _to_telegram(obj)
    return obj


def _to_telegram(notification):
    """Bildirishnomani Telegramga ham uzatadi - bog'langan bo'lsa.

    Alohida funksiyada, chunki qoida bitta: Telegram TASHQI xizmat va u
    ishlamay qolgani uchun bildirishnoma yozilmay qolmasligi kerak.
    Import ham shu yerda - `apps.telegram` yuklanmagan holatda ham
    (masalan tanlab o'chirilganda) `notify()` ishlayversin.
    """
    try:
        from apps.telegram.services import send_notification

        send_notification(notification)
    except Exception:
        logger.exception("Telegramga uzatib bo'lmadi: id=%s", getattr(notification, "pk", None))


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
