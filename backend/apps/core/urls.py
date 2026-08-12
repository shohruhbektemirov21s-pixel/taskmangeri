from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.accounts.api import UserViewSet

from . import api

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("dashboard/", api.dashboard, name="dashboard"),
    path("my-work/", api.my_work, name="my_work"),
    path("meta/", api.meta, name="meta"),
] + router.urls
