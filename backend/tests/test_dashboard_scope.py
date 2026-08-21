"""Panel raqamlari KIMNIKI — rolga qarab qamrov.

Ilgari panel faqat odamning o'ziga biriktirilgan ishlarini sanardi. Menejer
loyihasida ikkita ochiq ish tursa ham panel «0» ko'rsatardi: u boshqaruvchi,
ijrochi emas. Quyidagi testlar qamrovni rolga bog'lab qo'yadi.
"""

from apps.tasks.models import Task, TaskAssignment

from .base import ApiTestCase


class DashboardScopeTest(ApiTestCase):
    """Bitta loyiha, bitta HECH KIMGA biriktirilmagan ish."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.loose = Task.objects.create(project=cls.project, title="Egasiz ish",
                                        created_by=cls.manager)

    def panel(self, user):
        return self.client_for(user).get("/api/dashboard/").data

    def year(self, data):
        return next(p for p in data["periods"] if p["key"] == "year")

    def test_menejer_biriktirilmagan_ishni_ham_koradi(self):
        """Asosiy tuzatish: menejer uchun panel «0» demasin.

        Qamrov `all`: global menejer endi har bir loyihada boshqaruvchi
        (`manages_all_projects`), demak paneli ham o'shancha. Ilgari
        `managed` edi - faqat o'zi menejer bo'lgan loyihalar.
        """
        d = self.panel(self.manager)
        self.assertEqual(d["scope"], "all")
        self.assertGreaterEqual(self.year(d)["todo"], 1)
        self.assertGreaterEqual(d["deadlines"]["waiting"], 1)

    def test_admin_butun_tizimni_koradi(self):
        d = self.panel(self.admin)
        self.assertEqual(d["scope"], "all")
        self.assertGreaterEqual(self.year(d)["todo"], 1)

    def test_dasturchi_faqat_ozinikini_koradi(self):
        """Qamrov kengaymasin: a'zo bo'lish - boshqarish degani emas."""
        d = self.panel(self.dev)
        self.assertEqual(d["scope"], "mine")
        self.assertEqual(self.year(d)["todo"], 0)
        self.assertEqual(d["deadlines"]["waiting"], 0)

    def test_dasturchiga_biriktirilsa_paydo_boladi(self):
        TaskAssignment.objects.create(task=self.loose, user=self.dev)
        d = self.panel(self.dev)
        self.assertEqual(d["scope"], "mine")
        self.assertEqual(self.year(d)["todo"], 1)

    def test_chetdagi_odam_hech_narsa_kormaydi(self):
        d = self.panel(self.outsider)
        self.assertEqual(d["scope"], "mine")
        self.assertEqual(self.year(d)["todo"], 0)

    def test_ochirilgan_loyiha_sanalmaydi(self):
        """Yo'q qilingan loyihaning ishi hech kimning panelida turmasin."""
        self.project.soft_delete(actor=self.manager)
        for user in (self.manager, self.admin):
            with self.subTest(user=user.email):
                d = self.panel(user)
                self.assertEqual(self.year(d)["todo"], 0)
                self.assertEqual(d["deadlines"]["waiting"], 0)
