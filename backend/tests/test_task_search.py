"""Vazifa qidiruvi - BITTA qoida, hamma ro'yxatda bir xil.

Shart `core.queries.task_search_q` da: vazifa nomi, tavsifi, kodi va LOYIHA
nomi. Uni uchta ro'yxat ishlatadi - «Vazifalar» sahifasi (`/team/workload/`),
«Vazifalarim» (`/my-work/`) va panel katagi (`/dashboard/tasks/`).

Testlar aynan shu YAGONALIKNI qulflaydi: odam bir ro'yxatda loyiha nomi
bilan topgan ishini ikkinchisida ham topsin. Ilgari shart faqat vazifa nomi
va kodi bo'yicha edi va loyiha nomi yozilganda hamma ro'yxat bo'sh qaytardi.
"""

from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskAssignment, TaskStatus

from .base import ApiTestCase, make_user


class TaskSearchByProjectTest(ApiTestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.task = Task.objects.create(project=cls.project, title="Kirish oynasi",
                                       created_by=cls.manager, status=TaskStatus.IN_PROGRESS)
        TaskAssignment.objects.create(task=cls.task, user=cls.dev)

        # Ikkinchi loyiha - qidiruv qamrovni kengaytirmasligini ko'rsatadi.
        cls.second = Project.objects.create(workspace=cls.workspace, name="Arxiv tozalash",
                                            manager=cls.manager, created_by=cls.manager)
        ProjectMember.objects.create(project=cls.second, user=cls.manager,
                                     role=ProjectRole.MANAGER)
        ProjectMember.objects.create(project=cls.second, user=cls.dev,
                                     role=ProjectRole.DEVELOPER)
        cls.second_task = Task.objects.create(project=cls.second, title="Eski fayllar",
                                              created_by=cls.manager,
                                              status=TaskStatus.IN_PROGRESS)
        TaskAssignment.objects.create(task=cls.second_task, user=cls.dev)

    # ------------------------------------------------------------ my-work
    def my_work_titles(self, search):
        d = self.client_for(self.dev).get("/api/my-work/", {"search": search}).data
        return sorted(t["title"] for g in d["groups"] for t in g["tasks"])

    def test_my_work_loyiha_nomi_boyicha(self):
        self.assertEqual(self.my_work_titles("Sinov loyihasi"), ["Kirish oynasi"])

    def test_my_work_boshqa_loyiha_nomi_ozinikini_beradi(self):
        self.assertEqual(self.my_work_titles("Arxiv"), ["Eski fayllar"])

    def test_my_work_vazifa_nomi_oldingidek(self):
        """Yangi shart eskisini bosib qo'ymasin."""
        self.assertEqual(self.my_work_titles("Kirish"), ["Kirish oynasi"])

    def test_my_work_topilmagan_nom_bosh_royxat(self):
        self.assertEqual(self.my_work_titles("bunday loyiha yoq"), [])

    # ------------------------------------------------------- panel ro'yxati
    def panel_titles(self, search):
        d = self.client_for(self.manager).get(
            "/api/dashboard/tasks/", {"period": "year", "metric": "period",
                                      "search": search}).data
        return sorted(t["title"] for t in d["results"])

    def test_panel_royxati_ham_loyiha_nomini_biladi(self):
        """Qoida bitta joyda - panel katagi ham o'sha shartdan o'tadi."""
        self.assertEqual(self.panel_titles("Arxiv tozalash"), ["Eski fayllar"])

    # ---------------------------------------------------------- workload
    def workload_titles(self, search):
        d = self.client_for(self.manager).get(
            "/api/team/workload/", {"search": search}).data
        return sorted(t["title"] for row in d["developers"] for t in row["tasks"])

    def test_uchala_royxat_bir_xil_javob_beradi(self):
        """Yagonalikning o'zi: bitta so'z - uchta ro'yxatda bitta ish."""
        self.assertEqual(self.workload_titles("Arxiv tozalash"), ["Eski fayllar"])
        self.assertEqual(self.panel_titles("Arxiv tozalash"), ["Eski fayllar"])
        self.assertEqual(self.my_work_titles("Arxiv tozalash"), ["Eski fayllar"])
