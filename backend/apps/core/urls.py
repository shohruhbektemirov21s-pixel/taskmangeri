"""`apps.core` ning yagona marshruti — o'qish shlyuzi.

Ilgari bu yerda panel, jamoa yuklamasi, ochiq qidiruv va foydalanuvchilar
ro'yxati ham turardi. Ular `apps.panel` va `apps.accounts` ga ko'chdi —
sababi `apps/panel/__init__.py` da yozilgan. Manzillar o'zgarmadi.
"""
from django.urls import path

from . import read

urlpatterns = [
    # O'qish shlyuzi: GET o'rniga POST. Tafsiloti - `read.py` da.
    path("read/", read.read, name="read"),
]
