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

Backendni butunlay o'zimizniki qilib yozish shart emas: `ibm_db_django`
dagi hamma narsa meros olinadi, faqat ikkita metod to'g'rilanadi.
"""
import datetime

from django.conf import settings
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


class DatabaseWrapper(Db2DatabaseWrapper):
    ops_class = DatabaseOperations

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Ota-klass `__init__` ichida `self.ops` ni to'g'ridan-to'g'ri
        # `DatabaseOperations(self)` deb yaratadi va `ops_class` ni
        # e'tiborga olmaydi - shuning uchun almashtirib qo'yamiz.
        self.ops = DatabaseOperations(self)
