"""Yuklanadigan fayllarni tekshirish - hajmi va turi bo'yicha.

Ilgari hech qanday chegara yo'q edi: istalgan hajmdagi va istalgan turdagi
fayl qabul qilinardi.

HAJM. Chegarasiz bo'lsa bitta odam diskni to'ldirib qo'ya oladi.

TUR. Asosiy xavf - brauzerda ISHGA TUSHADIGAN fayllar (`.html`, `.svg`).
Ular ilovaning o'z originida ochilsa, ichidagi JS localStorage dagi tokenga
yeta oladi. Shuning uchun bunday turlar umuman qabul qilinmaydi.

Oq ro'yxat emas, qora ro'yxat: loyihada odamlar har xil ish faylini yuklaydi
(arxiv, jadval, sxema, kod) va oq ro'yxat ularni doim yangilab turishni
talab qilardi. Ikkinchi qatlam himoya `core/media.py` da: xavfsiz deb
belgilanmagan tur baribir yuklab olinadi, brauzerda ochilmaydi.
"""

from rest_framework.serializers import ValidationError

# 25 MB. Hujjat, sxema va arxiv uchun yetarli; video uchun emas - u alohida
# saqlash xizmatining ishi.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# Brauzerda kod ishga tushira oladigan kengaytmalar.
BLOCKED_EXTENSIONS = {
    "html", "htm", "xhtml", "shtml", "mhtml", "mht",
    "svg", "svgz", "xml", "xsl", "xslt",
    "js", "mjs", "jsx", "wasm",
}


def _extension(name):
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def check_upload(upload):
    """Bitta faylni tekshiradi. Yaroqsiz bo'lsa `ValidationError` beradi."""
    name = getattr(upload, "name", "") or ""
    size = getattr(upload, "size", 0) or 0

    # Nomsiz yoki bo'sh fayl - odatda uzatishdagi nosozlik. Uni saqlasak
    # ro'yxatda nomsiz, ochib bo'lmaydigan qator paydo bo'ladi.
    if not name or size == 0:
        raise ValidationError({"file": "Fayl bo'sh yoki nomi yo'q."})

    if size > MAX_UPLOAD_BYTES:
        raise ValidationError({"file": "Fayl juda katta: {} MB dan oshmasin ({}).".format(
            MAX_UPLOAD_BYTES // (1024 * 1024), name)})

    if _extension(name) in BLOCKED_EXTENSIONS:
        raise ValidationError({"file": "Bu turdagi fayl qabul qilinmaydi: {}. "
                                       "U brauzerda ochilganda kod ishga tushira oladi.".format(name)})
    return upload


def check_uploads(uploads):
    """Ro'yxatdagi hamma faylni tekshiradi - bittasi yaroqsiz bo'lsa, hech biri saqlanmaydi."""
    for upload in uploads:
        check_upload(upload)
    return uploads
