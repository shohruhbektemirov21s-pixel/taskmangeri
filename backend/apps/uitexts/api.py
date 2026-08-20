"""Interfeys matnlarini beruvchi ochiq endpoint.

TOKENSIZ. Kirish va bosh sahifadagi so'zlar ham shu yerdan keladi, ya'ni
foydalanuvchi hali tizimga kirmagan paytda ham kerak bo'ladi.

KESHLASH. Ro'yxat kichik, lekin har sahifa ochilishida so'raladi. Shuning
uchun javobga ETag qo'yamiz: matn o'zgarmagan bo'lsa brauzer 304 oladi va
tanani umuman yuklamaydi. ETag - yozuvlar soni va eng oxirgi o'zgarish
vaqtidan yig'iladi; birortasi tahrirlansa `updated_at` yangilanadi va teg
o'zgaradi.
"""
from django.db.models import Max
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import UiText


def current_version():
    """Matnlar holatining qisqa belgisi — soni va oxirgi o'zgarish vaqti."""
    agg = UiText.objects.aggregate(n=Max("id"), last=Max("updated_at"))
    count = UiText.objects.count()
    stamp = agg["last"].isoformat() if agg["last"] else "-"
    return f"{count}.{stamp}"


@api_view(["GET"])
@permission_classes([AllowAny])
def ui_texts(request):
    version = current_version()
    etag = f'"{version}"'

    # Brauzerdagi nusxa hali ham to'g'ri bo'lsa - tanani qayta yubormaymiz.
    if request.headers.get("If-None-Match") == etag:
        response = Response(status=304)
        response["ETag"] = etag
        return response

    items = dict(UiText.objects.values_list("key", "value"))
    response = Response({"version": version, "items": items})
    response["ETag"] = etag
    # Matn o'zgarganda darrov ko'rinishi kerak, shuning uchun saqlamaymiz -
    # lekin ETag borligi uchun qayta so'rov baribir arzon (304).
    response["Cache-Control"] = "no-cache"
    return response
