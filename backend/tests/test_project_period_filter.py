"""«Loyihalar» ro'yxatining muddat kesimi - bugun / shu hafta / shu oy / shu yil.

Davr KALENDAR bo'yicha va hisob `core.api.due_date_span` da - vazifalar
ro'yxati bilan bitta manbadan. Ya'ni «shu hafta» ikkala sahifada ham
dushanbadan yakshanbagacha bo'ladi, «oxirgi 7 kun» emas.

Alohida e'tibor: `Project.due_date` - `DateField`, `Task.due_date` esa
`DateTimeField`. Chegara matematikasi bitta joyda, ustun turiga moslash esa
ikkita o'ramda (`_due_range` va `due_date_span`) - shuning uchun quyida
ikkovi ham tekshiriladi.
"""

from datetime import timedelta

from django.utils import timezone

from apps.projects.models import Project, ProjectMember, ProjectRole

from .base import ApiTestCase


class ProjectPeriodFilterTest(ApiTestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        today = timezone.localdate()
        cls.today = today

        def project(name, due):
            p = Project.objects.create(workspace=cls.workspace, name=name,
                                       manager=cls.manager, created_by=cls.manager,
                                       due_date=due)
            ProjectMember.objects.create(project=p, user=cls.manager,
                                         role=ProjectRole.MANAGER)
            return p

        cls.p_today = project("Bugungi loyiha", today)
        # Shu haftaning boshqa kuni: dushanbadan sanaymiz, «bugun» ga tushmasin.
        monday = today - timedelta(days=today.weekday())
        other_week_day = monday if monday != today else monday + timedelta(days=1)
        cls.p_week = project("Haftalik loyiha", other_week_day)
        # Shu yil, lekin boshqa oy - «shu oy» ga tushmasligi kerak.
        cls.p_year = project("Yillik loyiha",
                             today.replace(month=1 if today.month != 1 else 12, day=15))
        cls.p_none = project("Muddatsiz loyiha", None)
        # Kelasi yil - hech qaysi kesimga tushmaydi.
        cls.p_next = project("Kelasi yil", today.replace(year=today.year + 1, month=6, day=1))

    def names(self, **params):
        r = self.client_for(self.manager).get("/api/projects/",
                                              {"scope": "visible", "page_size": 100, **params})
        self.assertEqual(r.status_code, 200)
        return sorted(p["name"] for p in r.data["results"])

    def test_filtrsiz_hammasi_korinadi(self):
        got = self.names()
        for name in ["Bugungi loyiha", "Haftalik loyiha", "Yillik loyiha",
                     "Muddatsiz loyiha", "Kelasi yil"]:
            self.assertIn(name, got)

    def test_bugun(self):
        self.assertEqual(self.names(period="today"), ["Bugungi loyiha"])

    def test_shu_hafta_kalendar_boyicha(self):
        """Dushanbadan yakshanbagacha - «oxirgi 7 kun» emas."""
        self.assertEqual(self.names(period="week"),
                         ["Bugungi loyiha", "Haftalik loyiha"])

    def test_shu_oy(self):
        got = self.names(period="month")
        self.assertIn("Bugungi loyiha", got)
        self.assertNotIn("Yillik loyiha", got)

    def test_shu_yil(self):
        got = self.names(period="year")
        self.assertIn("Yillik loyiha", got)
        self.assertNotIn("Kelasi yil", got)

    def test_muddatsiz_loyiha_kesimga_tushmaydi(self):
        """`due_date` bo'sh bo'lsa solishtiruv NULL beradi - qoida shu."""
        for period in ("today", "week", "month", "year"):
            self.assertNotIn("Muddatsiz loyiha", self.names(period=period))

    def test_aniq_sana(self):
        self.assertEqual(self.names(due=self.today.isoformat()), ["Bugungi loyiha"])

    def test_aniq_sana_davrdan_ustun(self):
        """Ikkovi birga kelsa aniq sana ishlaydi - u aniqroq so'rov."""
        self.assertEqual(self.names(due=self.today.isoformat(), period="year"),
                         ["Bugungi loyiha"])

    def test_yaroqsiz_davr_400(self):
        r = self.client_for(self.manager).get("/api/projects/", {"period": "haftalik"})
        self.assertEqual(r.status_code, 400)

    def test_yaroqsiz_sana_400(self):
        r = self.client_for(self.manager).get("/api/projects/", {"due": "kecha"})
        self.assertEqual(r.status_code, 400)

    def test_filtr_qamrovni_kengaytirmaydi(self):
        """Muddat kesimi ko'rish chegarasidan o'tmaydi."""
        r = self.client_for(self.outsider).get("/api/projects/",
                                               {"scope": "visible", "period": "year"})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("Bugungi loyiha", [p["name"] for p in r.data["results"]])
