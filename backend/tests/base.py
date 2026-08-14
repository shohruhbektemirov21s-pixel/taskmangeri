"""Testlar uchun umumiy yordamchilar.

Har bir testda bir xil boshlang'ich holat yasab o'tirmaslik uchun: bitta ish
maydoni, bitta loyiha, menejer, dasturchi va tizim admini.
"""

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.workspaces.models import Workspace


def make_user(email, name="Sinov Foydalanuvchi", role="DEVELOPER", specialty="BACKEND", **kw):
    return User.objects.create_user(
        email=email, password="sinov-parol-12345", full_name=name,
        global_role=role, specialty=specialty, **kw)


class ApiTestCase(TestCase):
    """Autentifikatsiyalangan mijoz bilan ishlaydigan asos."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = make_user("admin@sinov.uz", "Tizim Admini", role="ADMIN")
        cls.manager = make_user("menejer@sinov.uz", "Loyiha Menejeri", role="MANAGER", specialty="PM")
        cls.dev = make_user("dasturchi@sinov.uz", "Dasturchi Ali")
        cls.outsider = make_user("chetdagi@sinov.uz", "Chetdagi Odam")

        cls.workspace = Workspace.objects.create(name="Sinov maydoni", owner=cls.manager)
        cls.project = Project.objects.create(
            workspace=cls.workspace, name="Sinov loyihasi", manager=cls.manager,
            created_by=cls.manager, is_public=False)
        ProjectMember.objects.create(project=cls.project, user=cls.manager,
                                     role=ProjectRole.MANAGER)
        ProjectMember.objects.create(project=cls.project, user=cls.dev,
                                     role=ProjectRole.DEVELOPER)

    def client_for(self, user):
        c = APIClient()
        if user is not None:
            c.credentials(HTTP_AUTHORIZATION="Bearer " + str(RefreshToken.for_user(user).access_token))
        return c

    def setUp(self):
        self.api = self.client_for(self.manager)
        self.anon = APIClient()
