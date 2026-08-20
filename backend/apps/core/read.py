"""O'qish shlyuzi — GET o'rniga POST.

TALAB. Ma'lumot manzilda emas, so'rov TANASIDA so'ralsin: brauzer manzil
qatorida `?project=6` yoki `/projects/6/` ko'rinmasin va hamma o'qish
`POST` bo'lsin.

NEGA HAR BIR ENDPOINTNI QAYTA YOZMADIK. Ilovada ellikdan ortiq o'qish
nuqtasi bor: ro'yxatlar, bitta yozuv, ichki amallar (`/projects/6/members/`,
`/tasks/9/history/`, `/users/3/work/`...). Har biriga POST juftini yasash
degani - ellik yangi marshrut, ellik yangi test va ikki xil kod yo'li
(GET va POST bir xil narsani ikki joyda qilardi). Birinchi tuzatilmagan
joyda ular bir-biridan uzoqlashib ketardi.

Buning o'rniga BITTA darvoza bor. U so'rov tanasidan yo'lni oladi va
ichkarida O'SHA mavjud view ni chaqiradi:

    POST /api/read/
    {"path": "/projects/6/", "params": {"status": "ACTIVE"}}

Ruxsatlar, filtrlar, sahifalash, xatolik matnlari - hammasi o'zgarishsiz
qoladi, chunki ishni baribir o'sha view bajaradi. Tashqi so'rovning
`Authorization` sarlavhasi ichkariga uzatiladi, ya'ni odam kim bo'lsa,
ichkarida ham o'sha bo'ladi: birovning loyihasini shu darvoza orqali ham
o'qib bo'lmaydi.

XAVFSIZLIK. Darvoza ichki manzillarni ochib qo'ymasin:
  * faqat `/api/` bilan boshlanadigan yo'l qabul qilinadi - ya'ni
    `/django-admin/` ham, `/media/` ham o'tmaydi;
  * darvozaning o'ziga murojaat bloklangan (cheksiz halqa bo'lmasin);
  * ichkariga faqat GET yuboriladi - yozish amallari bu yerdan o'tmaydi;
  * javob DRF `Response` bo'lishi shart, aks holda rad etiladi.
"""
from urllib.parse import urlencode

from django.http import Http404, HttpRequest, QueryDict
from django.urls import Resolver404, resolve
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Darvoza orqali o'qishga ruxsat etilgan yo'l boshi.
API_PREFIX = "/api/"
# O'zini o'zi chaqirmasin.
SELF_PATH = "/api/read/"

# Ichki so'rovga ko'chiriladigan sarlavhalar. Butun `META` ni ko'chirsak
# tashqi so'rovning `CONTENT_TYPE` va `CONTENT_LENGTH` i ham ketardi va
# ichkaridagi view bo'sh GET tanasini JSON deb o'qishga urinardi.
COPIED_META = (
    "HTTP_AUTHORIZATION",   # kim so'rayapti - eng muhimi
    "HTTP_COOKIE",          # sessiya bilan kirganlar uchun
    "HTTP_ACCEPT",
    "HTTP_ACCEPT_LANGUAGE",
    "HTTP_USER_AGENT",
    "HTTP_HOST",
    "SERVER_NAME",
    "SERVER_PORT",
    "REMOTE_ADDR",          # tezlik cheklovi (throttling) shunga qarab ishlaydi
    # Teskari proksi ortida haqiqiy IP shu yerda bo'ladi. Usiz butun
    # platformadagi so'rovlar bitta - proksining - IP siga sanalar va
    # tezlik cheklovi amalda umumiy bo'lib qolardi.
    "HTTP_X_FORWARDED_FOR",
    "HTTP_X_REAL_IP",
    "HTTP_X_FORWARDED_PROTO",
    "wsgi.url_scheme",
)

# Ichkaridagi view qo'ygan va TASHQARIGA CHIQISHI SHART bo'lgan sarlavhalar.
#
# Ilgari javobdan faqat tana va status ko'chirilardi. Ya'ni ichkarida
# hamma narsa to'g'ri ishlab, natijasi yo'lda yo'qolardi:
#
#   * `Retry-After` - DRF uni 429 (juda ko'p so'rov) bilan birga qo'yadi.
#     U yetib bormasa mijoz qachon qayta urinishni bilmaydi va darrov
#     yana urinib, cheklovni yana ko'taradi.
#   * `WWW-Authenticate` - 401 da qaysi usul kutilayotganini aytadi.
#   * `ETag` / `Last-Modified` - mijoz o'zi solishtirmoqchi bo'lsa kerak
#     bo'ladi (masalan interfeys matnlari).
#   * `Content-Range` / `Link` - sahifalashning standart ko'rsatkichlari.
#
# Ro'yxat OQ: nomma-nom sanalgani ko'chiriladi. Butun `headers` ni
# ko'chirsak `Content-Type` va `Content-Length` ham o'tar va ular tashqi
# javobning haqiqiy tanasiga to'g'ri kelmasdi.
FORWARDED_HEADERS = (
    "Retry-After",
    "WWW-Authenticate",
    "ETag",
    "Last-Modified",
    "Content-Range",
    "Link",
    "Warning",
)


