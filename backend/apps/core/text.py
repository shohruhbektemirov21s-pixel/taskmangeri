"""Matnni ustunga sig'dirish - BELGI emas, BAYT bo'yicha.

NEGA `core` DA. Bu Db2 ning xossasi, domenning emas: `CharField(300)`
Db2 da `VARCHAR(300)` bo'ladi va uning o'lchovi BAYTDA. O'zbekcha matnda
bitta belgi ko'pincha ikki-uch bayt («ʻ», «—», «…»), ya'ni 300 belgilik
matn bemalol 300 baytdan oshadi va yozuv `SQL0302N` (SQLSTATE 22001)
bilan yiqiladi.

MUAMMO SHUNDA EDIKI, QOIDA UCH JOYDA UCH XIL BAJARILARDI:

    notifications/services.py   clip(title, 200)    bayt bo'yicha  ✓
    projects/deadlines.py       _blen(text)         bayt bo'yicha  ✓
    activity/services.py        summary[:300]       BELGI bo'yicha ✗

Uchinchisi audit jurnali - rol o'zgarishi, loyiha o'chirilishi va
tekshiruv qarori shu yerga yoziladi. Ustiga `log()` hamma istisnoni
yutadi, ya'ni uzun o'zbekcha sarlavha jimgina TUSHIB QOLARDI: eng uzun,
ya'ni eng mazmunli yozuvlar jurnalga umuman kirmasdi va buni hech kim
sezmasdi.

Endi qoida bitta joyda va uni har ikkovi shu yerdan oladi.
"""


def clip(text, limit):
    """Matnni `limit` BAYTGA sig'diradi.

    Kesilgan joyda yarim belgi qolmasin uchun `errors="ignore"` bilan
    qaytariladi: chala qolgan bayt tashlab yuboriladi.
    """
    data = (text or "").encode("utf-8")
    if len(data) <= limit:
        return text or ""
    return data[:limit].decode("utf-8", "ignore")


def byte_len(text):
    """Matnning BAYTDAGI uzunligi - Db2 ustunlari shu bilan o'lchanadi."""
    return len((text or "").encode("utf-8"))
