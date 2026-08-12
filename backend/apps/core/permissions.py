"""Ruxsatlar qatlami.

Rollar ierarxiyasi:
  ADMIN (tizim)  -> hamma narsaga ruxsat, tasklarni tekshiradi, yonalish beradi
  MANAGER        -> oz loyihasini boshqaradi, azo qabul qiladi, task beradi/tekshiradi
  DEVELOPER / QA -> oziga biriktirilgan tasklarni bajaradi
  VIEWER         -> faqat oqiydi
"""
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied


class IsPlatformAdmin(permissions.BasePermission):
    message = "Bu amal faqat admin uchun."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.is_platform_admin)


def get_membership(user, project):
    """Foydalanuvchining loyihadagi faol azoligi (yoki None)."""
    if not user or not user.is_authenticated:
        return None
    return project.memberships.filter(user=user, is_active=True).select_related("user").first()


class ProjectAccess:
    """Bitta joyda jamlangan ruxsat javoblari."""

    def __init__(self, user, project):
        from apps.projects.models import ProjectRole

        self.user = user
        self.project = project
        self.membership = get_membership(user, project)
        self.role = self.membership.role if self.membership else None
        self.is_admin = bool(user and user.is_authenticated and user.is_platform_admin)
        self.is_manager = (self.role == ProjectRole.MANAGER
                           or project.manager_id == getattr(user, "id", None))
        self.is_developer = self.role in (ProjectRole.DEVELOPER, ProjectRole.QA)
        self.is_member = self.membership is not None

    @property
    def can_view(self):
        return self.is_admin or self.is_member or self.project.is_public

    @property
    def can_manage(self):
        """Azolarni qabul qilish/chiqarish, loyiha sozlamalari."""
        return self.is_admin or self.is_manager

    @property
    def can_create_task(self):
        return self.is_admin or self.is_manager

    @property
    def can_review(self):
        """Taskni tekshirib qabul qilish yoki qaytarish."""
        return self.is_admin or self.is_manager

    @property
    def can_work(self):
        """Task statusini surish, izoh va worklog qoshish."""
        return self.is_admin or self.is_manager or self.is_developer

    @property
    def label(self):
        if self.is_admin:
            return "Admin"
        if self.membership:
            return self.membership.get_role_display()
        return "Mehmon"

    def as_dict(self):
        return {
            "role": self.role,
            "role_label": self.label,
            "is_admin": self.is_admin,
            "is_manager": self.is_manager,
            "is_member": self.is_member,
            "can_view": self.can_view,
            "can_manage": self.can_manage,
            "can_create_task": self.can_create_task,
            "can_review": self.can_review,
            "can_work": self.can_work,
        }


def require_project(user, project_id, need="view"):
    """Loyihani olib, kerakli ruxsatni tekshiradi. (project, access) qaytaradi."""
    from apps.projects.models import Project

    project = get_object_or_404(
        Project.objects.select_related("workspace", "manager", "created_by"), pk=project_id
    )
    access = check_access(user, project, need)
    return project, access


def check_access(user, project, need="view"):
    access = ProjectAccess(user, project)
    allowed = {
        "view": access.can_view,
        "manage": access.can_manage,
        "task": access.can_create_task,
        "review": access.can_review,
        "work": access.can_work,
    }[need]
    if not allowed:
        raise PermissionDenied("Bu amal uchun ruxsatingiz yoq.")
    return access
