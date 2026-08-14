"""Media fayllarni uzatish - imzolangan, muddatli manzil orqali.

MUAMMO 1 (manzil). `request.build_absolute_uri()` manzilni `Host` headeridan
yasaydi. Interfeys backendga to'g'ridan-to'g'ri emas, Vite proksisi orqali
murojaat qiladi va u `changeOrigin: true` bilan `Host` ni target nomiga -
`backend:8000` ga - almashtiradi. Natijada javobda `http://backend:8000/media/...`
ketadi. Bu Docker tarmog'i ichidagi nom: brauzer uni umuman yecha olmaydi.
Yechim - nisbiy manzil: `/media/tasks/22/rasm.png`.

MUAMMO 2 (ruxsat). Fayllarni `django.views.static.serve` uzatardi va u hech
qanday ruxsat tekshirmasdi. Hujjat ruxsatlari API darajasida to'g'ri ishlaydi,
lekin fayl baytlari o'sha qoidadan chetlab o'tardi: yo'lni bilgan odam
(`projects/<id>/<asl nomi>` - taxmin qilinadi) yopiq loyihaning hujjatini
tokensiz yuklab olardi.

Oddiy "Authorization headerini tekshiramiz" yechimi bu yerda ishlamaydi:
brauzer `<img src>` va `<a href target=_blank>` ga header qo'sha olmaydi,
JWT esa localStorage da - cookie da emas.

Shuning uchun IMZOLANGAN MANZIL. API faylning manzilini berayotganda unga
qisqa muddatli imzo qo'shadi (`?t=...`). Imzo ichida faylning aynan o'zi
yozilgan, ya'ni bitta fayl uchun berilgan manzil boshqasini ochmaydi.
Ruxsatning o'zi API qatlamida qoladi - u allaqachon to'g'ri ishlaydi:
ro'yxatni ko'ra olsang, imzolangan manzilni ham olasan.
"""

from django.conf import settings
from django.core import signing
from django.core.exceptions import PermissionDenied
from django.views.static import serve

# Imzo tuzi va amal qilish muddati. Olti soat - odam hujjatni ochib, o'qib,
# yopishi uchun yetarli; ulashilgan havola esa abadiy yashamaydi.
MEDIA_SALT = "teamflow.media"
MEDIA_TTL = 60 * 60 * 6

# Brauzerda ichkarida ochilishi xavfsiz turlar. Qolgani yuklab olinadi:
# `.html` yoki `.svg` ilovaning o'z originida ochilsa, ichidagi JS ishga
# tushadi va localStorage dagi tokenga yeta oladi.
INLINE_SAFE = {
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif",
    "application/pdf", "text/plain",
}


def media_url(fieldfile):
    """FileField/ImageField uchun imzolangan nisbiy manzil (yoki None)."""
    if not fieldfile:
        return None
    try:
        url = fieldfile.url
    except ValueError:
        # Fayl biriktirilmagan bo'lsa `.url` ValueError beradi.
        return None
    token = signing.dumps(fieldfile.name, salt=MEDIA_SALT)
    return "{}?t={}".format(url, token)


def serve_media(request, path):
    """`/media/...` - faqat API bergan imzo bilan ochiladi."""
    try:
        signed_path = signing.loads(request.GET.get("t", ""),
                                    salt=MEDIA_SALT, max_age=MEDIA_TTL)
    except signing.SignatureExpired:
        raise PermissionDenied("Havola muddati tugagan - sahifani yangilang.")
    except signing.BadSignature:
        raise PermissionDenied("Fayl manzili yaroqsiz.")

    # Imzo aynan shu faylga berilganmi. Bo'lmasa - bitta faylning manzili
    # bilan boshqasini ochib olish mumkin bo'lardi.
    if signed_path != path:
        raise PermissionDenied("Fayl manzili yaroqsiz.")

    response = serve(request, path, document_root=settings.MEDIA_ROOT)
    ctype = (response.headers.get("Content-Type") or "").split(";")[0].strip()
    if ctype not in INLINE_SAFE:
        # Fayl nomi saqlanadi, faqat "inline" -> "attachment" ga almashadi.
        disposition = response.headers.get("Content-Disposition", "inline")
        response.headers["Content-Disposition"] = disposition.replace("inline", "attachment", 1)
    return response
