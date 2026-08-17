"""Ma'lumot yaxlitligi: yarim bajarilgan amal qolmasin.

Loyiha yaratish oltita yozuv yasaydi va ular tranzaksiyasiz edi - o'rtada
uzilsa menejersiz loyiha qolib ketardi, ya'ni uni hech kim boshqara olmasdi.
"""

from unittest import mock

from django.db import transaction

from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task

from .base import ApiTestCase


class ProjectCreationTest(ApiTestCase):

    def create(self):
        return self.api.post("/api/projects/", {
            "workspace": self.workspace.id,
            "name": "Yangi loyiha",
            "description": "tavsif",
        }, format="json")

    def test_yaratilgan_loyihada_menejer_bor(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content[:300])

        project = Project.objects.get(name="Yangi loyiha")
        self.assertTrue(project.has_active_manager)
        self.assertTrue(ProjectMember.objects.filter(
            project=project, role=ProjectRole.MANAGER, is_active=True).exists())

    def test_ortada_uzilsa_hech_narsa_qolmaydi(self):
        """Tarix yozuvida xato bo'lsa - loyiha ham yaratilmaydi."""
        before = Project.objects.count()

        with mock.patch("apps.projects.api.log", side_effect=RuntimeError("uzildi")):
            with self.assertRaises(RuntimeError):
                self.create()

        # Tranzaksiya bo'lmaganda bu yerda menejersiz loyiha qolib ketardi.
        self.assertEqual(Project.objects.count(), before)

    def test_kalit_avtomatik_va_takrorlanmaydi(self):
        self.assertEqual(self.create().status_code, 201)
        second = self.api.post("/api/projects/", {
            "workspace": self.workspace.id, "name": "Yangi loyiha",
        }, format="json")
        self.assertEqual(second.status_code, 201)

        keys = list(Project.objects.filter(workspace=self.workspace)
                    .values_list("key", flat=True))
        self.assertEqual(len(keys), len(set(keys)))


class TaskNumberTest(ApiTestCase):
    """Vazifa raqami qulf ostida olinadi - takrorlanmasligi kerak."""

    def test_raqam_qulf_bilan_olinadi(self):
        with transaction.atomic():
            t1 = Task.objects.create(project=self.project, title="Bir",
                                     created_by=self.manager)
            t2 = Task.objects.create(project=self.project, title="Ikki",
                                     created_by=self.manager)
        self.assertNotEqual(t1.number, t2.number)
        self.assertEqual({t1.number, t2.number}, {1, 2})

    def test_ochirilgan_vazifadan_keyin_ham_takrorlanmaydi(self):
        t1 = Task.objects.create(project=self.project, title="Bir", created_by=self.manager)
        t2 = Task.objects.create(project=self.project, title="Ikki", created_by=self.manager)
        t2.delete()
        t3 = Task.objects.create(project=self.project, title="Uch", created_by=self.manager)
        self.assertNotEqual(t3.number, t1.number)