def _clean_path(raw):
    """Tanadagi yo'lni tekshirib, `/api/...` ko'rinishiga keltiradi.

    Frontend qisqa yozadi (`/projects/6/`), chunki `BASE` allaqachon
    `/api`. Ikkala shakl ham qabul qilinadi.
    """
    if not isinstance(raw, str) or not raw.strip():
        return None
    path = raw.strip()
    # So'rov parametrlari `params` da keladi - yo'lda bo'lmasin.
    if "?" in path:
        path = path.split("?", 1)[0]
    if not path.startswith("/"):
        path = "/" + path
    if not path.startswith(API_PREFIX):
        path = API_PREFIX.rstrip("/") + path
    # `..` bilan yuqoriga chiqishga urinish.
    if "//" in path or "/../" in path or path.endswith("/.."):
        return None
    if not path.startswith(API_PREFIX) or path.startswith(SELF_PATH):
        return None
    return path


def _query_string(params):
    """`params` ni GET satriga aylantiradi.

    Ro'yxat qiymatlari ham qo'llanadi (`?status=A&status=B`), `None` va
    bo'sh satr esa tashlanadi - `api.get` frontendda ham shunday qiladi.
    """
    if not isinstance(params, dict):
        return ""
    pairs = []
    for key, value in params.items():
        if value is None or value == "":
            continue
        if isinstance(value, (list, tuple)):
            pairs.extend((key, str(item)) for item in value if item not in (None, ""))
        elif isinstance(value, bool):
            pairs.append((key, "1" if value else "0"))
        else:
            pairs.append((key, str(value)))
    return urlencode(pairs)


def _sub_request(outer, path, query):
    """Ichkariga yuboriladigan GET so'rovini yasaydi.

    Tashqi so'rov nusxalanmaydi (uning tanasi allaqachon o'qilgan va
    `_body`, `_read_started` kabi ichki holati bor) - toza `HttpRequest`
    yig'iladi va unga faqat kerakli sarlavhalar ko'chiriladi.
    """
    sub = HttpRequest()
    sub.method = "GET"
    sub.path = sub.path_info = path
    sub.GET = QueryDict(query)
    sub.POST = QueryDict()
    sub.COOKIES = outer.COOKIES
    sub.META = {key: outer.META[key] for key in COPIED_META if key in outer.META}
    sub.META.update({
        "REQUEST_METHOD": "GET",
        "PATH_INFO": path,
        "QUERY_STRING": query,
    })
    # Sessiya bilan kirgan odam uchun (`SessionAuthentication`).
    if hasattr(outer, "session"):
        sub.session = outer.session
    return sub


@api_view(["POST"])
@permission_classes([AllowAny])   # ruxsatni ICHKARIDAGI view tekshiradi
def read(request):
    """Tanadagi yo'lni ichki GET ga aylantirib, javobini qaytaradi."""
    path = _clean_path(request.data.get("path"))
    if not path:
        return Response(
            {"path": "Faqat /api/ ichidagi manzil o'qiladi."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    query = _query_string(request.data.get("params"))

    try:
        match = resolve(path)
    except Resolver404:
        return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    sub = _sub_request(request, path, query)
    try:
        response = match.func(sub, *match.args, **match.kwargs)
    except Http404:
        # Funksiya ko'rinishidagi ba'zi view'lar `Http404` ni o'zi ushlamaydi.
        return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    # `.data` faqat DRF javobida bo'ladi. Bo'lmasa - bu darvoza uchun
    # mo'ljallanmagan view (masalan fayl uzatuvchi): qayta yozib
    # yubormaymiz, ochiq rad etamiz.
    if not hasattr(response, "data"):
        return Response(
            {"detail": "Bu manzil POST orqali o'qilmaydi."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    out = Response(response.data, status=response.status_code)
    for name in FORWARDED_HEADERS:
        if name in response.headers:
            out[name] = response.headers[name]
    return out
