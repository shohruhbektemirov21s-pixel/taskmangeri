import logging

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

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


urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/health/", health),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.accounts.api_urls")),
    path("api/", include("apps.workspaces.urls")),
    path("api/", include("apps.projects.urls")),
    path("api/", include("apps.tasks.urls")),
    path("api/", include("apps.activity.urls")),
    path("api/", include("apps.notifications.urls")),
    path("api/", include("apps.chat.urls")),
    path("api/", include("apps.telegram.urls")),
    path("api/", include("apps.uitexts.urls")),
    path("api/", include("apps.suggestions.urls")),
    path("api/", include("apps.panel.urls")),
    path("api/", include("apps.core.urls")),
]

# Media fayllar faqat API bergan imzolangan manzil bilan ochiladi -
# sababi va tafsiloti `apps/core/media.py` da.
urlpatterns += [
    re_path(r"^media/(?P<path>.*)$", serve_media),
]
