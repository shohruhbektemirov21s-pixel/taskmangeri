"""Telegram Bot API bilan ishlovchi yupqa qatlam.

NEGA `requests` EMAS. Loyihada uchinchi tomon HTTP kutubxonasi yo'q va
faqat shu narsa uchun bog'liqlik qo'shish ortiqcha: bizga ikkita usul
kerak (`sendMessage`, `getUpdates`), ikkovi ham oddiy POST. Standart
kutubxonadagi `urllib` yetadi.

XATOLIK YUTILADI. Telegram javob bermasa yoki token noto'g'ri bo'lsa ham
asosiy amal (vazifa biriktirish, izoh yozish) buzilmasligi kerak -
shuning uchun bu yerdagi hamma narsa `False`/`None` qaytaradi va logga
yozadi. Bu `notifications/services.py` dagi WebSocket bilan bir xil qoida.
"""
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

API_ROOT = "https://api.telegram.org/bot{token}/{method}"

# Uzoq so'rov (long polling) uchun kutish. Telegram shuncha soniya ushlab
# turadi va yangilik chiqsa darrov qaytaradi - ya'ni bo'sh so'rovlar
# minutiga bir marta ketadi, har soniyada emas.
POLL_TIMEOUT = 25
# Tarmoq kutish vaqti: `getUpdates` uchun `POLL_TIMEOUT` dan katta bo'lishi
# shart, aks holda javob kelishga ulgurmay uziladi.
NET_TIMEOUT = POLL_TIMEOUT + 10


def token():
    return (getattr(settings, "TELEGRAM_BOT_TOKEN", "") or "").strip()


def bot_username():
    return (getattr(settings, "TELEGRAM_BOT_USERNAME", "") or "").strip().lstrip("@")


def is_configured():
    """Token qo'yilganmi. Qo'yilmagan bo'lsa Telegram qismi jim o'chadi."""
    return bool(token())


def call(method, payload=None, timeout=15):
    """Bot API usulini chaqiradi. Muvaffaqiyatda `result`, aks holda `None`."""
    if not is_configured():
        return None

    data = json.dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(
        API_ROOT.format(token=token(), method=method),
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        # 403 - odam botni bloklagan, 400 - chat topilmadi va h.k.
        # Bular kutilgan holatlar: log to'ldirmasin, `warning` yetadi.
        try:
            detail = json.loads(err.read().decode("utf-8")).get("description", "")
        except Exception:
            detail = ""
        logger.warning("Telegram %s: %s %s", method, err.code, detail)
        return None
    except Exception:
        logger.exception("Telegram %s chaqirib bo'lmadi", method)
        return None

    if not body.get("ok"):
        logger.warning("Telegram %s rad etdi: %s", method, body.get("description"))
        return None
    return body.get("result")


def send_message(chat_id, text, buttons=None):
    """Xabar yuboradi. `True` - ketdi, `False` - ketmadi.

    `buttons` - [[(matn, url), ...], ...] ko'rinishidagi havola tugmalari.
    Ular vazifani ilovada ochish uchun: Telegramdan chiqmasdan bosiladi.
    """
    payload = {
        "chat_id": chat_id,
        "text": text,
        # HTML: Telegram Markdown da har bir `_` va `*` ni qochirish kerak,
        # vazifa sarlavhalarida esa ular ko'p uchraydi.
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if buttons:
        payload["reply_markup"] = {
            "inline_keyboard": [
                [{"text": label, "url": url} for label, url in row] for row in buttons
            ],
        }

    if call("sendMessage", payload) is not None:
        return True

    # TUGMA XABARNI YO'Q QILMASIN. Telegram havolani qabul qilmasa
    # (masalan `http://localhost:...` - «Wrong HTTP URL») BUTUN xabarni
    # 400 bilan rad etadi va odam hech narsa olmaydi. Bezak uchun
    # qo'yilgan tugma tufayli bildirishnomani yo'qotish - eng yomon
    # ayirboshlash, shuning uchun tugmasiz qayta yuboramiz.
    if buttons:
        payload.pop("reply_markup", None)
        return call("sendMessage", payload) is not None
    return False


def get_updates(offset=None):
    """Yangi xabarlarni oladi (long polling). Ro'yxat qaytaradi."""
    payload = {"timeout": POLL_TIMEOUT, "allowed_updates": ["message"]}
    if offset is not None:
        payload["offset"] = offset
    return call("get" + "Updates", payload, timeout=NET_TIMEOUT) or []


def delete_webhook():
    """Webhook qo'yilgan bo'lsa `getUpdates` ishlamaydi - uni olib tashlaymiz.

    Ikkovi bir vaqtda ishlamaydi: Telegram webhook rejimida `getUpdates` ga
    409 beradi. Bot ishga tushganda bir marta tozalab qo'yish - eng oson
    yo'l, aks holda sabab tushunarsiz bo'lib qolardi.
    """
    return call("deleteWebhook", {"drop_pending_updates": False}) is not None


def get_me():
    """Token to'g'riligini tekshirish uchun."""
    return call("getMe")


def check():
    """Ishga tushishdan oldingi tekshiruv: `(bot_nomi, xato_matni)`.

    Tarmoq xatosini TOKEN xatosidan ajratadi. Ilgari ikkovi bir xil
    «Token yaroqsiz» xabarini berardi va sabab noto'g'ri joyda qidirilardi:
    aslida sertifikat/tarmoq uzilgan bo'lardi, token esa joyida.
    """
    if not is_configured():
        return None, "TELEGRAM_BOT_TOKEN qo'yilmagan. `backend/.env` ga qo'shing."

    data = json.dumps({}).encode("utf-8")
    request = urllib.request.Request(
        API_ROOT.format(token=token(), method="getMe"),
        data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        # Telegram javob berdi, lekin rad etdi - demak token bilan muammo.
        return None, "Token rad etildi ({}). @BotFather dagi tokenni tekshiring.".format(err.code)
    except Exception as exc:
        # Javobning o'zi kelmadi - tarmoq, DNS yoki sertifikat.
        return None, "Telegramga ulanib bo'lmadi: {}. Tarmoqni tekshiring.".format(exc)

    if not body.get("ok"):
        return None, "Token rad etildi: {}".format(body.get("description"))
    return body.get("result", {}).get("username", "?"), None
