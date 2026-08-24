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
from .models import TelegramLink
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

# Kodsiz yoki eskirgan kod bilan kelgan `/start`.
#
# Ilgari bu yerda profildagi username bo'yicha qidiruv turardi va matn
# ham shuni aytardi. Endi bog'lanish faqat ilovadagi tugmadan boshlanadi:
# kod hisobga kirgan odamdagina bo'ladi (`linkcode.py`).
NEED_CODE = (
    "Bog'lanish uchun havola ilovadan olinadi.\n\n"
    "TeamFlow ga kiring -> <b>Profil</b> -> <b>Telegram</b> -> "
    "<b>Telegramga ulash</b> tugmasini bosing. Havola shu suhbatni ochadi "
    "va bog'lanish o'zi tugaydi.\n\n"
    "Havola 15 daqiqa amal qiladi - eskirgan bo'lsa ilovadan yangisini oling."
)

# Har qanday boshqa xabarga - qisqa javob. Bot jim qolsa odam "yetib
# bordimi?" deb o'ylab qolardi.
ONLY_NOTIFICATIONS = (
    "Bu bot faqat bildirishnoma yuboradi.\n\n"
    "Ishlar ilovada. Xabarlarni to'xtatish yoki bog'lanishni uzish uchun: "
    "<b>Profil</b> -> <b>Telegram</b>."
)


def _bind(chat, code):
    """Bir martalik kod bo'yicha hisobni topib, bog'lanishni yozadi.

    Kod ilovadagi «Telegramga ulash» tugmasidan keladi va imzolangan
    (`linkcode.py`), ya'ni u faqat HISOBGA KIRGAN odamda bo'ladi.

    Ilgari moslash profildagi `telegram` maydoni bo'yicha edi. U maydonni
    hech kim tasdiqlamaydi va begonaning username'ini yozib qo'yish
    mumkin edi - kimningdir bildirishnomalari boshqa odamning
    Telegramiga tushardi (`linkcode.py` dagi izoh).

    Bitta Telegram akkaunti - bitta hisob: shu `chat_id` boshqa odamga
    bog'langan bo'lsa, eskisi uziladi.
    """
    from .linkcode import read_code

    chat_id = chat.get("id")
    if not chat_id:
        return None

    user = read_code(code)
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

    # `/start <kod>` - kod havoladan keladi (`?start=` ni Telegram shu
    # ko'rinishga o'giradi). Kodsiz `/start` bog'lamaydi.
    parts = text.split(maxsplit=1)
    code = parts[1].strip() if len(parts) > 1 else ""

    link = _bind(chat, code)
    if link is None:
        client.send_message(chat_id, NEED_CODE)
        return True

    client.send_message(chat_id, WELCOME.format(name=esc(link.user.full_name)))
    return True
