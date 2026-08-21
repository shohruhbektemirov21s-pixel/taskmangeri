"""«Mening ishim» doskasi — MUDDAT bo'yicha ustunlar (`?board=due`).

Doska ilgari HOLAT bo'yicha yig'ilardi va shu ko'rinish `pages/Projects.tsx`
ga ham kerak, shuning uchun eski shakl STANDART bo'lib qoladi: yangi
ustunlar faqat `?board=due` bilan keladi. Quyidagi testlar shu ikkovini
ajratib turadi.

Uchta qoida qulflanadi:

  * Ustunlar bir-birini INKOR QILMAYDI — bugungi ish «shu haftalik» da ham,
    «barchasi» da ham turadi. Bu Kanban emas, kesimlar to'plami.
  * Har ustun O'ZI sahifalanadi (15 tadan) va `count` ustundagi JAMI ishni
    aytadi — kelgan kartalar sonini emas.
  * Sudrash uchun kerakli ikki ma'lumot ham serverdan keladi: qaysi sana
    qo'yilishi (`due_target`) va kim qo'ya olishi (`managed_projects`).
    Ikkovi mijozda hisoblansa, muddat qoidasi ikki joyda yashardi.
"""
from datetime import timedelta

from django.utils import timezone

from apps.tasks.models import Task, TaskAssignment, TaskStatus

from .base import ApiTestCase


def end_of_day(day):
    return timezone.make_aware(timezone.datetime.combine(day, timezone.datetime.min.time())) \
        + timedelta(hours=23, minutes=59)


