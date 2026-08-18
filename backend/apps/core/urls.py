from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.accounts.api import UserViewSet

from . import api, public, read, team

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    # O'qish shlyuzi: GET o'rniga POST. Tafsiloti - `read.py` da.
    path("read/", read.read, name="read"),
    path("dashboard/", api.dashboard, name="dashboard"),
    # Panel katagi bosilganda - o'sha kataka kirgan ishlar ro'yxati.
    path("dashboard/tasks/", api.panel_tasks, name="panel_tasks"),
    # Yon paneldagi uchta raqam - panelning ogir versiyasi ornida
    path("counts/", api.sidebar_counts, name="sidebar_counts"),
    path("my-work/", api.my_work, name="my_work"),
    path("meta/", api.meta, name="meta"),
    # Jamoaga a'zo qo'shish - to'g'ridan-to'g'ri (ilgari taklif orqali edi)
    path("team/candidates/", team.candidates, name="team_candidates"),
    path("team/add/", team.add_member, name="team_add"),
    # Ochiq (autentifikatsiyasiz) - bosh sahifadagi qidiruv uchun
    path("public/projects/", public.public_projects, name="public_projects"),
    path("public/projects/<int:pk>/", public.public_project, name="public_project"),
    path("public/stats/", public.public_stats, name="public_stats"),
] + router.urls
