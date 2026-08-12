from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.accounts.api import UserViewSet

from . import api, public

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("dashboard/", api.dashboard, name="dashboard"),
    path("my-work/", api.my_work, name="my_work"),
    path("meta/", api.meta, name="meta"),
    # Ochiq (autentifikatsiyasiz) - bosh sahifadagi qidiruv uchun
    path("public/projects/", public.public_projects, name="public_projects"),
    path("public/projects/<int:pk>/", public.public_project, name="public_project"),
    path("public/stats/", public.public_stats, name="public_stats"),
] + router.urls
