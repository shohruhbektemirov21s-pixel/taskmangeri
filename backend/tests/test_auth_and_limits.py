"""Sessiya, rol himoyasi va sanoqlar - auditda topilgan qolgan teshiklar.

`test_permissions.py` ruxsat qoidalarini qulflaydi; bu fayl esa sessiyani
(chiqish, parol almashtirish), platforma rollarini va ma'lumot chiqishini
tekshiradi.
"""

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.token_blacklist.models import (BlacklistedToken,
                                                             OutstandingToken)
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import GlobalRole
from apps.projects.models import JoinRequest, ProjectMember, ProjectRole, RequestStatus
from apps.tasks.models import Task, TaskStatus
from apps.workspaces.models import WorkspaceMember, WorkspaceRole

from .base import ApiTestCase, make_user

User = get_user_model()


class SessionTest(ApiTestCase):
    """Chiqish va parol almashtirish serverda ham kuchga kirsin."""

    def test_chiqish_refresh_tokenni_bekor_qiladi(self):
        refresh = RefreshToken.for_user(self.dev)
        c = self.client_for(self.dev)
        r = c.post("/api/auth/logout/", {"refresh": str(refresh)}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["revoked"], 1)

        # Bekor qilingan token bilan yangi access olinmaydi.
        r2 = self.anon.post("/api/auth/refresh/", {"refresh": str(refresh)}, format="json")
        self.assertEqual(r2.status_code, 401)

    def test_tokensiz_chiqish_ham_xato_bermaydi(self):
        c = self.client_for(self.dev)
        self.assertEqual(c.post("/api/auth/logout/", {}, format="json").status_code, 200)

    def test_hamma_qurilmadan_chiqish(self):
        RefreshToken.for_user(self.dev)
        RefreshToken.for_user(self.dev)
        c = self.client_for(self.dev)
        r = c.post("/api/auth/logout/", {"all": "1"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(r.data["revoked"], 2)
        live = (OutstandingToken.objects.filter(user=self.dev).count()
                - BlacklistedToken.objects.filter(token__user=self.dev).count())
        self.assertEqual(live, 0)

    def test_parol_almashsa_eski_sessiyalar_uziladi(self):
        old_refresh = RefreshToken.for_user(self.dev)
        c = self.client_for(self.dev)
        r = c.post("/api/auth/change-password/",
                   {"old_password": "sinov-parol-12345",
                    "new_password": "yangi-parol-98765"}, format="json")
        self.assertEqual(r.status_code, 200)

        # Eski refresh ishlamaydi, javobdagi yangisi ishlaydi.
        self.assertEqual(
            self.anon.post("/api/auth/refresh/", {"refresh": str(old_refresh)},
                           format="json").status_code, 401)
        self.assertEqual(
            self.anon.post("/api/auth/refresh/", {"refresh": r.data["refresh"]},
                           format="json").status_code, 200)

    def test_yangilangan_refresh_qayta_ishlatilmaydi(self):
        """`BLACKLIST_AFTER_ROTATION`: bir refresh token bir marta ishlatiladi."""
        refresh = str(RefreshToken.for_user(self.dev))
        first = self.anon.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(first.status_code, 200)
        again = self.anon.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(again.status_code, 401)


class PlatformRoleTest(ApiTestCase):
    """Platforma boshqaruvsiz qolmasin."""

    def test_bosh_hisobni_tushirib_bolmaydi(self):
        root = make_user("root@sinov.uz", "Bosh Hisob", role="ADMIN", is_superuser=True)
        c = self.client_for(self.admin)
        r = c.patch("/api/users/{}/role/".format(root.pk),
                    {"global_role": GlobalRole.DEVELOPER}, format="json")
        self.assertEqual(r.status_code, 400)
        root.refresh_from_db()
        self.assertTrue(root.is_platform_admin)

    def test_ozini_adminlikdan_tushira_olmaydi(self):
        other = make_user("admin2@sinov.uz", "Ikkinchi Admin", role="ADMIN")
        c = self.client_for(other)
        r = c.patch("/api/users/{}/role/".format(other.pk),
                    {"global_role": GlobalRole.DEVELOPER}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_oxirgi_adminni_tushirib_bolmaydi(self):
        c = self.client_for(self.admin)
        r = c.patch("/api/users/{}/role/".format(self.admin.pk),
                    {"is_active": False}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_boshqa_admin_bor_bolsa_tushiriladi(self):
        target = make_user("admin3@sinov.uz", "Uchinchi Admin", role="ADMIN")
        c = self.client_for(self.admin)
        r = c.patch("/api/users/{}/role/".format(target.pk),
                    {"global_role": GlobalRole.DEVELOPER}, format="json")
        self.assertEqual(r.status_code, 200)
        target.refresh_from_db()
        self.assertEqual(target.global_role, GlobalRole.DEVELOPER)

    def test_ish_maydoni_egaligi_rol_orqali_berilmaydi(self):
        WorkspaceMember.objects.create(workspace=self.workspace, user=self.manager,
                                       role=WorkspaceRole.OWNER)
        member = WorkspaceMember.objects.create(workspace=self.workspace, user=self.dev,
                                                role=WorkspaceRole.MEMBER)
        r = self.api.post("/api/workspaces/{}/members/".format(self.workspace.slug),
                          {"member_id": member.pk, "role": WorkspaceRole.OWNER},
                          format="json")
        self.assertEqual(r.status_code, 400)
        member.refresh_from_db()
        self.assertEqual(member.role, WorkspaceRole.MEMBER)

    def test_ish_maydoni_admin_roli_beriladi(self):
        WorkspaceMember.objects.create(workspace=self.workspace, user=self.manager,
                                       role=WorkspaceRole.OWNER)
        member = WorkspaceMember.objects.create(workspace=self.workspace, user=self.dev,
                                                role=WorkspaceRole.MEMBER)
        r = self.api.post("/api/workspaces/{}/members/".format(self.workspace.slug),
                          {"member_id": member.pk, "role": WorkspaceRole.ADMIN},
                          format="json")
        self.assertEqual(r.status_code, 200)


class UserListTest(ApiTestCase):
    """Odamlar ro'yxatidan shaxsiy kontakt chiqmaydi."""

    def test_royxatda_shaxsiy_maydonlar_yoq(self):
        self.dev.telegram = "@sinov"
        self.dev.bio = "Shaxsiy izoh"
        self.dev.save(update_fields=["telegram", "bio"])
        r = self.api.get("/api/users/")
        self.assertEqual(r.status_code, 200)
        row = next(u for u in r.data["results"] if u["id"] == self.dev.pk)
        self.assertNotIn("telegram", row)
        self.assertNotIn("bio", row)
        self.assertNotIn("skills", row)
        # Kartochka uchun keraklilari joyida.
        for field in ("email", "full_name", "global_role", "project_count", "open_tasks"):
            self.assertIn(field, row)

    def test_ochirilgan_hisob_royxatda_korinmaydi(self):
        self.dev.is_active = False
        self.dev.save(update_fields=["is_active"])
        ids = [u["id"] for u in self.api.get("/api/users/").data["results"]]
        self.assertNotIn(self.dev.pk, ids)

    def test_odam_sahifasida_toliq_malumot_bor(self):
        r = self.api.get("/api/users/{}/".format(self.dev.pk))
        self.assertEqual(r.status_code, 200)
        self.assertIn("telegram", r.data)


class DashboardCountTest(ApiTestCase):
    """Panel sanoqlari ko'rsatiladigan sahifa uzunligiga bog'lanmasin."""

    def test_tekshiruv_sanogi_ontadan_oshadi(self):
        for i in range(12):
            t = Task.objects.create(project=self.project, title="R{}".format(i),
                                    created_by=self.manager)
            t.apply_status(TaskStatus.IN_REVIEW)
            t.save()
        r = self.api.get("/api/dashboard/")
        self.assertEqual(r.data["stats"]["pending_reviews"], 12)
        # Ko'rsatiladigan ro'yxat esa oldingidek qisqa.
        self.assertEqual(len(r.data["review_queue"]), 10)

    def test_qoshilish_sorovi_sanogi(self):
        for i in range(11):
            u = make_user("s{}@sinov.uz".format(i), "Sorovchi {}".format(i))
            JoinRequest.objects.create(project=self.project, user=u,
                                       desired_role=ProjectRole.DEVELOPER,
                                       status=RequestStatus.PENDING)
        r = self.api.get("/api/dashboard/")
        self.assertEqual(r.data["stats"]["pending_joins"], 11)


class BulkTaskTest(ApiTestCase):
    def test_bulk_done_holatida_yaratmaydi(self):
        r = self.api.post("/api/tasks/bulk/", {"project": self.project.pk,
                                               "titles": ["Bir", "Ikki"],
                                               "status": "DONE"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_bulk_azo_bolmaganni_otkazib_yuboradi(self):
        r = self.api.post("/api/tasks/bulk/", {"project": self.project.pk,
                                               "titles": ["Bir"],
                                               "assignee_ids": [self.outsider.pk]},
                          format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["created"], 1)
        task = Task.objects.get(project=self.project, title="Bir")
        self.assertFalse(task.assignments.filter(user=self.outsider).exists())


class ChatParamTest(ApiTestCase):
    def test_yaroqsiz_id_400_beradi(self):
        for url in ("/api/chat/messages/?project=abc",
                    "/api/chat/messages/?direct=abc",
                    "/api/activity/?actor=abc",
                    "/api/activity/?task=abc"):
            self.assertEqual(self.api.get(url).status_code, 400, url)

    def test_yozishmalar_hamma_suhbatni_koradi(self):
        """Ro'yxat oxirgi N xabar bilan cheklanmaydi."""
        from apps.chat.models import ChatMessage

        partners = []
        for i in range(3):
            u = make_user("p{}@sinov.uz".format(i), "Hamroh {}".format(i))
            partners.append(u)
            ChatMessage.objects.create(author=self.manager, recipient=u,
                                       text="salom {}".format(i))
        # Bitta suhbatda ko'p xabar - qolganlari ro'yxatdan tushib qolmasin.
        for i in range(30):
            ChatMessage.objects.create(author=self.manager, recipient=partners[-1],
                                       text="ko'p yozdim {}".format(i))

        r = self.api.get("/api/chat/messages/conversations/")
        self.assertEqual(r.status_code, 200)
        seen = {row["partner"]["id"] for row in r.data}
        for u in partners:
            self.assertIn(u.pk, seen)
