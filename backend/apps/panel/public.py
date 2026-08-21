"""Ochiq (autentifikatsiyasiz) API — bosh sahifadagi qidiruv uchun.

Ro'yxatdan o'tmagan odam ham ochiq loyihalarni qidirib, ko'ra olishi kerak:
platformada nima borligini ko'rmasdan turib odam ro'yxatdan o'tmaydi.

XAVFSIZLIK. Bu yerdan faqat `is_listed=True` loyihalar va faqat **xavfsiz
maydonlar** chiqadi. Chiqmaydigan narsalar: qo'shilish kodi (`join_code`),
a'zolar ro'yxati va ularning emaillari, vazifalar matni, fayllar, tarix.
Menejerning faqat ismi ko'rsatiladi — email emas.

NEGA `is_listed`, `is_public` EMAS. Ilgari bu yerda `is_public` turardi,
lekin u boshqa savolning javobi: «ish maydonidagi hamkasb ko'ra oladimi?».
Uning standarti `True` va u formada umuman ko'rsatilmasdi, ya'ni har bir
yangi loyiha shu endpoint orqali internetga chiqib turardi va buni menejer
tanlamagan edi. Endi tashqariga chiqarish alohida, standarti `False` bo'lgan
maydon bilan - ya'ni ATAYLAB bajariladigan amal (`projects.Project`).
"""
from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.specialties import Specialty
from apps.core.queries import object_or_404
from apps.projects.models import Project
from apps.tasks.models import TaskStatus


class PublicSearchThrottle(ScopedRateThrottle):
    """Ochiq endpoint — qirqib olishning (scraping) oldini olamiz."""

    scope = "search"


def visible_projects():
    """Ochiq loyihalar - ko'rsatishga tayyor holda.

    `progress()` va `needed_specialties` annotatsiya yoki prefetch bo'lmasa
    har loyiha uchun bazaga boradi. Bu endpoint TOKENSIZ ochiq va daqiqada
    120 so'rovga ruxsat etilgan, ya'ni N+1 bu yerda eng qimmat: 12 loyiha
    37 so'rovga aylanardi.
    """
    from apps.core.queries import related_count
    from apps.projects.models import ProjectMember
    from apps.tasks.models import Task

    return (Project.objects.filter(is_listed=True)
            .exclude(status="ARCHIVED")
            .select_related("workspace", "manager")
            .prefetch_related("specialties")
            .annotate(
                member_count=related_count(ProjectMember, group_by="project",
                                           is_active=True),
                # `progress()` shu ikkitasini qaraydi va bazaga bormaydi.
                total_tasks=related_count(Task, group_by="project",
                                          status__in=[s for s in TaskStatus.values
                                                      if s != TaskStatus.CANCELLED]),
                done_tasks=related_count(Task, group_by="project",
                                         status=TaskStatus.DONE)))


def pack(project, counts=None):
    """Ochiq ko'rinish uchun xavfsiz maydonlar to'plami."""
    names = dict(Specialty.choices)
    return {
        "id": project.id,
        "name": project.name,
        "key": project.key,
        "description": project.description,
        "color": project.color,
        "status": project.status,
        "status_display": project.get_status_display(),
        "workspace_name": project.workspace.name,
        # Faqat ism — email va boshqa aloqa ma'lumoti ochiq API dan chiqmaydi.
        "manager_name": project.manager.full_name if project.manager else "",
        "needed_specialties": [
            {"value": v, "label": names.get(v, v)} for v in (project.needed_specialties or [])
        ],
        "member_count": getattr(project, "member_count", None),
        "open_tasks": getattr(project, "open_tasks", None),
        "done_tasks": getattr(project, "done_tasks", None),
        "progress": project.progress(),
        "created_at": project.created_at,
        **(counts or {}),
    }


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([PublicSearchThrottle])
def public_projects(request):
    """GET /api/public/projects/?q=&specialty=

    Bosh sahifadagi qidiruv shu yerga murojaat qiladi.
    """
    from apps.core.queries import related_count
    from apps.tasks.models import Task

    open_statuses = [s for s in TaskStatus.values
                     if s not in (TaskStatus.DONE, TaskStatus.CANCELLED)]
    # `member_count`, `done_tasks` va progress uchun sanoqlar `visible_projects()`
    # da olinadi; bu yerda faqat ochiq vazifalar qo'shiladi.
    qs = visible_projects().annotate(
        open_tasks=related_count(Task, group_by="project", status__in=open_statuses))

    q = (request.query_params.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(name__icontains=q) | Q(description__icontains=q)
                       | Q(key__icontains=q) | Q(workspace__name__icontains=q))

    specialty = (request.query_params.get("specialty") or "").strip()
    if specialty:
        qs = qs.filter(specialties__value=specialty)

    qs = qs.order_by("-updated_at")[:40]
    return Response({
        "query": q,
        "count": len(qs),
        "results": [pack(p) for p in qs],
    })


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([PublicSearchThrottle])
def public_project(request, pk):
    """GET /api/public/projects/:id/ — faqat ochiq loyiha."""
    project = object_or_404(visible_projects(), pk=pk)
    counts = {
        "member_count": project.memberships.filter(is_active=True).count(),
        "open_tasks": project.tasks.exclude(
            status__in=[TaskStatus.DONE, TaskStatus.CANCELLED]).count(),
        "done_tasks": project.tasks.filter(status=TaskStatus.DONE).count(),
    }
    data = pack(project, counts)
    # Jamoada qaysi yo'nalish yetishmayotgani — "menga joy bormi" degan savolga javob.
    names = dict(Specialty.choices)
    data["specialty_gaps"] = [
        {"value": v, "label": names.get(v, v)} for v in project.specialty_gaps()
    ]
    data["team_composition"] = project.team_composition()
    return Response(data)


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([PublicSearchThrottle])
def public_stats(request):
    """Bosh sahifa uchun umumiy raqamlar — hech qanday shaxsiy ma'lumotsiz."""
    from django.contrib.auth import get_user_model

    from apps.tasks.models import Task
    from apps.workspaces.models import Workspace

    return Response({
        "projects": Project.objects.filter(is_listed=True).count(),
        "workspaces": Workspace.objects.count(),
        "people": get_user_model().objects.filter(is_active=True).count(),
        "tasks_done": Task.objects.filter(status=TaskStatus.DONE).count(),
    })
