import logging

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.media import serve_media

logger = logging.getLogger(__name__)


def health(request):
    """`GET /api/health/` - xizmat HAQIQATAN ishlayaptimi.

    Ilgari bu funksiya shartsiz `{"status": "ok"}` qaytarardi: Db2
    butunlay yiqilgan bo'lsa ham «ok» derdi, ya'ni ishonib bo'lmasdi.
    Kulgilisi shundaki, `docker-compose.yml` dagi haqiqiy healthcheck
    `/api/ui-texts/` ni so'raydi - u bazaga tegadi, ya'ni ishlaydigan
    tekshiruv tasodifan boshqa manzilda turgan edi.

    Endi ikkala bog'liqlik ham so'raladi. Xato SABABI javobga
    yozilmaydi - bu manzil tokensiz ochiq va ichki nosozlik matni
    tashqariga chiqmasligi kerak; sababi logga tushadi.

    Yiqilganda `503` qaytadi: orkestrator (Docker, Kubernetes) aynan
    holat kodiga qaraydi.
    """
    from django.core.cache import cache
    from django.db import connection

    checks = {}

    try:
        with connection.cursor() as cur:
            # Db2 `SELECT` ni `FROM` siz qabul qilmaydi va shu maqsad uchun
            # `SYSIBM.SYSDUMMY1` degan bir qatorli jadval beradi. SQLite
            # (testlar shunda yuguradi) esa aksincha - unda bunday jadval
            # yo'q. Shuning uchun so'rov backendga qarab tanlanadi.
            cur.execute("SELECT 1" if connection.vendor == "sqlite"
                        else "SELECT 1 FROM SYSIBM.SYSDUMMY1")
            cur.fetchone()
        checks["db"] = True
    except Exception:
        logger.exception("Health: bazaga ulanib bo'lmadi")
        checks["db"] = False

    try:
        # Kesh - throttle hisoblagichlari va kunlik eslatma qulfi shu yerda.
        cache.set("health", "1", 10)
        checks["cache"] = cache.get("health") == "1"
    except Exception:
        logger.exception("Health: keshga yozib bo'lmadi")
        checks["cache"] = False

    ok = all(checks.values())
    return JsonResponse(
        {"status": "ok" if ok else "fail", "service": "teamflow-api", "checks": checks},
        status=200 if ok else 503,
    )


# API marshrutlari - bitta ro'yxat, ikkita prefiks ostida ulanadi.
#
# VERSIYALASH. Ilgari faqat `/api/` bor edi, ya'ni shartnomani buzadigan
# o'zgarish qilinsa barcha mijoz bir vaqtda yangilanishi kerak bo'lardi.
# Frontend ilova bilan birga chiqadi, lekin u yagona mijoz emas va
# kelajakda ham bo'lmaydi.
#
# `/api/v1/` - AYNAN o'sha marshrutlar, ya'ni bugun hech narsa
# o'zgarmaydi va eski manzil ishlayveradi. Foydasi ertaga bilinadi:
# `v2` qo'shilganda `v1` joyida qoladi va mijozlar o'z vaqtida ko'chadi.
API_ROUTES = [
    path("auth/", include("apps.accounts.urls")),
    path("", include("apps.accounts.api_urls")),
    path("", include("apps.workspaces.urls")),
    path("", include("apps.projects.urls")),
    path("", include("apps.tasks.urls")),
    path("", include("apps.activity.urls")),
    path("", include("apps.notifications.urls")),
    path("", include("apps.chat.urls")),
    path("", include("apps.telegram.urls")),
    path("", include("apps.uitexts.urls")),
    path("", include("apps.suggestions.urls")),
    path("", include("apps.panel.urls")),
    path("", include("apps.core.urls")),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/health/", health),
    # OpenAPI: mashina o'qiydigan shartnoma va uni ko'rish sahifasi.
    # Tokensiz - sxemada faqat manzillar va maydon nomlari bor, ma'lumot
    # yo'q; ular allaqachon repoda ochiq turibdi.
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    # Prefikssiz (joriy mijozlar) va versiyali - ikkovi bir xil ishlaydi.
    path("api/", include((API_ROUTES, "api"), namespace="api")),
    path("api/v1/", include((API_ROUTES, "api"), namespace="api-v1")),
]

# Media fayllar faqat API bergan imzolangan manzil bilan ochiladi -
# sababi va tafsiloti `apps/core/media.py` da.
urlpatterns += [
    re_path(r"^media/(?P<path>.*)$", serve_media),
]
