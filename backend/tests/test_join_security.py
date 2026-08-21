"""Qo'shilish kodi va so'raladigan rol - loyihaga kirishning ikki eshigi.

Ikkovi birga ishlaganda ochiq eshik hosil bo'lardi:

  * `join_code` javobda SHARTSIZ turardi, ya'ni loyihani ko'ra oladigan
    har kim uni olardi;
  * `/join/` da to'g'ri kod bilan kelgan so'rov DARROV tasdiqlanadi va
    rolni so'rovchining o'zi tanlaydi - `ADMIN` esa to'silmagan edi.

Natijada loyihani ko'ra olgan odam bitta so'rov bilan o'zini LOYIHA ADMINI
qilib qo'ya olardi (sozlamalar, a'zolik, tekshiruv). Global menejer va
boshliq hamma loyihani ko'radigan bo'lgandan keyin bu tizimdagi har bir
loyihaga tegishli bo'ldi.

Quyidagi testlar ikkala eshikni ham qulflaydi: kod endi faqat
boshqaradigan odamga ko'rinadi, boshqaruv roli esa umuman so'ralmaydi.
"""

from apps.projects.models import (JoinRequest, Project, ProjectMember, ProjectRole,
                                  RequestStatus)
from apps.workspaces.models import Workspace, WorkspaceMember

from .base import ApiTestCase, make_user


def project_row(payload, pk):
    """Sahifalangan javobdan bitta loyihani topadi."""
    rows = payload["results"] if isinstance(payload, dict) else payload
    return next((row for row in rows if row["id"] == pk), None)


class JoinCodeVisibilityTest(ApiTestCase):
    """Kodni faqat loyihani BOSHQARADIGAN odam ko'radi."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # Ish maydonidagi hamkasb: ochiq loyihani ko'radi, lekin a'zo emas.
        cls.colleague = make_user("hamkasb@sinov.uz", "Hamkasb Odam")
        WorkspaceMember.objects.create(workspace=cls.workspace, user=cls.colleague)
        cls.open_project = Project.objects.create(
            workspace=cls.workspace, name="Ochiq loyiha", manager=cls.manager,
            created_by=cls.manager, is_public=True)
        ProjectMember.objects.create(project=cls.open_project, user=cls.manager,
                                     role=ProjectRole.MANAGER)

        # Global menejer: hamma loyihani KO'RADI, begonasini boshqarmaydi.
        cls.roaming = make_user("bosh_menejer@sinov.uz", "Yuruvchi Menejer",
                                role="MANAGER", specialty="PM")

    def test_menejer_oz_loyihasida_kodni_koradi(self):
        r = self.api.get("/api/projects/{}/".format(self.project.pk))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["join_code"], self.project.join_code)

    def test_azo_bolmagan_hamkasbga_kod_korinmaydi(self):
        api = self.client_for(self.colleague)
        r = api.get("/api/projects/{}/".format(self.open_project.pk))
        # Loyihani ochadi - u ish maydonida va loyiha ochiq.
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["access"]["can_view"])
        self.assertFalse(r.data["access"]["can_manage"])
        # Lekin kod yo'q: aks holda so'rovsiz a'zo bo'lib olardi.
        self.assertIsNone(r.data["join_code"])

    def test_global_menejer_kodni_oladi(self):
        """Global menejer endi har bir loyihani BOSHQARADI, demak kodni ham oladi.

        Ilgari bu teskari edi: u ko'rardi-yu boshqarmasdi, va kod javobda
        qolsa ko'rish huquqini bitta so'rov bilan boshqaruvga aylantira
        olardi. Endi bunday zina yo'q - u allaqachon boshqaruvchi, kod
        unga hech qanday yangi huquq bermaydi.

        Qoidaning O'ZI o'zgarmagan: kod `can_manage` bilan keladi
        (`ProjectSerializer.get_join_code`). O'zgargani - kim boshqaruvchi
        ekani.
        """
        api = self.client_for(self.roaming)
        r = api.get("/api/projects/{}/".format(self.project.pk))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["access"]["can_manage"])
        self.assertEqual(r.data["join_code"], self.project.join_code)

    def test_royxatda_ham_bir_xil_javob(self):
        """Bitta loyiha sahifasi bilan RO'YXAT bir xil javob berishi kerak."""
        api = self.client_for(self.roaming)
        r = api.get("/api/projects/", {"scope": "visible"})
        self.assertEqual(r.status_code, 200)
        row = project_row(r.data, self.project.pk)
        self.assertIsNotNone(row, "global menejer loyihani ro'yxatda ko'rishi kerak")
        self.assertEqual(row["join_code"], self.project.join_code)

    def test_dasturchi_oz_loyihasida_ham_kodni_olmaydi(self):
        """A'zolik yetarli emas - kod BOSHQARUV bilan keladi."""
        api = self.client_for(self.dev)
        r = api.get("/api/projects/{}/".format(self.project.pk))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["access"]["is_member"])
        self.assertIsNone(r.data["join_code"])


