"""`/api/users/` — foydalanuvchilar ro'yxati va profillari.

NEGA `urls.py` DAN ALOHIDA. `apps.accounts.urls` `/api/auth/` ostiga
ulanadi (kirish, chiqish, parol), foydalanuvchilar ro'yxati esa
`/api/users/` da turadi — ikkalasi bitta faylda bo'lsa manzil prefiksi
ikki xil bo'lolmasdi.

Ilgari bu router `apps.core.urls` da edi va `apps.core` shu bitta qator
uchun `apps.accounts` ga bog'lanib turardi. Core esa eng pastki qatlam:
u domen ilovalarini bilmasligi kerak.
"""
from rest_framework.routers import DefaultRouter

from .api import UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = router.urls
