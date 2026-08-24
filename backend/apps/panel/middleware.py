"""Muddat eslatmalarining ZAXIRA ishga tushiruvchisi.

ASOSIY YO'L - `scheduler` konteyneri (`docker-compose.yml`): u soatiga
bir marta `manage.py send_deadline_reminders` ni chaqiradi. Bu modul esa
zaxira: rejalashtiruvchi ko'tarilmagan yoki o'chirilgan muhitda ham
eslatma ketsin.

NEGA ZAXIRA KERAK. Tarixi shunday: eslatma avval BOSH PANEL ko'rinishi
ichida turardi va jamoa o'sha kuni panelni ochmasa umuman ketmasdi -
ya'ni odamlar tizimga kam kirgan kuni, aynan eslatma eng kerak bo'lgan
kuni, u jim qolardi. Keyin u har qanday so'rovga ilashtirildi.

NIMA O'ZGARDI. Ish endi so'rov OQIMIDA bajarilmaydi.

Ilgari bu yerda shunday yozilgandi: «javob tayyor bo'lgach - so'rovni
kutdirmasin». Izoh noto'g'ri edi. `get_response()` dan keyin turgan kod
javob mijozga KETISHIDAN oldin bajariladi: Django uni shu yerdan
qaytarib olib, keyin uzatadi. Ya'ni kuniga bir marta bitta baxtsiz
foydalanuvchi butun eslatma partiyasining narxini to'lardi - u esa
hamma loyihani aylanib, har bir a'zoga bildirishnoma yozadi.

Endi chaqiruv `run_later` orqali fon oqimiga beriladi va javob kutmaydi.

TAKRORLANMAYDI. Ikki qavatli himoya: keshdagi kunlik kalit ortiqcha
ishni to'xtatadi, `ProjectDeadlineNotice` esa xabarning o'zi ikki marta
ketmasligini kafolatlaydi. Shu sabab rejalashtiruvchi bilan zaxira bir
vaqtda ishlasa ham odam bitta xabar oladi.

`apps.panel` - eng ustki qavat, ya'ni `projects` ni import qilishi
qonuniy. Middleware sozlamalarda MATN bilan ko'rsatiladi, shuning uchun
bu modul hech kimga bog'liqlik qo'shmaydi.
"""
import logging

from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)


def tick_deadline_reminders():
    """Kunning birinchi so'rovida eslatmalarni FON OQIMIGA beradi.

    Keshdagi kalit qo'yilishi arzon (bitta kesh o'qishi) va u so'rov
    oqimida qoladi; haqiqiy ish esa `run_later` ga o'tadi va javobni
    kutdirmaydi.
    """
    from apps.core.background import run_later
    from apps.projects.deadlines import send_due_reminders

    key = "deadline-reminders:{}".format(timezone.localdate())
    try:
        # `add` - kalit yo'q bo'lsagina qo'yadi, ya'ni kunning birinchi so'rovi.
        if not cache.add(key, 1, 60 * 60 * 26):
            return
        # `run_later` testlarda JOYIDA bajariladi (`BACKGROUND_TASKS`),
        # ya'ni mavjud testlar oldingidek ishlayveradi.
        run_later(_guarded_send, send_due_reminders)
    except Exception:
        logger.exception("Muddat eslatmalarini rejaga qo'yib bo'lmadi")


def _guarded_send(fn):
    """Fon oqimidagi xato hech kimga ko'rinmaydi - hech bo'lmasa logga tushsin."""
    try:
        fn()
    except Exception:
        logger.exception("Muddat eslatmalarini yuborib bo'lmadi")


class DeadlineReminderMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        # Bu yer javob mijozga ketishidan OLDIN bajariladi - shuning uchun
        # ichida faqat kesh tekshiruvi qoladi, ish esa fonga ketadi.
        tick_deadline_reminders()
        return response
