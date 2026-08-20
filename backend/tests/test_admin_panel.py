"""Admin panelidagi ikkita yangi amal: hisob ochish va parol tiklash.

Ikkovi ham FAQAT platforma adminiga ochiq. Testlar aynan shu chegarani
bog'laydi - menejer ham, dasturchi ham bu yerga kira olmasin.
"""
from django.contrib.auth import get_user_model

from .base import ApiTestCase

User = get_user_model()


class AdminCreateUserTest(ApiTestCase):
    URL = "/api/users/create/"

    def setUp(self):
        super().setUp()
        self.admin_api = self.client_for(self.admin)

    def body(self, **over):
        data = {"email": "Yangiodam", "full_name": "Yangi Odam",
                "password": "mustahkam-parol-12345"}
        data.update(over)
        return data

    def test_admin_hisob_ochadi(self):
        r = self.admin_api.post(self.URL, self.body(), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        user = User.objects.get(email="yangiodam")
        self.assertEqual(user.full_name, "Yangi Odam")
        self.assertTrue(user.check_password("mustahkam-parol-12345"))

    def test_login_familiya_korinishida_ham_boladi(self):
        """Login pochta bo'lishi shart emas - bo'limda familiya ishlatiladi."""
        r = self.admin_api.post(self.URL, self.body(email="Abdraxmanov"), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(User.objects.filter(email="abdraxmanov").exists())

    def test_band_login_rad_etiladi(self):
        self.admin_api.post(self.URL, self.body(), format="json")
        r = self.admin_api.post(self.URL, self.body(), format="json")
        self.assertEqual(r.status_code, 400)

    def test_registr_ahamiyatsiz_band_hisoblanadi(self):
        self.admin_api.post(self.URL, self.body(email="Abdraxmanov"), format="json")
        r = self.admin_api.post(self.URL, self.body(email="ABDRAXMANOV"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_qisqa_parol_otmaydi(self):
        """Parol siyosati admin uchun ham bir xil."""
        r = self.admin_api.post(self.URL, self.body(password="123"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_menejer_hisob_ocha_olmaydi(self):
        r = self.api.post(self.URL, self.body(), format="json")
        self.assertEqual(r.status_code, 403)
        self.assertFalse(User.objects.filter(email="yangiodam").exists())

    def test_dasturchi_ham_ocha_olmaydi(self):
        r = self.client_for(self.dev).post(self.URL, self.body(), format="json")
        self.assertEqual(r.status_code, 403)

    def test_kirmagan_odam_otmaydi(self):
        self.assertEqual(self.anon.post(self.URL, self.body(), format="json").status_code, 401)


class AdminSetPasswordTest(ApiTestCase):
    def url(self, user):
        return "/api/users/{}/set-password/".format(user.pk)

    def setUp(self):
        super().setUp()
        self.admin_api = self.client_for(self.admin)

    def test_admin_parolni_almashtiradi(self):
        r = self.admin_api.post(self.url(self.dev), {"password": "yangi-parol-12345"},
                                format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.dev.refresh_from_db()
        self.assertTrue(self.dev.check_password("yangi-parol-12345"))

    def test_bosh_hisobga_tegib_bolmaydi(self):
        """Superuser paroli faqat o'zi orqali almashadi."""
        boss = User.objects.create_superuser(email="bosh@sinov.uz", password="parol-12345",
                                             full_name="Bosh Hisob")
        r = self.admin_api.post(self.url(boss), {"password": "yangi-parol-12345"},
                                format="json")
        self.assertEqual(r.status_code, 400)
        boss.refresh_from_db()
        self.assertTrue(boss.check_password("parol-12345"))

    def test_qisqa_parol_rad_etiladi(self):
        r = self.admin_api.post(self.url(self.dev), {"password": "123"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.dev.refresh_from_db()
        self.assertFalse(self.dev.check_password("123"))

    def test_bosh_parol_rad_etiladi(self):
        r = self.admin_api.post(self.url(self.dev), {"password": "   "}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_menejer_boshqaning_parolini_almashtira_olmaydi(self):
        r = self.api.post(self.url(self.dev), {"password": "yangi-parol-12345"},
                          format="json")
        self.assertEqual(r.status_code, 403)
        self.dev.refresh_from_db()
        self.assertFalse(self.dev.check_password("yangi-parol-12345"))

    def test_yangi_parol_bilan_kirish_ishlaydi(self):
        """Eng muhimi: almashtirilgan parol haqiqatan ishlasin."""
        self.admin_api.post(self.url(self.dev), {"password": "yangi-parol-12345"},
                            format="json")
        r = self.anon.post("/api/auth/login/",
                           {"email": self.dev.email, "password": "yangi-parol-12345"},
                           format="json")
        self.assertEqual(r.status_code, 200)
