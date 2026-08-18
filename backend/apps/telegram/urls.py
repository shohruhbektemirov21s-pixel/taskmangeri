from django.urls import path

from . import api

urlpatterns = [
    path("telegram/link/", api.telegram_link, name="telegram_link"),
]
