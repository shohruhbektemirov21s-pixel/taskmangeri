"""Bazadan mustaqil maydon turlari.

NEGA KERAK. Django ning `JSONField` i faqat uni qo'llaydigan bazalarda
ishlaydi. IBM Db2 adapteri (`ibm_db_django`) esa uni qo'llamaydi:

    supports_json_field = False
    supports_json_field_contains = False

Shu sababli Django `fields.E180` xatosini beradi va migratsiya umuman
ishlamaydi. Quyidagi maydon JSON ni oddiy matn ustunida saqlaydi, o'qish va
yozishni esa o'zi bajaradi - kod uchun hech narsa o'zgarmaydi:

    obj.meta = {"count": 3}
    obj.save()
    obj.meta["count"]        # 3

Matnda saqlangani uchun `meta__key` kabi JSON qidiruvlari ishlamaydi. Bu
loyihada bunday qidiruv yo'q: `meta` faqat o'qib ko'rsatiladi. Qidirish kerak
bo'lgan yagona ma'lumot - loyihaning kerakli mutaxassisliklari - alohida
jadvalga chiqarilgan (`projects.ProjectSpecialty`).
"""
import json

from django.core.exceptions import ValidationError
from django.db import models


class JSONTextField(models.TextField):
    """Matn ustunida saqlanadigan JSON. Har qanday bazada bir xil ishlaydi."""

    description = "Matn ustunida saqlanadigan JSON"
    empty_values = [None, ""]

    def from_db_value(self, value, expression, connection):
        return self._decode(value)

    def to_python(self, value):
        # Forma yoki `full_clean` orqali kelganda ham dekodlaymiz.
        if isinstance(value, str):
            return self._decode(value)
        return value

    def get_prep_value(self, value):
        if value is None:
            return None
        if isinstance(value, str):
            # Allaqachon JSON matn bo'lsa qayta o'ramaymiz.
            try:
                json.loads(value)
                return value
            except (TypeError, ValueError):
                pass
        try:
            return json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError) as exc:
            raise ValidationError("JSON ga aylantirib bo'lmadi: {}".format(exc))

    def value_to_string(self, obj):
        """`dumpdata` uchun: qiymat matn ko'rinishida chiqadi."""
        return self.get_prep_value(self.value_from_object(obj))

    @staticmethod
    def _decode(value):
        if value is None or value == "":
            return value
        if not isinstance(value, str):
            return value
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            # Buzilgan yozuv butun sahifani yiqitmasin - matnicha qaytaramiz.
            return value
