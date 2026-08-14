"""Xatolik javoblari va ruxsatlar.

Yaroqsiz identifikator 500 emas, 404 berishi kerak edi: `/api/tasks/abc/`
`ValueError: Field 'id' expected a number` bilan yiqilardi.
"""

from apps.tasks.models import Task

from .base import ApiTestCase


class BadIdentifierTest(ApiTestCase):
    """Manzildagi identifikator raqam bo'lmasa - oddiy "topilmadi"."""

    URLS = [
        "/api/tasks/abc/",
        "/api/projects/abc/",
        "/api/users/abc/",
        "/api/workspaces/abc/",
        "/api/public/projects/abc/",
        "/api/activity/developer-report/?project=abc&user=1",
    ]

    def test_yaroqsiz_id_404_beradi(self):
        for url in self.URLS:
            with self.subTest(url=url):
                r = self.api.get(url)
                self.assertEqual(r.status_code, 404, "%s -> %s" % (url, r.status_code))

    def test_mavjud_bolmagan_raqam_ham_404(self):
        self.assertEqual(self.api.get("/api/projects/999999/").status_code, 404)
        self.assertEqual(self.api.get("/api/tasks/999999/").status_code, 404)


class AuthRequiredTest(ApiTestCase):
    """Tokensiz faqat ochiq endpointlar ochiladi."""

    PRIVATE = ["/api/dashboard/", "/api/projects/", "/api/tasks/", "/api/activity/",
               "/api/users/", "/api/my-work/", "/api/notifications/", "/api/meta/",
               "/api/workspaces/"]
    PUBLIC = ["/api/public/projects/", "/api/public/stats/", "/api/health/"]

    def test_tokensiz_401(self):
        for url in self.PRIVATE:
            with self.subTest(url=url):
                self.assertEqual(self.anon.get(url).status_code, 401)

    def test_ochiq_endpointlar_ochiq(self):
        for url in self.PUBLIC:
            with self.subTest(url=url):
                self.assertEqual(self.anon.get(url).status_code, 200)


class PrivateProjectTest(ApiTestCase):
    """Yopiq loyihani a'zo bo'lmagan odam ko'rmaydi."""

    def test_chetdagi_odam_yopiq_loyihani_kormaydi(self):
        c = self.client_for(self.outsider)
        self.assertEqual(c.get("/api/projects/%d/" % self.project.id).status_code, 403)

    def test_azo_koradi(self):
        c = self.client_for(self.dev)
        self.assertEqual(c.get("/api/projects/%d/" % self.project.id).status_code, 200)

    def test_tizim_admini_koradi(self):
        c = self.client_for(self.admin)
        self.assertEqual(c.get("/api/projects/%d/" % self.project.id).status_code, 200)


class ExperienceLimitTest(ApiTestCase):
    """Tajriba 0-30 oralig'ida - forma ham, API ham bir xil chegarada."""

    def test_30_dan_ortiq_qabul_qilinmaydi(self):
        r = self.api.patch("/api/auth/me/", {"years_experience": 45}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("years_experience", r.json())

    def test_30_qabul_qilinadi(self):
        r = self.api.patch("/api/auth/me/", {"years_experience": 30}, format="json")
        self.assertEqual(r.status_code, 200)
        self.manager.refresh_from_db()
        self.assertEqual(self.manager.years_experience, 30)

    def test_manfiy_son_qabul_qilinmaydi(self):
        r = self.api.patch("/api/auth/me/", {"years_experience": -1}, format="json")
        self.assertEqual(r.status_code, 400)


class AdminScopeTest(ApiTestCase):
    """Tizim admini `scope=all` bilan hamma loyihani ko'radi."""

    def test_admin_hammasini_koradi(self):
        c = self.client_for(self.admin)
        r = c.get("/api/projects/?scope=all")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["count"], 1)

    def test_oddiy_foydalanuvchiga_scope_all_ish_bermaydi(self):
        # Admin bo'lmagan odam uchun `all` "mine" kabi ishlaydi: a'zolik bo'yicha.
        c = self.client_for(self.outsider)
        r = c.get("/api/projects/?scope=all")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["count"], 0)

    def test_admin_azo_bolmasa_ham_mine_bosh(self):
        c = self.client_for(self.admin)
        self.assertEqual(c.get("/api/projects/").json()["count"], 0)


class TaskCodeTest(ApiTestCase):
    """Vazifa raqami loyiha ichida takrorlanmaydi."""

    def test_ketma_ket_raqamlanadi(self):
        codes = []
        for i in range(3):
            r = self.api.post("/api/tasks/", {
                "project": self.project.id, "title": "Vazifa %d" % i,
                "task_type": "FEATURE", "priority": 2, "status": "TODO",
            }, format="json")
            self.assertEqual(r.status_code, 201, r.content[:200])
            codes.append(r.json()["code"])

        self.assertEqual(len(set(codes)), 3)
        self.assertEqual([t.number for t in Task.objects.order_by("number")], [1, 2, 3])
