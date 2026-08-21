"""Tezlik cheklovlari - bir joyda.

NEGA `core` DA. Cheklov domenga bog'liq emas: u faqat `settings.py` dagi
`DEFAULT_THROTTLE_RATES` kalitiga ishora qiladi. Ilgari `AddMemberThrottle`
`apps/panel/team.py` da yashardi va shu sababdan `apps/projects` uni
ISHLATA OLMASDI - panel eng ustki qatlam, unga hech kim bog'lanmaydi.

Natijasi jimgina xato edi: bitta amalning ikkita eshigi bor
(`/api/team/add/` va `/api/projects/<id>/members/add/`), ikkovi ham
`add_to_project` ni chaqiradi, lekin cheklov faqat birinchisida turardi.
Ya'ni 40/soat qoidasi ikkinchi manzilga o'tib chetlab o'tilardi.

Endi ikkovi shu yerdan oladi.
"""
from rest_framework.throttling import ScopedRateThrottle


class AddMemberThrottle(ScopedRateThrottle):
    """Jamoaga a'zo qo'shish - 40/soat (`settings.DEFAULT_THROTTLE_RATES`).

    Qo'shish tasdiqsiz va darrov bajariladi, ya'ni menejer hisobi qo'lga
    o'tsa butun jamoani bir zumda to'ldirib tashlash mumkin. Cheklov shuning
    oldini oladi - qonuniy ishga (kuniga bir necha odam qo'shish) xalaqit
    bermaydi.
    """

    scope = "invite"
