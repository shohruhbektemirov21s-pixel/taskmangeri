"""Panel, jamoa yuklamasi va ochiq qidiruv marshrutlari.

Manzillar `apps.core.urls` dagi bilan AYNAN bir xil qoldirildi — ko'chirish
ichki tartibga tegishli, interfeys uchun hech narsa o'zgarmadi.
"""
from django.urls import path

from . import api, public, team

urlpatterns = [
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
    # Boshqaruvdagi loyihalar bo'yicha: kim qaysi ishni qilyapti
    path("team/workload/", team.workload, name="team_workload"),
    # Ochiq (autentifikatsiyasiz) - bosh sahifadagi qidiruv uchun
    path("public/projects/", public.public_projects, name="public_projects"),
    path("public/projects/<int:pk>/", public.public_project, name="public_project"),
    path("public/stats/", public.public_stats, name="public_stats"),
]
