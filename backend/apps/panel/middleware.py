"""Muddat eslatmalarini kunda bir marta ishga tushiruvchi.

NEGA BU YERDA. Loyihada rejalashtiruvchi (cron, Celery beat) yo'q va
uni qo'shish butun bir xizmat qo'shish demakdir - shu sabab tekshiruv
kelayotgan so'rovga ilashtirilgan. Ilgari u BOSH PANEL ko'rinishining
ichida turardi va oqibati og'ir edi: jamoa o'sha kuni bosh panelni
ochmasa, muddat eslatmasi UMUMAN ketmasdi. Ya'ni odamlar tizimga kam
kirgan kuni - aynan eslatma eng kerak bo'lgan kuni - u jim qolardi.

Endi tekshiruv HAR QANDAY so'rovda bo'ladi: vazifa ochilsa ham, loyiha
ro'yxati so'ralsa ham, hatto interfeys matnlari olinsa ham. Narxi bitta
kesh o'qishi, foydasi esa - eslatma bosh panelga emas, ilovadan
foydalanishning o'ziga bog'lanadi.

QOLGAN CHEGARA. Bu baribir rejalashtiruvchi emas: kun bo'yi backendga
BIRORTA ham so'rov kelmasa, o'sha kuni eslatma yuborilmaydi. To'liq
kafolat kerak bo'lsa alohida xizmat (cron konteyneri) qo'shiladi.

`apps.panel` - eng ustki qavat, ya'ni `projects` ni import qilishi
qonuniy. Middleware sozlamalarda MATN bilan ko'rsatiladi, shuning uchun
bu modul hech kimga bog'liqlik qo'shmaydi.
"""
import logging

from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)


def tick_deadline_reminders():
    """Kuniga bir marta muddat eslatmalarini yuboradi.

    Ikki qavatli himoya: keshdagi kalit ortiqcha ishni to'xtatadi (bir
    nechta backend jarayoni bo'lsa ham bittasi bajaradi),
    `ProjectDeadlineNotice` esa xabarning o'zi takrorlanmasligini
    kafolatlaydi. So'rov sekinlashmasin uchun xato bo'lsa jim o'tiladi.
    """
    from apps.projects.deadlines import send_due_reminders

    key = "deadline-reminders:{}".format(timezone.localdate())
    try:
        # `add` - kalit yo'q bo'lsagina qo'yadi, ya'ni kunning birinchi so'rovi.
        if not cache.add(key, 1, 60 * 60 * 26):
            return
        send_due_reminders()
    except Exception:
        logger.exception("Muddat eslatmalarini yuborib bo'lmadi")


class DeadlineReminderMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        # Javob tayyor bo'lgach: eslatma yuborish so'rovni kutdirmasin.
        tick_deadline_reminders()
        return response
