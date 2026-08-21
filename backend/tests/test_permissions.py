"""Ruxsat qoidalari - auditda topilgan teshiklar uchun qulf.

Har bir test aynan bitta chetlab o'tish yo'lini yopadi. Ular auditgacha
mavjud emas edi: qoidalar `ProjectAccess` da yozilgan bo'lsa ham, ba'zi
endpointlar ularni chaqirmasdi va buni hech narsa ushlab qolmasdi.
"""

from apps.activity.models import Activity
from apps.projects.models import (JoinRequest, Project, ProjectMember, ProjectRole,
                                  RequestStatus)
from apps.tasks.models import Label, Task, TaskStatus
from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRole

from .base import ApiTestCase, make_user


class ProjectVisibilityTest(ApiTestCase):
    """`is_public` - "ish maydoni ichida ochiq", platforma bo'ylab emas."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.other_ws = Workspace.objects.create(name="Begona maydon", owner=cls.admin)
        cls.other_project = Project.objects.create(
            workspace=cls.other_ws, name="Begona loyiha", manager=cls.admin,
            created_by=cls.admin, is_public=True)
        ProjectMember.objects.create(project=cls.other_project, user=cls.admin,
                                     role=ProjectRole.MANAGER)
        cls.other_task = Task.objects.create(
            project=cls.other_project, title="Maxfiy ish", created_by=cls.admin,
            description="Ichki tafsilot")

    def test_boshqa_maydondagi_ochiq_loyiha_korinmaydi(self):
        c = self.client_for(self.outsider)
        self.assertEqual(c.get("/api/projects/{}/".format(self.other_project.pk)).status_code, 403)
        self.assertEqual(c.get("/api/tasks/{}/".format(self.other_task.pk)).status_code, 403)
        self.assertEqual(
            c.get("/api/projects/{}/files/".format(self.other_project.pk)).status_code, 403)

    def test_ochiq_loyiha_royxatlarda_ham_korinmaydi(self):
        c = self.client_for(self.outsider)
        ids = [t["id"] for t in c.get("/api/tasks/").data["results"]]
        self.assertNotIn(self.other_task.pk, ids)

        found = [p["id"] for p in c.get("/api/projects/", {"scope": "discover"}).data["results"]]
        self.assertNotIn(self.other_project.pk, found)

    def test_maydon_azosi_ochiq_loyihani_koradi(self):
        """Qoida qattiqlashdi, lekin maqsad saqlanadi: maydon ichida ochiq."""
        WorkspaceMember.objects.create(workspace=self.other_ws, user=self.outsider,
                                       role=WorkspaceRole.MEMBER)
        c = self.client_for(self.outsider)
        self.assertEqual(c.get("/api/projects/{}/".format(self.other_project.pk)).status_code, 200)
        self.assertEqual(c.get("/api/tasks/{}/".format(self.other_task.pk)).status_code, 200)

    def test_maydon_egasi_azolik_yozuvisiz_ham_koradi(self):
        ws = Workspace.objects.create(name="Egalik maydoni", owner=self.outsider)
        p = Project.objects.create(workspace=ws, name="Egasining loyihasi",
                                   manager=self.manager, created_by=self.manager,
                                   is_public=True)
        ProjectMember.objects.create(project=p, user=self.manager, role=ProjectRole.MANAGER)
        c = self.client_for(self.outsider)
        self.assertEqual(c.get("/api/projects/{}/".format(p.pk)).status_code, 200)

    def test_tizim_admini_hammasini_koradi(self):
        c = self.client_for(self.admin)
        self.assertEqual(c.get("/api/projects/{}/".format(self.project.pk)).status_code, 200)

    def test_ochiq_qidiruv_faqat_belgilanganini_korsatadi(self):
        """Bosh sahifadagi tokensiz qidiruv `is_listed` ga qaraydi.

        `is_public` - «ish maydoni ichida ochiq», ya'ni hamkasblar uchun.
        Uni platformadan tashqariga chiqarish bilan chalkashtirib bo'lmaydi:
        ilgari bitta bayroq ikkovini ham hal qilardi va standarti `True`
        edi - ya'ni har bir yangi loyiha tokensiz ko'rinib turardi.
        """
        self.assertTrue(self.other_project.is_public)
        self.assertFalse(self.other_project.is_listed)

        r = self.anon.get("/api/public/projects/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn(self.other_project.pk, [p["id"] for p in r.data["results"]])

        # Menejer ataylab belgilagach - ko'rinadi.
        self.other_project.is_listed = True
        self.other_project.save(update_fields=["is_listed"])
        r = self.anon.get("/api/public/projects/")
        self.assertIn(self.other_project.pk, [p["id"] for p in r.data["results"]])

    def test_ochiq_qidiruvdagi_loyihaning_ozi_ham_ochiladi(self):
        """Ro'yxatdan tushib qolgan loyiha ALOHIDA manzildan ham ochilmaydi."""
        self.assertEqual(
            self.anon.get("/api/public/projects/{}/".format(self.other_project.pk)).status_code,
            404)
        self.other_project.is_listed = True
        self.other_project.save(update_fields=["is_listed"])
        self.assertEqual(
            self.anon.get("/api/public/projects/{}/".format(self.other_project.pk)).status_code,
            200)