class JoinRoleTest(ApiTestCase):
    """So'rovda boshqaruv roli so'ralmaydi."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.open_project = Project.objects.create(
            workspace=cls.workspace, name="Kodli loyiha", manager=cls.manager,
            created_by=cls.manager, is_public=True)
        ProjectMember.objects.create(project=cls.open_project, user=cls.manager,
                                     role=ProjectRole.MANAGER)
        WorkspaceMember.objects.create(workspace=cls.workspace, user=cls.outsider)

    def url(self):
        return "/api/projects/{}/join/".format(self.open_project.pk)

    def test_admin_roli_sorab_bolmaydi(self):
        api = self.client_for(self.outsider)
        r = api.post(self.url(), {"desired_role": ProjectRole.ADMIN}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("desired_role", r.data)

    def test_menejer_roli_ham_sorab_bolmaydi(self):
        api = self.client_for(self.outsider)
        r = api.post(self.url(), {"desired_role": ProjectRole.MANAGER}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_kod_bilan_kelgan_odam_ham_admin_bola_olmaydi(self):
        """Eng qimmat holat: to'g'ri kod so'rovni DARROV tasdiqlaydi."""
        api = self.client_for(self.outsider)
        r = api.post(self.url(), {"code": self.open_project.join_code,
                                  "desired_role": ProjectRole.ADMIN}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(ProjectMember.objects.filter(
            project=self.open_project, user=self.outsider).exists())

    def test_kod_bilan_oddiy_rol_oldingidek_ishlaydi(self):
        api = self.client_for(self.outsider)
        r = api.post(self.url(), {"code": self.open_project.join_code,
                                  "desired_role": ProjectRole.DEVELOPER}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.data["joined"])
        member = ProjectMember.objects.get(project=self.open_project, user=self.outsider)
        self.assertEqual(member.role, ProjectRole.DEVELOPER)

    def test_kodsiz_sorov_navbatda_qoladi(self):
        api = self.client_for(self.outsider)
        r = api.post(self.url(), {"message": "Qo'shilmoqchiman"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertFalse(r.data["joined"])
        req = JoinRequest.objects.get(project=self.open_project, user=self.outsider)
        self.assertEqual(req.status, RequestStatus.PENDING)

    def test_loyiha_menejeri_rolsiz_qoshila_oladi(self):
        """Regressiya: PM ning standart roli `MANAGER` va u to'silgan edi.

        Ya'ni mutaxassisligi «Loyiha menejeri» bo'lgan odam rol
        ko'rsatmasdan so'rov yuborsa, forma jimgina 400 berardi - sababi
        esa uning O'ZI tanlamagan standart qiymatda edi.
        """
        pm = make_user("yangi_pm@sinov.uz", "Yangi PM", role="DEVELOPER", specialty="PM")
        WorkspaceMember.objects.create(workspace=self.workspace, user=pm)
        r = self.client_for(pm).post(self.url(), {}, format="json")
        self.assertEqual(r.status_code, 201)
        req = JoinRequest.objects.get(project=self.open_project, user=pm)
        self.assertEqual(req.desired_role, ProjectRole.DEVELOPER)


class WorkspaceJoinCodeTest(ApiTestCase):
    """Ish maydonining taklif kodi ham boshqaruv bilan keladi."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.roaming = make_user("yuruvchi@sinov.uz", "Yuruvchi Menejer",
                                role="MANAGER", specialty="PM")
        cls.closed_ws = Workspace.objects.create(
            name="Yopiq maydon", owner=cls.admin, is_open=False)

    def test_egasi_kodni_koradi(self):
        r = self.client_for(self.admin).get("/api/workspaces/{}/".format(self.closed_ws.slug))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["join_code"], self.closed_ws.join_code)

    def test_begona_menejerga_kod_korinmaydi(self):
        r = self.client_for(self.roaming).get(
            "/api/workspaces/{}/".format(self.closed_ws.slug))
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["can_manage"])
        self.assertIsNone(r.data["join_code"])
