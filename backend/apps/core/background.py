"""Javob yo'lidan chiqariladigan kichik ishlar.

MUAMMO. Bildirishnoma yozilgach u Telegramga ham uzatiladi va bu TASHQI
tarmoq so'rovi: `urllib` 15 soniyagacha kutadi. Chaqiruv esa foydalanuvchi
so'rovining ichida edi - ya'ni api.telegram.org sekinlashsa, ilovaning
o'zi sekinlashardi. `notify_many` esa buni ketma-ket qiladi: yigirma
kishilik ro'yxatga yigirmata so'rov, biri tugamasdan ikkinchisi
boshlanmaydi. Bitta `bulk` vazifa yaratish shu sababdan bir necha o'n
soniyaga cho'zilishi mumkin edi va o'sha vaqt davomida ASGI ishchisi band
turardi.

YECHIM. Bunday ishlar kichik oqimlar to'plamiga (thread pool) beriladi:
so'rov javobni darrov qaytaradi, xabar esa fonda ketadi. Navbat xizmati
(Celery, RQ) qo'shilmadi - loyihada broker yo'q va bitta tashqi chaqiruv
uchun butun bir xizmat ortiqcha.

CHEGARASI ochiq aytiladi: jarayon qayta ishga tushsa navbatdagi xabar
yo'qoladi. Bildirishnomaning O'ZI bazada va WebSocketda allaqachon
yetkazilgan, Telegram esa qo'shimcha kanal - shuning uchun bu narx
qabul qilinadi. Xabar yetib borishi kafolatlanishi kerak bo'lsa, o'shanda
haqiqiy navbat kerak bo'ladi.

XATO YUTILADI. Fon oqimidagi istisno hech kimga ko'rinmaydi va uni ushlab
qolmasak butun oqim jimgina o'lardi - shuning uchun logga yoziladi.
"""
import logging
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.db import connection

logger = logging.getLogger(__name__)

# To'rtta oqim: bu yerdan faqat tarmoq kutiladi, hisob-kitob emas.
MAX_WORKERS = 4

_pool = None


def _executor():
    """Oqimlar to'plami - birinchi kerak bo'lganda yasaladi.

    Modul yuklanganda emas: boshqaruv buyruqlari va migratsiyalar uchun
    bo'sh turadigan oqimlar ochish keraksiz.
    """
    global _pool
    if _pool is None:
        _pool = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="tf-bg")
    return _pool


def _guarded(func, args, kwargs):
    try:
        return func(*args, **kwargs)
    except Exception:
        logger.exception("Fon vazifasi yiqildi: %s", getattr(func, "__name__", func))
        return None
    finally:
        # Oqim bazaga tegib qo'ygan bo'lsa ulanish o'zidan keyin qolmasin.
        # Tegmagan bo'lsa bu hech narsa qilmaydi.
        connection.close()


def run_later(func, *args, **kwargs):
    """Funksiyani fonda bajaradi. Testlarda - AYNI SHU YERDA.

    `settings.BACKGROUND_TASKS` o'chirilganda (test rejimi) chaqiruv
    to'g'ridan-to'g'ri bajariladi va natijasi qaytadi: testlar «yuborildimi»
    degan savolga darrov javob olishi kerak, oqim tugashini kutib
    o'tirmasligi kerak.
    """
    if not getattr(settings, "BACKGROUND_TASKS", True):
        return func(*args, **kwargs)
    _executor().submit(_guarded, func, args, kwargs)
    return None