class MyWorkDueBoardTest(ApiTestCase):
    """Dasturchida turli muddatli ishlar bor."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        today = timezone.localdate()
        monday = today - timedelta(days=today.weekday())

        cls.today_task = cls.assign("Bugungi ish", end_of_day(today))
        # Hafta ichida, lekin bugun emas: dushanba yoki (bugun dushanba
        # bo'lsa) yakshanba - ikkovi ham shu haftaning ichida qoladi.
        other_day = monday if today != monday else monday + timedelta(days=6)
        cls.week_task = cls.assign("Shu haftalik ish", end_of_day(other_day))
        # Muddati YO'Q ish - hech qanday kesimga tushmaydi, faqat «barchasi».
        cls.loose_task = cls.assign("Muddatsiz ish", None)
        cls.done_task = cls.assign("Bitgan ish", None, status=TaskStatus.DONE)

    @classmethod
    def assign(cls, title, due, status=TaskStatus.TODO):
        task = Task.objects.create(project=cls.project, title=title, due_date=due,
                                   status=status, created_by=cls.manager)
        TaskAssignment.objects.create(task=task, user=cls.dev, assigned_by=cls.manager)
        return task

    def board(self, user=None):
        data = self.client_for(user or self.dev).get("/api/my-work/", {"board": "due"}).data
        return {g["status"]: g for g in data["groups"]}, data

    # ------------------------------------------------------------ ustunlar

    def test_standart_javob_holat_boyicha_qoladi(self):
        """`board` berilmasa eski shakl - «Vazifalarim» ro'yxati shunga tayanadi."""
        data = self.client_for(self.dev).get("/api/my-work/").data
        keys = {g["status"] for g in data["groups"]}
        self.assertIn(TaskStatus.TODO, keys)
        self.assertNotIn("ALL", keys)

    def test_tortta_ustun_hamisha_qaytadi(self):
        """Bo'sh ustun ham qoladi: doskaning shakli kundan kunga o'zgarmasin."""
        cols, _ = self.board()
        self.assertEqual(list(cols), ["ALL", "WEEK", "TODAY", "DONE"])

    def test_bugungi_ish_uchala_kesimda_ham_turadi(self):
        """Ustunlar bir-birini inkor qilmaydi - doska torayib boradi."""
        cols, _ = self.board()
        for key in ("ALL", "WEEK", "TODAY"):
            ids = [t["id"] for t in cols[key]["tasks"]]
            self.assertIn(self.today_task.id, ids, key)

    def test_haftalik_ish_bugunga_tushmaydi(self):
        cols, _ = self.board()
        self.assertIn(self.week_task.id, [t["id"] for t in cols["WEEK"]["tasks"]])
        self.assertNotIn(self.week_task.id, [t["id"] for t in cols["TODAY"]["tasks"]])

    def test_muddatsiz_ish_faqat_barchasida(self):
        """`due_span` chegarasiga NULL tushmaydi - qoida shu yerda qulflanadi."""
        cols, _ = self.board()
        self.assertIn(self.loose_task.id, [t["id"] for t in cols["ALL"]["tasks"]])
        self.assertNotIn(self.loose_task.id, [t["id"] for t in cols["WEEK"]["tasks"]])
        self.assertNotIn(self.loose_task.id, [t["id"] for t in cols["TODAY"]["tasks"]])

    def test_bajarilgan_ish_barchasida_turmaydi(self):
        """«Barchasi» - OCHIQ ishlar; bitgani o'z ustunida."""
        cols, _ = self.board()
        self.assertIn(self.done_task.id, [t["id"] for t in cols["DONE"]["tasks"]])
        self.assertNotIn(self.done_task.id, [t["id"] for t in cols["ALL"]["tasks"]])

    # ---------------------------------------------------------- sahifalash

    def test_ustun_15_tadan_kesiladi_va_sanoq_jami_qoladi(self):
        """Kesish SERVERDA: 16-ish jimgina yo'qolmaydi, ikkinchi sahifada turadi."""
        for n in range(20):
            self.assign("Ko'p ish {}".format(n), None)

        cols, _ = self.board()
        first = cols["ALL"]
        self.assertEqual(len(first["tasks"]), 15)
        # Sarlavhadagi son - JAMI, ekrandagi kartalar soni emas.
        # 20 ta yangi + bugungi + haftalik + muddatsiz; bitgani sanalmaydi.
        self.assertEqual(first["count"], 23)
        self.assertEqual(first["pages"], 2)

        second = self.client_for(self.dev).get(
            "/api/my-work/", {"board": "due", "page_all": 2}).data["groups"][0]
        self.assertEqual(second["page"], 2)
        # Ikki sahifada bir xil ish ikki marta chiqmasin.
        overlap = {t["id"] for t in first["tasks"]} & {t["id"] for t in second["tasks"]}
        self.assertFalse(overlap)

    def test_chegaradan_chiqqan_sahifa_oxirgisiga_qisiladi(self):
        """Ro'yxat qisqarsa odam bo'sh ustunda qolib ketmasin."""
        cols, _ = self.board()
        far = self.client_for(self.dev).get(
            "/api/my-work/", {"board": "due", "page_all": 99}).data["groups"][0]
        self.assertEqual(far["page"], cols["ALL"]["pages"])

    def test_yaroqsiz_sahifa_400_beradi(self):
        r = self.client_for(self.dev).get("/api/my-work/", {"board": "due", "page_all": "abc"})
        self.assertEqual(r.status_code, 400)

    # ------------------------------------------------------------- sudrash

    def test_tashlash_sanasi_serverdan_keladi(self):
        """«Hafta oxiri» qaysi kun ekanini mijoz o'zi hisoblamaydi."""
        cols, _ = self.board()
        self.assertIsNone(cols["ALL"]["due_target"])
        self.assertIsNone(cols["DONE"]["due_target"])

        today = timezone.localdate()
        self.assertEqual(cols["TODAY"]["due_target"].date(), today)
        # Hafta oxiri - yakshanba, keyingi dushanba EMAS.
        self.assertEqual(cols["WEEK"]["due_target"].date(),
                         today - timedelta(days=today.weekday()) + timedelta(days=6))

    def test_dasturchi_boshqaradigan_loyiha_yoq(self):
        """Muddatni ijrochi qo'ymaydi - ustun unga ochilmaydi."""
        _, data = self.board(self.dev)
        self.assertEqual(data["managed_projects"], [])

    def test_menejerga_oz_loyihasi_qaytadi(self):
        TaskAssignment.objects.create(task=self.today_task, user=self.manager,
                                      assigned_by=self.manager)
        _, data = self.board(self.manager)
        self.assertEqual(data["managed_projects"], [self.project.id])

    def test_muddatni_faqat_boshqaruvchi_ozgartiradi(self):
        """Ro'yxat KO'RINISH uchun - haqiqiy qulf `/tasks/<id>/` da turadi."""
        cols, _ = self.board()
        target = cols["TODAY"]["due_target"]

        denied = self.client_for(self.dev).patch(
            "/api/tasks/{}/".format(self.week_task.id), {"due_date": target}, format="json")
        self.assertEqual(denied.status_code, 403)

        allowed = self.client_for(self.manager).patch(
            "/api/tasks/{}/".format(self.week_task.id), {"due_date": target}, format="json")
        self.assertEqual(allowed.status_code, 200)
