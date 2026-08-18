"""Telegramga xabar yuborish — ilovaning qolgan qismi shu yerdan foydalanadi.

QOIDA. Bu yerdagi hech narsa istisno uloqtirmaydi. Telegram tashqi xizmat:
u ishlamay qolsa vazifa biriktirish ham, izoh yozish ham to'xtamasligi
kerak. Shuning uchun xatolik logga yoziladi va `False` qaytadi -
`notifications/services.py` dagi WebSocket bilan bir xil yondashuv.
"""
import html
import logging

from django.conf import settings

from . import client
from .models import TelegramLink

logger = logging.getLogger(__name__)


# Telegram inline tugmasida faqat OMMAVIY manzil bo'ladi. `localhost` va
# ichki IP larni u «Wrong HTTP URL» deb rad etadi - o'shanda butun xabar
# yuborilmay qolardi.
LOCAL_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "backend", "frontend")


def app_url(path=""):
    """Ilovadagi sahifaga to'liq havola — tugmaga yaroqli bo'lsa.

    `SITE_URL` sozlanmagan yoki mahalliy manzil bo'lsa bo'sh satr qaytadi
    va tugma umuman chizilmaydi: Telegram bunday havolani qabul qilmaydi,
    ya'ni tugma qo'yilsa xabarning o'zi ham ketmasdi.
    """
    from urllib.parse import urlparse

    base = (getattr(settings, "SITE_URL", "") or "").strip().rstrip("/")
    if not base:
        return ""
    host = (urlparse(base).hostname or "").lower()
    if not host or host in LOCAL_HOSTS or host.endswith(".local"):
        return ""
    return base + (path or "")


def esc(text):
    """HTML uchun xavfsiz matn (`parse_mode=HTML`)."""
    return html.escape(str(text or ""))


def link_for(user):
    """Foydalanuvchining bog'lanishi. Yo'q yoki o'chirilgan bo'lsa `None`."""
    if user is None or not getattr(user, "pk", None):
        return None
    try:
        link = TelegramLink.objects.filter(user=user).first()
    except Exception:
        logger.exception("Telegram bog'lanishini o'qib bo'lmadi: user=%s", getattr(user, "pk", None))
        return None
    return link if (link and link.is_active) else None


def send(user, text, buttons=None):
    """Bitta odamga xabar. `True` - ketdi."""
    if not client.is_configured():
        return False
    link = link_for(user)
    if link is None:
        return False
    return client.send_message(link.chat_id, text, buttons=buttons)


def send_notification(notification):
    """Bildirishnomani Telegramga ham uzatadi.

    Matn ilovadagi qo'ng'iroq bilan bir xil: sarlavha qalin, ostida izoh,
    pastida «Ochish» tugmasi. Ikki xil matn yozilsa ular vaqt o'tib
    bir-biridan uzoqlashib ketardi.
    """
    if notification is None:
        return False

    # Sarlavha va izoh - boshqa hech narsa.
    #
    # Ilgari oxiriga harakat egasining ismi ham qo'shilardi. U ortiqcha
    # edi: "Shox sizga yozdi" yoki "Shox: 6-vazifa" degan satrdan keyin
    # yana bir marta "Shox" turardi. Xabar qisqa bo'lgani uchun bu
    # takror darrov ko'zga tashlanardi.
    lines = ["<b>{}</b>".format(esc(notification.title))]
    if notification.body:
        lines.append(esc(notification.body))

    buttons = None
    url = app_url(notification.url)
    if url:
        buttons = [[("Ochish", url)]]

    return send(notification.recipient, "\n".join(lines), buttons=buttons)
