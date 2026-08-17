"""Doskadagi «ko'chirish» ro'yxati va yon paneldagi yengil sanoq.

IKKI QO'SHIMCHA.

Doskada kartani sudrab ko'chirish faqat sichqoncha bilan ishlaydi: sensorli
ekran ham, klaviatura ham HTML5 `dragstart` ni tug'dirmaydi. Ya'ni telefondan
kirgan odam doskada hech narsani ko'chira olmasdi. Endi kartada tanlash
menyusi bor, ro'yxat esa SERVERDAN keladi - qoida frontendda takrorlanmasin.

Yon paneldagi uchta raqam uchun ilgari butun `/dashboard/` chaqirilardi va u
har sahifa almashganda takrorlanardi. Endi alohida yengil endpoint bor -
sanoqlari panelnikiga mos bo'lishi shart.
"""

from apps.projects.models import (JoinRequest, ProjectMember, ProjectRole,
                                  RequestStatus)
from apps.tasks.models import Task, TaskAssignment, TaskStatus

from .base import ApiTestCase, make_user


class BoardTransitionsTest(ApiTestCase):
    """Doskadagi har karta o'zi qayerga ko'chishi mumkinligini aytadi."""

    def setUp(self):
        super().setUp()
        self.task = Task.objects.create(project=self.project, title="Ko'chiriladigan vazifa",
                                        status=TaskStatus.TODO, created_by=self.manager)
        TaskAssignment.objects.create(task=self.task, user=self.dev)

    def board(self, client):
        r = client.get("/api/tasks/board/", {"project": self.project.pk})
        self.assertEqual(r.status_code, 200)
        return r.data

    def card(self, data, task_id):
        for column in data["columns"]:
            for task in column["tasks"]:
                if task["id"] == task_id:
                    return task
        self.fail("Vazifa doskada topilmadi")

    def test_dasturchi_uchun_royxat_qoidaga_mos(self):
        """Ijrochi TODO dan «Jarayonda» va «Toʻsilgan» ga o'tkaza oladi."""
        card = self.card(self.board(self.client_for(self.dev)), self.task.pk)
        values = [t["value"] for t in card["allowed_transitions"]]
        self.assertIn(TaskStatus.IN_PROGRESS, values)
        self.assertIn(TaskStatus.BLOCKED, values)
        # «Bajarildi» ni qo'lda qo'yib bo'lmaydi - u tekshiruvdan keyin qo'yiladi.
        self.assertNotIn(TaskStatus.DONE, values)

    def test_tekshiruvchida_royxat_kengroq(self):
        card = self.card(self.board(self.api), self.task.pk)
        values = [t["value"] for t in card["allowed_transitions"]]
        self.assertIn(TaskStatus.IN_REVIEW, values)
        # O'z holati ro'yxatda bo'lmaydi - o'z joyiga ko'chirishning ma'nosi yo'q.
        self.assertNotIn(TaskStatus.TODO, values)

    def test_royxatdagi_holat_haqiqatan_qabul_qilinadi(self):
        """Ro'yxat va serverning tekshiruvi bir joydan chiqadi.

        Agar ikkisi ajralib ketsa, odamga ko'rsatilgan variant bosilganda
        403 qaytardi - eng yoqimsiz xato turi.
        """
        dev = self.client_for(self.dev)
        card = self.card(self.board(dev), self.task.pk)
        for move in card["allowed_transitions"]:
            self.task.status = TaskStatus.TODO
            self.task.save()
            r = dev.post("/api/tasks/{}/status/".format(self.task.pk),
                         {"status": move["value"]}, format="json")
            self.assertEqual(r.status_code, 200, move["value"])

    def test_kuzatuvchiga_royxat_bosh(self):
        """Ishlash huquqi yo'q a'zoga ko'chirish menyusi umuman chiqmaydi.

        Kuzatuvchi doskani ko'radi, lekin kartani qimirlata olmaydi -
        frontend menyuni ko'rsatmasligi uchun ro'yxat bo'sh kelishi kerak.
        """
        viewer = make_user("kuzatuvchi@sinov.uz", "Kuzatuvchi Odam")
        ProjectMember.objects.create(project=self.project, user=viewer,
                                     role=ProjectRole.VIEWER)
        card = self.card(self.board(self.client_for(viewer)), self.task.pk)
        self.assertEqual(card["allowed_transitions"], [])

    def test_chetdagi_odam_doskani_umuman_kormaydi(self):
        """Yopiq loyihaning doskasi begonaga ochilmaydi."""
        r = self.client_for(self.outsider).get("/api/tasks/board/",
                                               {"project": self.project.pk})
        self.assertEqual(r.status_code, 403)


class SidebarCountsTest(ApiTestCase):
    """Yengil sanoq endpointi panel bilan bir xil raqam beradi."""

    def setUp(self):
        super().setUp()
        # Dasturchining ochiq ishlari
        for i, status in enumerate([TaskStatus.TODO, TaskStatus.IN_PROGRESS,
                                    TaskStatus.DONE]):
            task = Task.objects.create(project=self.project, title="Vazifa {}".format(i),
                                       status=status, created_by=self.manager)
            TaskAssignment.objects.create(task=task, user=self.dev)
        # Menejer tekshirishi kerak bo'lgan ish
        Task.objects.create(project=self.project, title="Tekshiruvda",
                            status=TaskStatus.IN_REVIEW, created_by=self.manager)
        # Kutayotgan qo'shilish so'rovi
        JoinRequest.objects.create(project=self.project, user=self.outsider,
                                   status=RequestStatus.PENDING)

    def test_dasturchi_ochiq_ishlarini_sanaydi(self):
        r = self.client_for(self.dev).get("/api/counts/")
        self.assertEqual(r.status_code, 200)
        # TODO + IN_PROGRESS = 2; DONE sanalmaydi.
        self.assertEqual(r.data["open"], 2)
        # Dasturchi hech nimani boshqarmaydi - navbatlar bo'sh.
        self.assertEqual(r.data["reviews"], 0)
        self.assertEqual(r.data["joins"], 0)

    def test_menejer_navbatlarini_koradi(self):
        r = self.api.get("/api/counts/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["reviews"], 1)
        self.assertEqual(r.data["joins"], 1)

    def test_panel_bilan_bir_xil_raqam(self):
        """Ikki endpoint ajralib ketmasin - yon panel va panel bir narsani aytsin."""
        counts = self.api.get("/api/counts/").data
        stats = self.api.get("/api/dashboard/").data["stats"]
        self.assertEqual(counts["open"], stats["open"])
        self.assertEqual(counts["reviews"], stats["pending_reviews"])
        self.assertEqual(counts["joins"], stats["pending_joins"])

    def test_kirmagan_odam_sanoqni_ololmaydi(self):
        self.assertEqual(self.anon.get("/api/counts/").status_code, 401)

    def test_chetdagi_odam_begona_navbatni_kormaydi(self):
        outsider = make_user("boshqa@sinov.uz", "Boshqa Odam")
        r = self.client_for(outsider).get("/api/counts/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, {"open": 0, "reviews": 0, "joins": 0})
