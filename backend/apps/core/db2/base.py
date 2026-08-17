"""IBM Db2 backendi - `ibm_db_django` ustiga qo'yilgan yupqa tuzatish qatlami.

NEGA KERAK. `ibm_db_django` vaqt qiymatini shunday uzatadi
(`operations.py` -> `adapt_datetimefield_value`):

    return "TIMESTAMP('" + str(value) + "')"

Loyihada `USE_TZ = True`, ya'ni Django mintaqali (aware) vaqt beradi va
`str(value)` `2026-08-13 10:45:33.275303+00:00` bo'lib chiqadi. Db2 esa
`+00:00` qo'shimchasini tushunmaydi va migratsiya birinchi yozuvdayoq
yiqiladi:

    SQL0180N  The syntax of the string representation of a datetime value
    is incorrect.  SQLSTATE=22007

Bu adapterning xatosi. Django ning boshqa backendlari mintaqali vaqtni
saqlashdan oldin UTC ga keltirib, mintaqasiz (naive) qilib beradi - shu
yerda ham xuddi shunday qilamiz.

Ikkinchi guruh xatolar - mintaqaga o'tkazish: adapter Db2 da mavjud
bo'lmagan `TIMEZONE_TZ(...)` funksiyasini va Postgres kastlarini
(`::date`, `::time`) chiqaradi. Tafsiloti quyida, o'sha metodlar tepasida.

Backendni butunlay o'zimizniki qilib yozish shart emas: `ibm_db_django`
dagi hamma narsa meros olinadi, faqat sanoqli metod to'g'rilanadi.
"""
import datetime
import zoneinfo

from django.conf import settings
from django.db.backends.utils import split_tzname_delta
from django.utils import timezone

from ibm_db_django.base import DatabaseWrapper as Db2DatabaseWrapper
from ibm_db_django.operations import DatabaseOperations as Db2DatabaseOperations

# `ibm_db_django` dagi qolgan hamma narsa shu modul orqali ham ko'rinsin -
# Django ba'zan backend modulidan `DatabaseError` kabi nomlarni izlaydi.
from ibm_db_django.base import *  # noqa: F401,F403


class DatabaseOperations(Db2DatabaseOperations):
    """Vaqt qiymatlarini Db2 tushunadigan ko'rinishga keltiradi."""

    def adapt_datetimefield_value(self, value):
        if value is None:
            return None
        # Ifoda (F(), Now() va h.k.) bo'lsa - bazaning o'zi hal qiladi.
        if hasattr(value, "resolve_expression"):
            return value

        if timezone.is_aware(value):
            if settings.USE_TZ:
                # Db2 TIMESTAMP mintaqani saqlamaydi: UTC ga keltiramiz.
                value = timezone.make_naive(value, datetime.timezone.utc)
            else:
                raise ValueError(
                    "Db2 mintaqali vaqtni qo'llamaydi (USE_TZ=False bo'lganda)."
                )
        return "TIMESTAMP('{}')".format(value)

    def adapt_timefield_value(self, value):
        if value is None:
            return None
        if hasattr(value, "resolve_expression"):
            return value
        if timezone.is_aware(value):
            raise ValueError("Db2 mintaqali vaqtni qo'llamaydi.")
        return "'{}'".format(value)

    # ------------------------------------------------------ mintaqaga o'tkazish
    # MUAMMO. `ibm_db_django` ning `_convert_sql_to_tz()` i vaqtni mintaqaga
    # o'tkazish uchun `TIMEZONE_TZ(...)` chaqiradi. Bunday funksiya Db2 da
    # YO'Q - u PostgreSQL dan ko'chib qolgan (o'sha fayldagi `::date` va
    # `::time` kastlari ham Postgres sintaksisi). Natijada mintaqaga bog'liq
    # har qanday kesish yiqiladi:
    #
    #     SQL0440N  No authorized routine named "TIMEZONE_TZ" ...  SQLSTATE=42884
    #
    # Buning ustiga tushadigan joylar: `Trunc*`, `datetimes()`, `__date`
    # qidiruvi va admin paneldagi `date_hierarchy` (masalan «Loyiha tarixi»).
    #
    # YECHIM. Vaqt bazada UTC va mintaqasiz saqlanadi (yuqoridagi
    # `adapt_datetimefield_value`), demak mintaqaga o'tkazish - oddiy
    # qo'shish: `TIMESTAMP + N MINUTES`. Buni Db2 tushunadi.
    #
    # CHEGARASI. Siljish bir marta hisoblanadi va butun ustunga bir xil
    # qo'llanadi. Yozgi/qishki vaqti bor mintaqalarda eski yozuvlar bir soatga
    # siljib ko'rinishi mumkin. Loyihaning mintaqasi `Asia/Tashkent` - unda
    # yozgi vaqt yo'q (doim UTC+5), shuning uchun natija aniq.
    @staticmethod
    def _tz_offset_minutes(tzname):
        """`Asia/Tashkent`, `UTC+03:00` kabi nomni daqiqadagi siljishga aylantiradi."""
        name, sign, offset = split_tzname_delta(tzname)
        minutes = 0
        if name and name.upper() != "UTC":
            try:
                shift = datetime.datetime.now(zoneinfo.ZoneInfo(name)).utcoffset()
            except Exception:
                shift = None
            if shift is not None:
                minutes = int(shift.total_seconds() // 60)
        if offset:
            hours, _, mins = offset.partition(":")
            delta = int(hours) * 60 + int(mins or 0)
            minutes += -delta if sign == "-" else delta
        return minutes

    def _convert_sql_to_tz(self, sql, params, tzname):
        if not (tzname and settings.USE_TZ
                and self.connection.timezone_name != tzname):
            return sql, params
        minutes = self._tz_offset_minutes(tzname)
        if not minutes:
            return sql, params
        # `minutes` - o'zimiz hisoblagan butun son, tashqaridan kelmaydi.
        return f"({sql} + {minutes} MINUTES)", params

    def datetime_cast_date_sql(self, sql, params, tzname):
        # Asl adapter `({sql})::date` beradi - bu Postgres kasti.
        sql, params = self._convert_sql_to_tz(sql, params, tzname)
        return f"DATE({sql})", params

    def time_trunc_sql(self, lookup_type, sql, params, tzname=None):
        # Asl adapter `DATE_TRUNC(...)::time` beradi - yana Postgres kasti.
        sql, params = self._convert_sql_to_tz(sql, params, tzname)
        return f"TIME(DATE_TRUNC(%s, {sql}))", (lookup_type, *params)


class DatabaseWrapper(Db2DatabaseWrapper):
    ops_class = DatabaseOperations

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Ota-klass `__init__` ichida `self.ops` ni to'g'ridan-to'g'ri
        # `DatabaseOperations(self)` deb yaratadi va `ops_class` ni
        # e'tiborga olmaydi - shuning uchun almashtirib qo'yamiz.
        self.ops = DatabaseOperations(self)
