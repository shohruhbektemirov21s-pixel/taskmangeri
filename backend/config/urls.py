from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

from apps.core.media import serve_media


def health(request):
    return JsonResponse({"status": "ok", "service": "teamflow-api"})


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