class LabelPermissionTest(ApiTestCase):
    """Teg loyihaga tegishli - ruxsati ham loyihadan."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.label = Label.objects.create(project=cls.project, name="xatolik")

    def test_chetdagi_odam_tegni_kormaydi_va_ozgartirmaydi(self):
        c = self.client_for(self.outsider)
        self.assertEqual(c.get("/api/labels/", {"project": self.project.pk}).data["count"], 0)
        self.assertEqual(
            c.patch("/api/labels/{}/".format(self.label.pk), {"name": "buzildi"},
                    format="json").status_code, 404)
        self.assertEqual(c.delete("/api/labels/{}/".format(self.label.pk)).status_code, 404)
        self.assertTrue(Label.objects.filter(pk=self.label.pk).exists())

    def test_dasturchi_koradi_lekin_ozgartirmaydi(self):
        c = self.client_for(self.dev)
        self.assertEqual(c.get("/api/labels/", {"project": self.project.pk}).data["count"], 1)
        self.assertEqual(c.delete("/api/labels/{}/".format(self.label.pk)).status_code, 403)

    def test_menejer_ozgartiradi(self):
        r = self.api.patch("/api/labels/{}/".format(self.label.pk), {"name": "muhim"},
                           format="json")
        self.assertEqual(r.status_code, 200)
        self.label.refresh_from_db()
        self.assertEqual(self.label.name, "muhim")

    def test_yaroqsiz_param_400(self):
        self.assertEqual(self.api.get("/api/labels/", {"project": "abc"}).status_code, 400)


class ManagerRoleProtectionTest(ApiTestCase):
    """MENEJER rolini faqat menejer beradi - qaysi yo'l bilan bo'lmasin."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.project_admin = make_user("padmin@sinov.uz", "Loyiha Admini")
        ProjectMember.objects.create(project=cls.project, user=cls.project_admin,
                                     role=ProjectRole.ADMIN)

    def pending_request(self):
        return JoinRequest.objects.create(
            project=self.project, user=self.outsider,
            desired_role=ProjectRole.DEVELOPER, status=RequestStatus.PENDING)

    def test_loyiha_admini_sorov_orqali_menejer_yasay_olmaydi(self):
        req = self.pending_request()
        c = self.client_for(self.project_admin)
        r = c.post("/api/projects/{}/requests/{}/decide/".format(self.project.pk, req.pk),
                   {"action": "approve", "role": ProjectRole.MANAGER}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertFalse(ProjectMember.objects.filter(
            project=self.project, user=self.outsider, role=ProjectRole.MANAGER).exists())

    def test_loyiha_admini_dasturchi_sifatida_qabul_qiladi(self):
        req = self.pending_request()
        c = self.client_for(self.project_admin)
        r = c.post("/api/projects/{}/requests/{}/decide/".format(self.project.pk, req.pk),
                   {"action": "approve"}, format="json")
        self.assertEqual(r.status_code, 200)
        m = ProjectMember.objects.get(project=self.project, user=self.outsider)
        self.assertEqual(m.role, ProjectRole.DEVELOPER)

    def test_menejer_menejer_roli_bilan_qabul_qiladi(self):
        req = self.pending_request()
        r = self.api.post(
            "/api/projects/{}/requests/{}/decide/".format(self.project.pk, req.pk),
            {"action": "approve", "role": ProjectRole.MANAGER}, format="json")
        self.assertEqual(r.status_code, 200)
        m = ProjectMember.objects.get(project=self.project, user=self.outsider)
        self.assertEqual(m.role, ProjectRole.MANAGER)

    def test_menejer_rolini_sorab_bolmaydi(self):
        WorkspaceMember.objects.create(workspace=self.workspace, user=self.outsider,
                                       role=WorkspaceRole.MEMBER)
        self.project.is_public = True
        self.project.save(update_fields=["is_public"])
        c = self.client_for(self.outsider)
        r = c.post("/api/projects/{}/join/".format(self.project.pk),
                   {"desired_role": ProjectRole.MANAGER}, format="json")
        self.assertEqual(r.status_code, 400)


class TaskStatusRuleTest(ApiTestCase):
    """"Bajarildi" - tekshiruvning natijasi, tahrirlash formasining maydoni emas."""

    def setUp(self):
        super().setUp()
        self.task = Task.objects.create(project=self.project, title="Sinov ishi",
                                        created_by=self.manager, status=TaskStatus.TODO)

    def test_patch_bilan_done_qoyilmaydi(self):
        r = self.api.patch("/api/tasks/{}/".format(self.task.pk), {"status": "DONE"},
                           format="json")
        self.assertEqual(r.status_code, 403)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.TODO)

    def test_status_endpointi_ham_done_qoyilmaydi(self):
        r = self.api.post("/api/tasks/{}/status/".format(self.task.pk), {"status": "DONE"},
                          format="json")
        self.assertEqual(r.status_code, 403)

    def test_yangi_vazifa_done_holatida_yaratilmaydi(self):
        r = self.api.post("/api/tasks/", {"project": self.project.pk, "title": "Tayyor ish",
                                          "status": "DONE"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_patch_bilan_ruxsat_etilgan_holat_tarixga_tushadi(self):
        r = self.api.patch("/api/tasks/{}/".format(self.task.pk),
                           {"status": TaskStatus.IN_PROGRESS}, format="json")
        self.assertEqual(r.status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.IN_PROGRESS)
        # `move_status` dan o'tgani uchun vaqt belgisi va tarix yozuvi bor.
        self.assertIsNotNone(self.task.started_at)
        self.assertTrue(Activity.objects.filter(task=self.task, verb="task.status").exists())

    def test_tekshiruv_done_qiladi_va_vaqtni_belgilaydi(self):
        self.task.apply_status(TaskStatus.IN_REVIEW)
        self.task.save()
        r = self.api.post("/api/tasks/{}/review/".format(self.task.pk),
                          {"verdict": "APPROVED"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.DONE)
        self.assertIsNotNone(self.task.completed_at)

    def test_bir_xil_holat_xato_bermaydi(self):
        r = self.api.post("/api/tasks/{}/status/".format(self.task.pk),
                          {"status": TaskStatus.TODO}, format="json")
        self.assertEqual(r.status_code, 200)


class AssigneeMembershipTest(ApiTestCase):
    """Vazifa faqat loyiha a'zosiga biriktiriladi."""

    def setUp(self):
        super().setUp()
        self.task = Task.objects.create(project=self.project, title="Biriktirish",
                                        created_by=self.manager)

    def test_chetdagi_odam_biriktirilmaydi(self):
        r = self.api.patch("/api/tasks/{}/".format(self.task.pk),
                           {"assignee_ids": [self.outsider.pk]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(self.task.assignments.filter(user=self.outsider).exists())
        self.assertEqual(r.data["skipped_assignees"], [self.outsider.pk])

    def test_azo_biriktiriladi(self):
        r = self.api.patch("/api/tasks/{}/".format(self.task.pk),
                           {"assignee_ids": [self.dev.pk]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(self.task.assignments.filter(user=self.dev, is_active=True).exists())
        self.assertEqual(r.data["skipped_assignees"], [])

    def test_yaratishda_ham_tekshiriladi(self):
        r = self.api.post("/api/tasks/", {"project": self.project.pk, "title": "Yangi",
                                          "assignee_ids": [self.outsider.pk, self.dev.pk]},
                          format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["skipped_assignees"], [self.outsider.pk])
        self.assertEqual([a["id"] for a in r.data["assignees"]], [self.dev.pk])


class SubtaskProjectTest(ApiTestCase):
    def test_ota_vazifa_boshqa_loyihadan_bolmaydi(self):
        other = Project.objects.create(workspace=self.workspace, name="Ikkinchi",
                                       manager=self.manager, created_by=self.manager)
        ProjectMember.objects.create(project=other, user=self.manager,
                                     role=ProjectRole.MANAGER)
        alien = Task.objects.create(project=other, title="Begona ota",
                                    created_by=self.manager)
        r = self.api.post("/api/tasks/", {"project": self.project.pk, "title": "Bola",
                                          "parent": alien.pk}, format="json")
        self.assertEqual(r.status_code, 400)


class ProjectVisibleScopeTest(ApiTestCase):
    """`scope=visible` — «Loyihalar» sahifasidagi yagona ro'yxat.

    Kesim tugmalari («Meniki», «Boshqaruvim», «Ochiq») olib tashlangandan
    keyin ro'yxat bitta bo'ldi. Savol shu: u odam OCHA OLADIGAN hamma
    loyihani ko'rsatadimi va bundan ortig'ini ko'rsatib qo'ymaydimi?
    """

    URL = "/api/projects/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # Menejer boshqaradi, lekin a'zolik yozuvi YO'Q - ilgari u bunday
        # loyihasini «Meniki» ro'yxatida topolmasdi.
        cls.unlisted = Project.objects.create(
            workspace=cls.workspace, name="A'zoliksiz loyiha",
            manager=cls.manager, created_by=cls.manager, is_public=False)

    def ids(self, user):
        r = self.client_for(user).get(self.URL, {"scope": "visible"})
        self.assertEqual(r.status_code, 200)
        return [p["id"] for p in r.data["results"]]

    def test_menejer_azoliksiz_loyihasini_ham_koradi(self):
        self.assertIn(self.unlisted.pk, self.ids(self.manager))

    def test_azo_oz_loyihasini_koradi(self):
        self.assertIn(self.project.pk, self.ids(self.dev))

    def test_chetdagi_odam_yopiq_loyihani_kormaydi(self):
        """Chegara kengaymasin: bitta ro'yxat - hamma narsa degani emas."""
        seen = self.ids(self.outsider)
        self.assertNotIn(self.project.pk, seen)
        self.assertNotIn(self.unlisted.pk, seen)

    def test_admin_hammasini_koradi(self):
        seen = self.ids(self.admin)
        self.assertIn(self.project.pk, seen)
        self.assertIn(self.unlisted.pk, seen)

    def test_maydondagi_ochiq_loyiha_azo_bolmasa_ham_korinadi(self):
        """«Ochiq» tugmasi yo'q - ochiq loyiha shu ro'yxatga qo'shiladi."""
        from apps.workspaces.models import WorkspaceMember, WorkspaceRole

        opened = Project.objects.create(
            workspace=self.workspace, name="Ochiq loyiha", manager=self.manager,
            created_by=self.manager, is_public=True)
        WorkspaceMember.objects.create(workspace=self.workspace, user=self.outsider,
                                       role=WorkspaceRole.MEMBER)
        self.assertIn(opened.pk, self.ids(self.outsider))


class ManagerUntouchableTest(ApiTestCase):
    """MENEJERGA hech kim tegmaydi - u loyihadan faqat o'zi chiqadi.

    Ilgari qoida yumshoqroq edi: menejerga BOSHQA MENEJER tega olardi.
    Amalda bu himoyani bekor qilardi - ikkinchi menejer tayinlangan zahoti
    u birinchisini chiqarib yubora olardi. Quyidagi testlar yangi chegarani
    hamma yo'ldan qulflab qo'yadi: a'zolar ro'yxati ham, loyiha formasidagi
    `manager_id` ham.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.project_admin = make_user("padmin2@sinov.uz", "Loyiha Admini")
        ProjectMember.objects.create(project=cls.project, user=cls.project_admin,
                                     role=ProjectRole.ADMIN)
        # Ikkinchi menejer - aynan shu holat ilgari himoyani teshib o'tardi.
        cls.other_manager = make_user("menejer2@sinov.uz", "Ikkinchi Menejer", role="MANAGER")
        ProjectMember.objects.create(project=cls.project, user=cls.other_manager,
                                     role=ProjectRole.MANAGER)

    def member_of(self, user):
        return ProjectMember.objects.get(project=self.project, user=user)

    def act(self, actor, member, **body):
        return self.client_for(actor).post(
            "/api/projects/{}/members/{}/".format(self.project.pk, member.pk),
            body, format="json")

    def test_menejer_boshqa_menejerni_chiqara_olmaydi(self):
        r = self.act(self.other_manager, self.member_of(self.manager), action="remove")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(self.member_of(self.manager).is_active)

    def test_menejer_boshqa_menejerning_rolini_ozgartira_olmaydi(self):
        r = self.act(self.other_manager, self.member_of(self.manager),
                     action="role", role=ProjectRole.DEVELOPER)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.member_of(self.manager).role, ProjectRole.MANAGER)

    def test_loyiha_admini_ham_tegmaydi(self):
        r = self.act(self.project_admin, self.member_of(self.manager), action="remove")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(self.member_of(self.manager).is_active)

    def test_tizim_admini_ham_tegmaydi(self):
        r = self.act(self.admin, self.member_of(self.manager), action="remove")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(self.member_of(self.manager).is_active)

    def test_menejer_ijrochini_oldingidek_chiqaradi(self):
        """Chegara faqat MENEJERGA - qolgan jamoa boshqaruvi joyida qoladi."""
        r = self.act(self.manager, self.member_of(self.dev), action="remove")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(self.member_of(self.dev).is_active)

    def test_menejer_ozi_chiqa_oladi(self):
        """Yagona yo'l: o'z qarori bilan."""
        r = self.client_for(self.manager).post(
            "/api/projects/{}/leave/".format(self.project.pk), {}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(self.member_of(self.manager).is_active)

    def test_loyiha_formasidan_menejerni_almashtirib_bolmaydi(self):
        """`manager_id` orqali chetlab o'tish yo'li ham yopiq."""
        r = self.client_for(self.project_admin).patch(
            "/api/projects/{}/".format(self.project.pk),
            {"manager_id": self.project_admin.pk}, format="json")
        self.assertEqual(r.status_code, 403)
        self.project.refresh_from_db()
        self.assertEqual(self.project.manager_id, self.manager.pk)

    def test_amaldagi_menejer_boshqaruvni_topshira_oladi(self):
        """Menejerlik o'z qarori bilan o'tadi - loyiha muzlab qolmasin."""
        r = self.client_for(self.manager).patch(
            "/api/projects/{}/".format(self.project.pk),
            {"manager_id": self.dev.pk}, format="json")
        self.assertEqual(r.status_code, 200)
        self.project.refresh_from_db()
        self.assertEqual(self.project.manager_id, self.dev.pk)
