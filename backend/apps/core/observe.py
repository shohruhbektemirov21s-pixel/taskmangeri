"""Kuzatuv: har bir so'rovga IZ va sekin so'rovlar jurnali.

MUAMMO. `LOGGING` da faqat konsol handleri bor edi va har bir qator
o'zicha turardi: qaysi so'rovga tegishli ekani, kim yuborgani va qancha
davom etgani ko'rinmasdi. Ustiga hamma o'qish bitta manzildan o'tadi
(`POST /api/read/`), ya'ni access-log da ham hammasi bir xil ko'rinadi -
«sayt sekin» degan shikoyatga javob beradigan manba umuman yo'q edi.

NIMA QO'SHILDI.

  * SO'ROV IDENTIFIKATORI. Har so'rovga qisqa kod beriladi va u o'sha
    so'rov davomida yozilgan HAMMA log qatoriga tushadi. Javobga ham
    `X-Request-Id` bo'lib qaytadi, ya'ni foydalanuvchi «xato chiqdi»
    deganda o'sha koddan butun izni topib bo'ladi. Tashqaridan kelgan
    `X-Request-Id` qabul qilinadi (teskari proksi qo'ygan bo'lsa iz
    uzilmaydi), lekin uzunligi cheklanadi - u logga tushadi.

  * SEKIN SO'ROV. Belgilangan chegaradan uzoq ketgan so'rov ogohlantirish
    bo'lib yoziladi: yo'l, holat kodi va necha millisekund. O'qish
    shlyuzining ichki yo'li ham yoziladi, aks holda hammasi
    `POST /api/read/` bo'lib qolardi.

NEGA MIDDLEWARE, TASHQI XIZMAT EMAS. Xato yig'uvchi (Sentry va shunga
o'xshash) alohida masala va u `settings.py` da IXTIYORIY qilib ulangan:
`SENTRY_DSN` qo'yilmasa hech narsa o'zgarmaydi. Bu yerdagi ikkita narsa
esa hech qanday bog'liqliksiz ishlaydi va ularsiz tashqi xizmat ham
foydasiz bo'lardi - unda ham iz bo'lmasdi.
"""
import logging
import time
import uuid

logger = logging.getLogger("teamflow.request")

# So'rov identifikatori shu yerda turadi - log filtri uni shundan oladi.
# `contextvars` ataylab: ASGI da bitta oqim bir necha so'rovga xizmat
# qiladi va oddiy `threading.local` aralashib ketardi.
try:
    from contextvars import ContextVar
except ImportError:  # pragma: no cover
    ContextVar = None

_request_id = ContextVar("request_id", default="-")

# Tashqaridan kelgan identifikatorning eng katta uzunligi. U logga
# tushadi, ya'ni cheklanmasa jurnalni to'ldirib yuborish mumkin bo'lardi.
MAX_ID = 64


def current_request_id():
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """Har bir log qatoriga so'rov identifikatorini qo'shadi."""

    def filter(self, record):
        record.request_id = current_request_id()
        return True


class ObservabilityMiddleware:
    """So'rovga iz beradi va sekinini yozib qo'yadi."""

    def __init__(self, get_response):
        from django.conf import settings

        self.get_response = get_response
        # Millisekund. 0 yoki manfiy bo'lsa sekin so'rov jurnali o'chadi.
        self.slow_ms = int(getattr(settings, "SLOW_REQUEST_MS", 1500))

    def __call__(self, request):
        incoming = (request.headers.get("X-Request-Id") or "").strip()[:MAX_ID]
        rid = incoming or uuid.uuid4().hex[:12]
        token = _request_id.set(rid)
        started = time.monotonic()
        try:
            response = self.get_response(request)
        finally:
            took = (time.monotonic() - started) * 1000
            _request_id.reset(token)

        response["X-Request-Id"] = rid

        if self.slow_ms > 0 and took >= self.slow_ms:
            logger.warning(
                "Sekin so'rov: %s %s -> %s, %d ms",
                request.method, self._path(request), response.status_code, took)
        return response

    @staticmethod
    def _path(request):
        """Manzil - o'qish shlyuzi uchun ICHKI yo'l bilan.

        Busiz jurnaldagi hamma o'qish `POST /api/read/` bo'lib ko'rinardi
        va qaysi endpoint sekinligini ajratib bo'lmasdi.
        """
        path = request.path
        if path != "/api/read/":
            return path
        # `request.data` DRF niki va bu yerda hali mavjud emas; tana esa
        # allaqachon o'qilgan bo'lishi mumkin - shuning uchun view qo'ygan
        # belgiga qaraymiz (`apps/core/read.py`).
        inner = getattr(request, "read_gateway_path", None)
        return "{} -> {}".format(path, inner) if inner else path
