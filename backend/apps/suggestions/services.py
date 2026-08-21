"""Takliflar bo'yicha xabar berish.

Ikki nuqta bor va ikkovi ham javob KUTIB turadigan holat:

  * yangi taklif tushdi — boshliq ko'rsin (u qaror qiladigan yagona odam);
  * qaror chiqdi — muallif bilsin.

Ovoz berilgani bu yerga qo'shilmadi: u javob talab qilmaydi va o'ttiz
kishilik jamoada boshliqning qo'ng'irog'ini bir kunda o'nlab marta
chalardi. Uni sonlar ko'rsatib turadi.

ANONIMLIK SHU YERDA HAM BUZILMAYDI. Bildirishnoma serializeri `actor` ni
to'liq ochadi — ismi, rasmi, mutaxassisligi bilan. Ya'ni anonim taklifga
`actor=author` berib yuborilsa, sahifada yashirilgan ism qo'ng'iroq
ichidan chiqib kelardi. Shuning uchun anonim taklifda `actor` ham, matn
ham muallifni aytmaydi.

MUALLIFNING O'ZI XABAR OLMAYDI. Boshliq o'zi taklif yozsa, o'ziga
«yangi taklif» kelmasligi kerak. `notify()` buni `actor` orqali
tekshiradi, lekin anonim taklifda `actor` bo'sh — shuning uchun muallif
oluvchilar ro'yxatidan ATAYLAB chiqarib tashlanadi.
"""
import logging

from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many

from .models import SuggestionScope, SuggestionStatus

logger = logging.getLogger(__name__)

# Bildirishnoma bosilganda ochiladigan sahifa. Taklifning o'z manzili
# yo'q — ro'yxat bitta sahifada turadi.
URL = "/takliflar"


def _bosses(exclude_id=None):
    """Qaror qiladigan odamlar — faol boshliqlar.

    `exclude_id` — taklif muallifi: o'z taklifi haqida o'ziga xabar
    kelmasin.
    """
    from apps.accounts.models import GlobalRole, User

    qs = User.objects.filter(global_role=GlobalRole.BOSS, is_active=True)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return list(qs)


def notify_new(suggestion):
    """Yangi taklif — boshliqqa."""
    author = None if suggestion.is_anonymous else suggestion.author
    who = "Anonim" if suggestion.is_anonymous else suggestion.author.full_name
    # Yopiq taklif jamoa oldida aytilmaydigan gap uchun — boshliq buni
    # ro'yxatni ochmasdan ham bilsin.
    if suggestion.scope == SuggestionScope.CLOSED:
        who = "{} · yopiq".format(who)

    return notify_many(
        _bosses(exclude_id=suggestion.author_id),
        NotificationKind.SUGGESTION_NEW,
        title="Yangi taklif: {}".format(suggestion.title),
        body=who,
        url=URL,
        actor=author,
        meta={"suggestion": suggestion.pk},
    )


# Qaror sarlavhalari. Izohning o'zi matnga tushadi.
_TITLES = {
    SuggestionStatus.APPROVED: "Taklifingiz tasdiqlandi",
    SuggestionStatus.REJECTED: "Taklifingiz rad etildi",
}


def notify_decision(suggestion, actor, status_changed):
    """Boshliqning qarori yoki izohi — taklif muallifiga.

    `status_changed` yolg'on bo'lsa boshliq faqat izoh qoldirgan: bu ham
    muallifga qaratilgan gap, shuning uchun u ham yetkaziladi.
    """
    if status_changed:
        title = _TITLES.get(suggestion.status, "Taklifingiz bo'yicha qaror")
    else:
        title = "Taklifingizga izoh qoldirildi"

    return notify(
        suggestion.author,
        NotificationKind.SUGGESTION_DECIDED,
        title=title,
        # Izoh bo'lmasa taklifning o'z nomi turadi — bo'sh xabar
        # «nima haqida ekan?» degan savol qoldirardi.
        body=suggestion.decision_note or suggestion.title,
        url=URL,
        actor=actor,
        meta={"suggestion": suggestion.pk, "status": suggestion.status},
    )
