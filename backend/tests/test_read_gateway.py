"""O'qish shlyuzi (`POST /api/read/`) — GET bilan bir xil natija bersin.

Shlyuz ma'lumotni manzildan emas, so'rov tanasidan oladi va ichkarida
o'sha view ni chaqiradi. Shu sabab eng muhim savol bitta: u ruxsat
qoidalarini CHETLAB O'TMAYDIMI? Quyidagi testlar aynan shuni bog'laydi -
GET orqali ko'rinmagan narsa POST orqali ham ko'rinmasin.
"""

from apps.tasks.models import Task

from .base import ApiTestCase


class ReadGatewayTest(ApiTestCase):
    URL = "/api/read/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.task = Task.objects.create(project=cls.project, title="Shlyuz ishi",
                                       created_by=cls.manager)

    # ------------------------------------------------------------ natija
    def test_bitta_yozuv_get_bilan_bir_xil(self):
        got = self.api.get("/api/projects/%d/" % self.project.pk)
        via = self.api.post(self.URL, {"path": "/projects/%d/" % self.project.pk},
                            format="json")
        self.assertEqual(via.status_code, 200)
        self.assertEqual(via.data["id"], got.data["id"])
        self.assertEqual(via.data["name"], got.data["name"])

    def test_toliq_manzil_ham_qabul_qilinadi(self):
        """`/api/projects/1/` ham, `/projects/1/` ham ishlasin."""
        via = self.api.post(self.URL, {"path": "/api/projects/%d/" % self.project.pk},
                            format="json")
        self.assertEqual(via.status_code, 200)

    def test_royxat_va_filtr_tanadan_uzatiladi(self):
        via = self.api.post(self.URL, {"path": "/tasks/",
                                       "params": {"project": self.project.pk}},
                            format="json")
        self.assertEqual(via.status_code, 200)
        ids = [t["id"] for t in via.data["results"]]
        self.assertIn(self.task.pk, ids)

    def test_ichki_amal_ham_ochiladi(self):
        """`/projects/6/members/` kabi ichki manzillar ham o'tsin."""
        via = self.api.post(self.URL, {"path": "/projects/%d/members/" % self.project.pk},
                            format="json")
        self.assertEqual(via.status_code, 200)

    # ------------------------------------------------------------ ruxsat
    def test_kirmagan_odam_otmaydi(self):
        via = self.anon.post(self.URL, {"path": "/projects/"}, format="json")
        self.assertEqual(via.status_code, 401)

    def test_begona_loyiha_shlyuz_orqali_ham_korinmaydi(self):
        """Eng muhim test: shlyuz ruxsatni chetlab o'tmaydi."""
        c = self.client_for(self.outsider)
        direct = c.get("/api/projects/%d/" % self.project.pk).status_code
        via = c.post(self.URL, {"path": "/projects/%d/" % self.project.pk},
                     format="json").status_code
        self.assertEqual(via, direct)
        self.assertIn(via, (403, 404))

    def test_javob_soravchi_nomidan_keladi(self):
        """Ro'yxat SO'RAGAN odamniki bo'lsin, shlyuzniki emas."""
        c = self.client_for(self.outsider)
        via = c.post(self.URL, {"path": "/tasks/"}, format="json")
        self.assertEqual(via.status_code, 200)
        self.assertNotIn(self.task.pk, [t["id"] for t in via.data["results"]])

    # ------------------------------------------------------------ chegara
    def test_api_dan_tashqari_manzil_yetib_bormaydi(self):
        """`/api/` dan tashqaridagi hech narsa ochilmaydi.

        Yo'l `/api/` bilan boshlanmasa, uning oldiga `/api` qo'yiladi -
        frontend qisqa yozadi (`/projects/6/`), chunki `BASE` allaqachon
        `/api`. Natijada `/django-admin/` ham `/api/django-admin/` bo'ladi
        va hech qayerga ulanmaydi. Muhimi bitta: 200 QAYTMASIN.
        """
        for path in ("/django-admin/", "/media/x.png", "/api/health/../../etc"):
            with self.subTest(path=path):
                r = self.api.post(self.URL, {"path": path}, format="json")
                self.assertIn(r.status_code, (400, 404), path)

    def test_tashqi_manzil_rad_etiladi(self):
        """Boshqa saytga so'rov yuborishga urinish - 400."""
        for path in ("http://boshqa.uz/api/", "//boshqa.uz/api/"):
            with self.subTest(path=path):
                r = self.api.post(self.URL, {"path": path}, format="json")
                self.assertEqual(r.status_code, 400, path)

    def test_ozini_chaqira_olmaydi(self):
        r = self.api.post(self.URL, {"path": "/read/"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_bosh_yoki_notogri_yol(self):
        for body in ({}, {"path": ""}, {"path": 5}, {"path": "/api/../secret/"}):
            with self.subTest(body=body):
                self.assertEqual(self.api.post(self.URL, body, format="json").status_code, 400)

    def test_mavjud_bolmagan_manzil_404(self):
        r = self.api.post(self.URL, {"path": "/bunday-narsa-yoq/"}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_yaroqsiz_id_shlyuzda_ham_404(self):
        r = self.api.post(self.URL, {"path": "/projects/999999/"}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_yaroqsiz_param_shlyuzda_ham_400(self):
        r = self.api.post(self.URL, {"path": "/tasks/", "params": {"project": "abc"}},
                          format="json")
        self.assertEqual(r.status_code, 400)
