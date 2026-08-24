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

CHEGARASI ochiq aytiladi: bu kafolatli navbat emas. Lekin eng ko'p
uchraydigan yo'qotish sababi - odatdagi qayta ishga tushirish - yopilgan:
jarayon TINCH to'xtayotganda navbat bo'shatiladi (`_drain`). Qolgani -
`SIGKILL`, quvvat uzilishi - baribir yo'qotadi. Bildirishnomaning O'ZI
bazada va WebSocketda allaqachon yetkazilgan, Telegram esa qo'shimcha
kanal, shuning uchun bu narx qabul qilinadi. Xabar yetib borishi
KAFOLATLANISHI kerak bo'lsa, o'shanda broker (Celery, RQ) kerak.

XATO YUTILADI. Fon oqimidagi istisno hech kimga ko'rinmaydi va uni ushlab
qolmasak butun oqim jimgina o'lardi - shuning uchun logga yoziladi.
"""
import atexit
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

    Birinchi yasalganda TO'XTASH ILGAGI ham qo'yiladi - pastdagi
    `_drain` ga qarang.
    """
    global _pool
    if _pool is None:
        _pool = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="tf-bg")
        # Jarayon tinch to'xtaganda navbatdagi ish bajarilib bo'lsin.
        atexit.register(_drain)
    return _pool


def _drain():
    """To'xtashdan oldin navbatdagi ishlarni tugatishga imkon beradi.

    NEGA. Bu to'plam kafolatli navbat emas va bu ochiq aytilgan: jarayon
    o'lsa navbatdagi xabar yo'qoladi. Lekin yo'qotishning eng KO'P
    uchraydigan sababi halokat emas - odatdagi qayta ishga tushirish:
    yangi versiya chiqarish, `docker compose restart`, konteynerni
    ko'chirish. Ular oldindan ma'lum va ularda kutish mumkin.

    Shuning uchun `atexit`: jarayon tinch to'xtayotganda navbat
    bo'shatiladi. `SIGKILL` da bu ishlamaydi - o'shanda yo'qotish
    qoladi va haqiqiy kafolat kerak bo'lsa broker (Celery, RQ) kerak.

    Kutishning O'Z chegarasi yo'q - uni tashqaridan Docker qo'yadi:
    `stop_grace_period` (standarti 10 soniya) tugagach `SIGKILL` keladi
    va qolgani baribir tashlanadi. Bu yerdagi ishlar qisqa (bitta HTTP
    so'rov), ya'ni odatda o'sha vaqtga bemalol ulguradi.
    """
    global _pool
    pool, _pool = _pool, None
    if pool is None:
        return
    try:
        # `cancel_futures=False` - boshlanmaganlari ham bajarilsin.
        pool.shutdown(wait=True, cancel_futures=False)
    except Exception:
        logger.exception("Fon oqimlarini to'xtatib bo'lmadi")


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
