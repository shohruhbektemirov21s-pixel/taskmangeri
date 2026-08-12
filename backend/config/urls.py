from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.static import serve


def health(request):
    return JsonResponse({"status": "ok", "service": "teamflow-api"})


urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/health/", health),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.workspaces.urls")),
    path("api/", include("apps.projects.urls")),
    path("api/", include("apps.tasks.urls")),
    path("api/", include("apps.activity.urls")),
    path("api/", include("apps.notifications.urls")),
    path("api/", include("apps.invites.urls")),
    path("api/", include("apps.chat.urls")),
    path("api/", include("apps.core.urls")),
]

# Media fayllar (vazifaga biriktirilgan hujjatlar) har doim uzatiladi.
# Prod uchun nginx orqali uzatish tavsiya etiladi.
urlpatterns += [
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]
