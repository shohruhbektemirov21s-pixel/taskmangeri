"""Telegram hisobini bog'lash uchun bir martalik kod.

MUAMMO. Bog'lanish PROFILDAGI `telegram` maydoni bo'yicha ishlardi: bot
kelgan xabarning `username` ini oladi va o'sha nomni profiliga yozgan
odamni qidiradi (`models.user_lookup`). Maydon esa erkin matn va uni
hech kim tasdiqlamaydi - istalgan odam u yerga BOSHQANING username'ini
yozib qo'ya olardi.

Oqibati: Mallory profiliga `@victim` deb yozadi. Victim botga birinchi
marta `/start` bosganda uning `chat_id` si Mallory hisobiga bog'lanadi.
Endi Mallory ning bildirishnomalari - vazifa nomlari, loyiha nomlari,
qarorlar - begona Telegramga tushadi, victim esa o'z hisobini umuman
bog'lay olmaydi (nomi band).

YECHIM. Bog'lash kodi hisobning O'ZIDAN chiqadi: profil sahifasi
imzolangan, qisqa muddatli token oladi va uni Telegram havolasiga
qo'shadi. Odam havolani bosadi, Telegram esa botga `/start <token>`
yuboradi - ya'ni kod hisobga kirgan odamdagina bo'ladi.

NEGA JADVAL EMAS, IMZO. Kod bir martalik va qisqa umrli, ya'ni uni
saqlashning ma'nosi yo'q: imzo o'zi kim uchun berilganini va qachon
berilganini o'z ichida olib yuradi (`django.core.signing`). Jadval
bo'lsa uni tozalab turish ham kerak bo'lardi.

MUDDAT. 15 daqiqa - odam havolani bosib, Telegramni ochib, tugmani
bosishiga yetadi; nusxa olib qo'yilgan eski havola esa ishlamaydi.
"""
from django.core import signing

SALT = "teamflow.telegram.link"
MAX_AGE = 15 * 60


def make_code(user):
    """Foydalanuvchi uchun bir martalik bog'lash kodi."""
    return signing.dumps(user.pk, salt=SALT)


def read_code(code):
    """Koddan foydalanuvchini oladi. Yaroqsiz yoki eskirgan bo'lsa `None`."""
    from django.contrib.auth import get_user_model

    if not code:
        return None
    try:
        user_id = signing.loads(code, salt=SALT, max_age=MAX_AGE)
    except signing.BadSignature:
        # Muddati o'tgani ham, buzib yozilgani ham - bir xil javob.
        # `SignatureExpired` `BadSignature` dan meros oladi.
        return None
    return get_user_model().objects.filter(pk=user_id, is_active=True).first()


def link_url(user, bot_username):
    """«Telegramga ulash» tugmasi olib boradigan manzil.

    Telegram `?start=<kod>` ni ochilgan suhbatga `/start <kod>` xabari
    qilib yuboradi - odam hech narsa yozmaydi.
    """
    if not bot_username:
        return ""
    return "https://t.me/{}?start={}".format(bot_username, make_code(user))
