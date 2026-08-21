"""Tekshiruv navbati - kimga ochiladi va kimga umuman yo'q.

Navbat ishni QABUL QILADIGAN odam uchun: loyiha menejeri, loyiha admini va
platforma admini. Ijrochida u har doim bo'sh edi - ya'ni menyuda doim bo'sh
sahifaga olib boradigan yozuv turardi. Endi server ham rad etadi.

Yon paneldagi RAQAM (`/api/counts/`) ham shu ro'yxatdan hisoblanadi:
quyidagi testlar ikkovini bir vaqtda tekshiradi, chunki ilgari ular
turlicha sanardi va loyiha admini «0» ko'rib turib ro'yxatda ish topardi.
"""

from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskStatus

from .base import ApiTestCase, make_user


class ReviewQueueAccessTest(ApiTestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # Loyiha admini - global roli dasturchi, lekin loyihada admin.
        cls.project_admin = make_user("loyiha-admin@sinov.uz", "Loyiha Admini")
        ProjectMember.objects.create(project=cls.project, user=cls.project_admin,
                                     role=ProjectRole.ADMIN)

        cls.task = Task.objects.create(project=cls.project, title="Tekshiruvdagi ish",
                                       created_by=cls.manager,
                                       status=TaskStatus.IN_REVIEW)

    def queue(self, user):
        return self.client_for(user).get("/api/tasks/review-queue/")

    def counts(self, user):
        return self.client_for(user).get("/api/counts/").data

    def test_menejer_navbatni_koradi(self):
        r = self.queue(self.manager)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([t["title"] for t in r.data], ["Tekshiruvdagi ish"])
        self.assertEqual(self.counts(self.manager)["reviews"], 1)

    def test_loyiha_admini_ham_koradi(self):
        """Global roli dasturchi, lekin loyihada admin - navbat unga tegishli."""
        r = self.queue(self.project_admin)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([t["title"] for t in r.data], ["Tekshiruvdagi ish"])
        # Raqam ham ro'yxat bilan bir xil bo'lsin - ilgari bu yerda 0 chiqardi.
        self.assertEqual(self.counts(self.project_admin)["reviews"], 1)

    def test_platforma_admini_hammasini_koradi(self):
        r = self.queue(self.admin)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([t["title"] for t in r.data], ["Tekshiruvdagi ish"])
        self.assertEqual(self.counts(self.admin)["reviews"], 1)

    def test_ijrochiga_navbat_yopiq(self):
        self.assertEqual(self.queue(self.dev).status_code, 403)
        self.assertEqual(self.counts(self.dev)["reviews"], 0)

    def test_chetdagi_odamga_ham_yopiq(self):
        self.assertEqual(self.queue(self.outsider).status_code, 403)

    def test_ijrochiga_navbat_ochilmaydi(self):
        """Navbat - TEKSHIRUVCHILAR uchun, ijrochiga umuman ochilmaydi.

        Ilgari bu test «hali loyihasi yo'q menejer bo'sh ro'yxat oladi»
        ni tekshirardi. Endi bunday holat yo'q: global menejer har bir
        loyihani boshqaradi, ya'ni loyihasiz menejer degani qolmadi.
        Chegara esa o'z joyida - ijrochi navbatga kira olmaydi.
        """
        fresh = make_user("yangi-dasturchi@sinov.uz", "Yangi Dasturchi")
        self.assertEqual(self.queue(fresh).status_code, 403)

    def test_boshqa_menejerning_ishi_ham_navbatga_tushadi(self):
        """Global menejer har bir loyihada tekshiruvchi - navbat ham shunday.

        Ilgari begona loyihaning ishi navbatga tushmasdi. Endi tushadi:
        u o'sha loyihada ham `can_review`, ya'ni navbat bilan huquq bir
        joydan chiqadi. Ajralib qolsa odam ishni tasdiqlay olardi-yu,
        navbatida uni ko'rmasdi.
        """
        other_manager = make_user("boshqa@sinov.uz", "Boshqa Menejer", role="MANAGER")
        other = Project.objects.create(workspace=self.workspace, name="Begona loyiha",
                                       manager=other_manager, created_by=other_manager)
        Task.objects.create(project=other, title="Begona ish", created_by=other_manager,
                            status=TaskStatus.IN_REVIEW)
        r = self.queue(self.manager)
        self.assertEqual(sorted(t["title"] for t in r.data),
                         ["Begona ish", "Tekshiruvdagi ish"])
        self.assertEqual(self.counts(self.manager)["reviews"], 2)
