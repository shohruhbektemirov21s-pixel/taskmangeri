from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from . import api

app_name = "accounts"

urlpatterns = [
    path("specialties/", api.specialties, name="specialties"),
    path("login/", api.LoginView.as_view(), name="login"),
    path("refresh/", TokenRefreshView.as_view(), name="refresh"),
    path("verify/", TokenVerifyView.as_view(), name="verify"),
    path("register/", api.RegisterView.as_view(), name="register"),
    path("me/", api.MeView.as_view(), name="me"),
    path("change-password/", api.ChangePasswordView.as_view(), name="change_password"),
]
