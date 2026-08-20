"""Botga kelgan xabarlarga javob.

BOT SUHBATLASHMAYDI. U bitta ish qiladi - bildirishnoma yetkazadi. Ilgari
bu yerda `/vazifalarim`, `/bugun` va `/tekshiruv` ham bor edi: ular
ro'yxatni Telegramda takrorlardi, ya'ni ilovadagi sahifalarning cho'ntak
nusxasi bo'lib qolgandi. Ikkita joyda turgan bir xil ro'yxat esa
ertami-kechmi bir-biridan farq qila boshlaydi - endi ish faqat ilovada.

`/start` QOLDI, chunki uni olib tashlab bo'lmaydi: Telegram bot API
xabarni `chat_id` ga yuboradi, `chat_id` esa faqat odam botga o'zi
yozgandan keyin ma'lum bo'ladi (spamdan himoya). Ya'ni `/start` - buyruq
emas, bog'lanishning yagona yo'li.
"""
import logging

from . import client
from .models import TelegramLink, normalize_username, user_lookup
from .services import esc

logger = logging.getLogger(__name__)

# Bog'langandan keyingi tasdiq. Bot nima QILMASLIGINI ham darrov aytadi -
# odam undan javob kutib o'tirmasin.
WELCOME = (
    "<b>Salom, {name}!</b>\n\n"
    "Telegram hisobingiz TeamFlow ga bog'landi - endi bildirishnomalar "
    "shu yerga ham keladi.\n\n"
    "Bot faqat xabar yuboradi. Ishlar, ro'yxatlar va hisobotlar ilovada."
)

NOT_LINKED = (
    "Bu Telegram akkaunti hech qaysi TeamFlow hisobiga bog'lanmagan.\n\n"
    "Ilovaga kiring -> <b>Profil</b> -> <b>Tahrirlash</b> -> Telegram maydoniga "
    "<code>{name}</code> deb yozing va shu yerga qaytib /start bosing."
)

NO_USERNAME = (
    "Telegram akkauntingizda username yo'q. Telegram sozlamalaridan username "
    "qo'ying, keyin ilovadagi profilingizga o'sha nomni yozing va bu yerga "
    "qaytib /start bosing."
)

# Har qanday boshqa xabarga - qisqa javob. Bot jim qolsa odam "yetib
# bordimi?" deb o'ylab qolardi.
ONLY_NOTIFICATIONS = (
    "Bu bot faqat bildirishnoma yuboradi.\n\n"
    "Ishlar ilovada. Xabarlarni to'xtatish yoki bog'lanishni uzish uchun: "
    "<b>Profil</b> -> <b>Telegram</b>."
)


def _bind(chat, username):
    """Kelgan xabarni hisobga moslaydi va bog'lanishni yozadi.

    Moslash PROFILDAGI Telegram maydoni bo'yicha (`accounts.User.telegram`)
    - odam u yerga o'z username'ini allaqachon yozgan. Topilmasa `None`
    qaytadi va odamga nima qilish kerakligi aytiladi.

    Bitta Telegram akkaunti - bitta hisob: shu `chat_id` boshqa odamga
    bog'langan bo'lsa, eskisi uziladi.
    """
    from django.contrib.auth import get_user_model

    name = normalize_username(username)
    chat_id = chat.get("id")
    if not name or not chat_id:
        return None

    User = get_user_model()
    user = User.objects.filter(user_lookup(name), is_active=True).first()
    if user is None:
        return None

    link = TelegramLink.objects.filter(user=user).first()
    if link is not None and link.chat_id == chat_id:
        return link

    # `chat_id` unikal: avval o'sha chatga bog'langan boshqa yozuvni olib
    # tashlaymiz, keyin shu odamnikini qayta yozamiz.
    TelegramLink.objects.filter(chat_id=chat_id).delete()
    TelegramLink.objects.filter(user=user).delete()
    return TelegramLink.objects.create(user=user, chat_id=chat_id)


def handle(update):
    """Bitta yangilikni qayta ishlaydi. Javob yuborilsa `True`."""
    message = (update or {}).get("message") or {}
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    text = (message.get("text") or "").strip()

    chat_id = chat.get("id")
    if not chat_id or not text:
        return False

    # `/start@teamflow_bot` - guruhda bot nomi qo'shiladi.
    command = text.split()[0].split("@")[0].lower() if text.startswith("/") else ""

    if command != "/start":
        # Boshqa hamma narsa - buyruq ham, oddiy matn ham - bir xil javob.
        client.send_message(chat_id, ONLY_NOTIFICATIONS)
        return True

    link = _bind(chat, sender.get("username"))
    if link is None:
        who = sender.get("username")
        reply = NOT_LINKED.format(name=esc(who)) if who else NO_USERNAME
        client.send_message(chat_id, reply)
        return True

    client.send_message(chat_id, WELCOME.format(name=esc(link.user.full_name)))
    return True
