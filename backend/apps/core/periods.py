"""Davr va muddat oralig'i - sanadan boshqa hech narsa bilmaydigan hisob.

NEGA ALOHIDA. Bu funksiyalar ilgari `core/api.py` da, panel kodining
o'rtasida turardi va ularni «Loyihalar» ro'yxati ham, jamoa yuklamasi ham
o'sha yerdan chaqirardi. Natijada oddiy sana hisobi uchun butun panel
moduli - dashboard, tekshiruv navbati, tarix tasmasi - import qilinardi.

Bu yerda DOMEN YO'Q: na loyiha, na vazifa, na foydalanuvchi. Faqat
kalendar. Shu sababdan u `apps.core` da qoladi, panel esa `apps.panel` ga
ko'chdi.

BITTA MANBA. «Shu hafta» panelda ham, vazifalar ro'yxatida ham, loyihalar
kesimida ham BIR XIL hafta bo'lishi kerak (dushanbadan yakshanbagacha,
«oxirgi 7 kun» emas). Ikki joyda ikki xil hisoblansa odam bir ro'yxatda
ko'rgan ishini ikkinchisida topa olmasdi.

MINTAQA. Kun chegarasi Toshkent vaqtidan yasaladi va aniq LAHZA bo'lib
qaytadi, `__date` emas: Db2 da sanani ustundan ajratib olish mintaqani
hisobga olmaydi va tungi ishlar qo'shni kunga tushib qolardi.
"""
from datetime import datetime, time as dtime

from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError as DrfValidationError


# Bosh paneldagi uchta taxta: «yil boshidan», «oy boshidan», «hafta
# boshidan». Tartib shu yerda belgilanadi - javobdagi ro'yxat ham shu
# ketma-ketlikda keladi.
PERIODS = ("year", "month", "week")


def _period_start(period):
    """Tanlangan davr boshlanadigan lahza.

    Chegara TOSHKENT vaqtida hisoblanadi va aniq lahza bo'lib qaytadi
    (`__date` emas): Db2 da sanani ustundan ajratib olish mintaqani
    hisobga olmaydi va tunda son noto'g'ri chiqardi - `dashboard` dagi
    «bugun» kesimida ham shu sabab bor.
    """
    today = timezone.localdate()
    if period == "week":
        start = today - timezone.timedelta(days=today.weekday())   # dushanba
    elif period == "month":
        start = today.replace(day=1)
    else:
        start = today.replace(month=1, day=1)
    return timezone.make_aware(datetime.combine(start, dtime.min))


# Ro'yxat ustidagi «Muddat» tanlagichi. Ro'yxat ochilganda hamma ish
# ko'rinadi, bu esa uni bir kunga yoki bir kalendar davriga qisqartiradi.
DUE_RANGES = ("today", "yesterday", "tomorrow", "week", "month", "year")


def _due_range_dates(key):
    """«Muddat» davri - KALENDAR SANALARI `[boshi, oxiri)` yoki `None`.

    Hafta, oy va yil - kalendar davri (dushanbadan yakshanbagacha, oy
    boshidan oxirigacha), «oxirgi 7 kun» emas: paneldagi taxtalar ham shu
    mantiqda sanaydi va ikkovi bir xil gapirsin.

    NEGA SANA. Ikki xil ustun bor: `Task.due_date` - lahza (`DateTimeField`),
    `Project.due_date` esa - sana (`DateField`). Kun chegarasini ikki joyda
    ikki xil hisoblamaslik uchun MATEMATIKA shu yerda bir marta bajariladi,
    ustun turiga moslash esa quyidagi ikki o'ramning ishi.
    """
    day = timezone.timedelta(days=1)
    today = timezone.localdate()

    if key == "today":
        start, end = today, today + day
    elif key == "yesterday":
        start, end = today - day, today
    elif key == "tomorrow":
        start = today + day
        end = start + day
    elif key == "week":
        start = today - timezone.timedelta(days=today.weekday())   # dushanba
        end = start + timezone.timedelta(days=7)
    elif key == "month":
        start = today.replace(day=1)
        # Oyning uzunligi turlicha: 32 kun qo'shib, keyingi oyning
        # birinchi kuniga tushamiz - qaysi oy bo'lishidan qat'i nazar.
        end = (start + timezone.timedelta(days=32)).replace(day=1)
    elif key == "year":
        start = today.replace(month=1, day=1)
        end = start.replace(year=start.year + 1)
    else:
        return None

    return start, end


def _due_range(key):
    """`_due_range_dates` ning LAHZA ko'rinishi - `Task.due_date` uchun.

    Chegara `_period_start` dagidek Toshkent kunidan yasaladi va aniq lahza
    bo'lib qaytadi, `__date` emas: Db2 da sanani ustundan ajratib olish
    mintaqani hisobga olmaydi va tunda kun chegarasi bir kunga siljib
    ketardi.
    """
    span = _due_range_dates(key)
    if span is None:
        return None

    def midnight(d):
        return timezone.make_aware(datetime.combine(d, dtime.min))

    return midnight(span[0]), midnight(span[1])


def due_span(due_raw="", period=""):
    """«Muddat» kesimi: aniq SANA yoki tayyor DAVR -> `[boshi, oxiri)`.

    Ikkovi ham bir xil natijaga keladi, shuning uchun bitta joyda. Birga
    berilsa aniq sana ustun turadi - u aniqroq so'rov. Hech biri berilmasa
    `None` qaytadi, ya'ni kesim yo'q.

    Muddati QO'YILMAGAN ish bu kesimga hech qachon tushmaydi: `due_date`
    bo'sh bo'lsa ikkala solishtiruv ham NULL beradi.
    """
    due_raw = (due_raw or "").strip()
    period = (period or "").strip()

    if due_raw:
        day = parse_date(due_raw)
        if day is None:
            raise DrfValidationError({"due": "Sana YYYY-MM-DD korinishida bolsin."})
        # Kun chegarasi TOSHKENT vaqtidan yasaladi va aniq lahza bo'lib
        # qaytadi: Db2 da `__date` mintaqani hisobga olmaydi va tungi
        # ishlar qo'shni kunga tushib qolardi.
        start = timezone.make_aware(datetime.combine(day, dtime.min))
        return start, start + timezone.timedelta(days=1)

    if period:
        span = _due_range(period)
        if span is None:
            raise DrfValidationError(
                {"period": "Faqat {}.".format(", ".join(DUE_RANGES))})
        return span

    return None


def due_date_span(due_raw="", period=""):
    """`due_span` ning SANA ko'rinishi - `Project.due_date` (`DateField`) uchun.

    Qoida `due_span` bilan bir xil: aniq sana ustun turadi, hech biri
    berilmasa `None`. Muddati QO'YILMAGAN loyiha bu kesimga hech qachon
    tushmaydi - `due_date` bo'sh bo'lsa solishtiruv NULL beradi.
    """
    due_raw = (due_raw or "").strip()
    period = (period or "").strip()

    if due_raw:
        day = parse_date(due_raw)
        if day is None:
            raise DrfValidationError({"due": "Sana YYYY-MM-DD korinishida bolsin."})
        return day, day + timezone.timedelta(days=1)

    if period:
        span = _due_range_dates(period)
        if span is None:
            raise DrfValidationError(
                {"period": "Faqat {}.".format(", ".join(DUE_RANGES))})
        return span

    return None


