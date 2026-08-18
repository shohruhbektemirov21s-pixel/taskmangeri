"""Hisobning Telegram bilan bog'lanishi.

USERNAME BU YERDA SAQLANMAYDI. U allaqachon profilda bor —
`accounts.User.telegram` (odam o'zi yozadigan aloqa maydoni). Uni ikkinchi
marta yozib qo'ysak, ikkovi vaqt o'tib bir-biriga mos kelmay qolardi:
odam profilda o'zgartiradi, bot esa eskisini qidirib yuraveradi. Shuning
uchun bu jadval faqat BOG'LANISHNI saqlaydi.

NEGA `chat_id` KERAK. Bot API username bilan xabar yubora olmaydi — u
`chat_id` talab qiladi, `chat_id` esa faqat odam botga `/start` bosgandan
keyin ma'lum bo'ladi (Telegram spamdan shunday himoyalanadi). Ya'ni:

    1. odam profilda Telegram username yozadi    (accounts.User.telegram)
    2. odam botga `/start` bosadi                -> shu yerda qator paydo bo'ladi
    3. shundan keyingina xabar yuborish mumkin
"""
from django.conf import settings
from django.db import models
from django.db.models import Q


def normalize_username(value):
    """`@Shohruh`, ` shohruh `, `https://t.me/shohruh` -> `shohruh`.

    Telegram username registrga sezgir emas, shuning uchun kichik harfga
    keltiriladi. Odam profilga qaysi shaklda yozganidan qat'i nazar
    bittasiga aylanadi.
    """
    text = (value or "").strip()
    for prefix in ("https://t.me/", "http://t.me/", "t.me/", "@"):
        if text.lower().startswith(prefix):
            text = text[len(prefix):]
            break
    return text.strip().lower()


def user_lookup(username):
    """Profilidagi Telegram maydoni shu username'ga to'g'ri keladigan odam.

    Maydon erkin matn: odam `@shohruh`, `shohruh` yoki `t.me/shohruh` deb
    yozishi mumkin. SQL tomonda normallashtirib bo'lmagani uchun uchala
    shakl ham to'g'ridan-to'g'ri solishtiriladi (`iexact` - registrsiz).
    """
    name = normalize_username(username)
    if not name:
        return Q(pk__in=[])
    return (Q(telegram__iexact=name)
            | Q(telegram__iexact="@" + name)
            | Q(telegram__iexact="t.me/" + name)
            | Q(telegram__iexact="https://t.me/" + name))


class TelegramLink(models.Model):
    """Bitta hisob — bitta Telegram chati."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name="telegram_link", verbose_name="Foydalanuvchi")
    chat_id = models.BigIntegerField("Chat raqami", unique=True, db_index=True)
    # Odam Telegramdan xabar olishni vaqtincha to'xtatishi mumkin -
    # bog'lanishni uzmasdan.
    is_muted = models.BooleanField("Xabarlar o'chirilgan", default=False)
    linked_at = models.DateTimeField("Bog'langan vaqt", auto_now_add=True)

    class Meta:
        verbose_name = "Telegram bog'lanish"
        verbose_name_plural = "Telegram bog'lanishlar"

    def __str__(self):
        return "{} -> {}".format(self.chat_id, self.user)

    @property
    def is_active(self):
        return not self.is_muted
