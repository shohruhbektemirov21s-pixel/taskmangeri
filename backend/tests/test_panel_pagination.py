"""Panel ro'yxatining sahifalanishi - bittasida 15 ta qator.

Ilgari ro'yxat yuztada qirqilar va ostida «450 tadan 100 tasi ko'rsatildi»
degan yozuv turardi: qolganiga yetadigan yo'l yo'q edi. Endi sahifa raqami
so'raladi, sanoq esa kesishdan OLDIN olinadi - aks holda Django limitni
hisobga olib doim 15 dan oshmagan son qaytarardi va sahifalar soni ham
noto'g'ri chiqardi.
"""

from apps.tasks.models import Task, TaskAssignment, TaskStatus

from .base import ApiTestCase


class PanelPaginationTest(ApiTestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # 38 ta ish -> uchta sahifa (15 + 15 + 8).
        for i in range(38):
            task = Task.objects.create(project=cls.project, title="Ish {:02d}".format(i),
                                       created_by=cls.manager, status=TaskStatus.TODO)
            TaskAssignment.objects.create(task=task, user=cls.dev)

    def page(self, **params):
        r = self.client_for(self.dev).get(
            "/api/dashboard/tasks/", {"period": "year", "metric": "period", **params})
        self.assertEqual(r.status_code, 200)
        return r.data

    def test_birinchi_sahifada_15_ta(self):
        d = self.page()
        self.assertEqual(len(d["results"]), 15)
        self.assertEqual(d["page"], 1)
        self.assertEqual(d["page_size"], 15)

    def test_sanoq_va_sahifalar_soni_toliq(self):
        """Sanoq kesishdan oldin olinadi - 38 ta ish, 3 ta sahifa."""
        d = self.page()
        self.assertEqual(d["count"], 38)
        self.assertEqual(d["pages"], 3)

    def test_oxirgi_sahifada_qoldiq(self):
        d = self.page(page=3)
        self.assertEqual(len(d["results"]), 8)
        self.assertEqual(d["page"], 3)

    def test_sahifalar_bir_birini_takrorlamaydi(self):
        first = {t["id"] for t in self.page(page=1)["results"]}
        second = {t["id"] for t in self.page(page=2)["results"]}
        self.assertEqual(len(first & second), 0)
        self.assertEqual(len(first | second), 30)

    def test_chegaradan_chiqqan_sahifa_oxirgisini_beradi(self):
        """Filtr o'zgarganda sahifalar soni kamayib ketishi mumkin - odam
        bo'sh ekranga urilmasin."""
        d = self.page(page=99)
        self.assertEqual(d["page"], 3)
        self.assertEqual(len(d["results"]), 8)

    def test_nol_va_manfiy_sahifa_birinchisini_beradi(self):
        self.assertEqual(self.page(page=0)["page"], 1)
        self.assertEqual(self.page(page=-5)["page"], 1)

    def test_yaroqsiz_sahifa_400(self):
        r = self.client_for(self.dev).get(
            "/api/dashboard/tasks/", {"period": "year", "metric": "period", "page": "abc"})
        self.assertEqual(r.status_code, 400)

    def test_qidiruv_sahifalar_sonini_qayta_hisoblaydi(self):
        """Filtr ro'yxatni qisqartirsa sahifa ham bittaga tushadi."""
        d = self.page(search="Ish 07")
        self.assertEqual(d["count"], 1)
        self.assertEqual(d["pages"], 1)
