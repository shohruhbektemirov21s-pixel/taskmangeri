"""Doskada «Bajarildi» ustuni - tekshiruvchi uchun tasdiqlash tugmasi.

Ilgari doskada ustun ko'rinib turar, lekin unga kartani tashlab bo'lmasdi:
menejer ham «Bajarildi» ni qo'lda qo'yib bo'lmaydi degan xato olardi va
tasdiqlash uchun boshqa sahifaga o'tishi kerak edi. Qoida esa o'z joyida
qoladi - ish topshirilmagan bo'lsa hech kim uni «bajarildi» qilib qo'ymaydi.
"""

from apps.activity.models import Activity
from apps.projects.models import ProjectMember, ProjectRole
from apps.tasks.models import Review, ReviewVerdict, Task, TaskAssignment, TaskStatus

from .base import ApiTestCase, make_user


class BoardApproveTest(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.task = Task.objects.create(project=self.project, title="Tekshiruvga tayyor",
                                        created_by=self.manager)
        TaskAssignment.objects.create(task=self.task, user=self.dev)

    def submit(self):
        """Ijrochi ishni topshiradi - vazifa tekshiruvga o'tadi."""
        self.task.apply_status(TaskStatus.IN_REVIEW)
        self.task.review_round = 1
        self.task.save()

    def move(self, client, status):
        return client.post("/api/tasks/{}/status/".format(self.task.pk),
                           {"status": status}, format="json")

    # ------------------------------------------------------------ ijobiy yo'l
    def test_menejer_doskadan_tasdiqlaydi(self):
        self.submit()
        r = self.move(self.api, TaskStatus.DONE)
        self.assertEqual(r.status_code, 200)

        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.DONE)
        # Tekshiruv formasi bilan bir xil iz: yozuv, vaqt, tarix.
        self.assertIsNotNone(self.task.completed_at)
        review = Review.objects.get(task=self.task)
        self.assertEqual(review.verdict, ReviewVerdict.APPROVED)
        self.assertEqual(review.reviewer, self.manager)
        self.assertTrue(Activity.objects.filter(task=self.task,
                                                verb="task.approved").exists())

    def test_loyiha_admini_ham_tasdiqlaydi(self):
        padmin = make_user("padmin@sinov.uz", "Loyiha Admini")
        ProjectMember.objects.create(project=self.project, user=padmin,
                                     role=ProjectRole.ADMIN)
        self.submit()
        r = self.move(self.client_for(padmin), TaskStatus.DONE)
        self.assertEqual(r.status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.DONE)

    def test_tizim_admini_ham_tasdiqlaydi(self):
        self.submit()
        r = self.move(self.client_for(self.admin), TaskStatus.DONE)
        self.assertEqual(r.status_code, 200)

    # ------------------------------------------------------------ qoida saqlanadi
    def test_topshirilmagan_ish_tasdiqlanmaydi(self):
        """Vazifa tekshiruvda emas - menejer ham uni bajarildi qilib qo'ymaydi."""
        r = self.move(self.api, TaskStatus.DONE)
        self.assertEqual(r.status_code, 403)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.TODO)
        self.assertFalse(Review.objects.filter(task=self.task).exists())

    def test_ijrochi_tasdiqlay_olmaydi(self):
        self.submit()
        r = self.move(self.client_for(self.dev), TaskStatus.DONE)
        self.assertEqual(r.status_code, 403)
        self.assertIn("tekshiruvda", r.data["detail"].lower())
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.IN_REVIEW)

    def test_chetdagi_odam_tegmaydi(self):
        self.submit()
        r = self.move(self.client_for(self.outsider), TaskStatus.DONE)
        self.assertEqual(r.status_code, 403)

    def test_xato_xabari_nima_qilishni_aytadi(self):
        """Ikki holat - ikki xil yo'l-yo'riq."""
        r = self.move(self.client_for(self.dev), TaskStatus.DONE)
        self.assertIn("menejer", r.data["detail"].lower())

        self.task.apply_status(TaskStatus.TODO)
        self.task.save()
        r2 = self.move(self.client_for(self.dev), TaskStatus.DONE)
        self.assertIn("topshiradi", r2.data["detail"].lower())

    # ------------------------------------------------------------ boshqa yo'llar buzilmadi
    def test_tekshiruv_formasi_oldingidek_ishlaydi(self):
        self.submit()
        r = self.api.post("/api/tasks/{}/review/".format(self.task.pk),
                          {"verdict": ReviewVerdict.APPROVED, "comment": "Yaxshi ish"},
                          format="json")
        self.assertEqual(r.status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.DONE)
        self.assertEqual(Review.objects.get(task=self.task).comment, "Yaxshi ish")

    def test_qaytarish_ham_ishlaydi(self):
        self.submit()
        r = self.api.post("/api/tasks/{}/review/".format(self.task.pk),
                          {"verdict": ReviewVerdict.CHANGES_REQUESTED,
                           "comment": "Testlar yo'q"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.CHANGES_REQUESTED)

    def test_doskadagi_boshqa_ustunlar_ishlayveradi(self):
        r = self.move(self.api, TaskStatus.IN_PROGRESS)
        self.assertEqual(r.status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.IN_PROGRESS)

    def test_ijrochi_ishni_jarayonga_va_tekshiruvga_suradi(self):
        c = self.client_for(self.dev)
        self.assertEqual(self.move(c, TaskStatus.IN_PROGRESS).status_code, 200)
        self.assertEqual(self.move(c, TaskStatus.IN_REVIEW).status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.IN_REVIEW)

    # ------------------------------------------- tekshiruvdan qaytarib olish

    def test_ijrochi_tekshiruvdan_qaytarib_oladi(self):
        """Adashib topshirgan ish tekshiruvchining navbatida osilib qolmasin."""
        self.submit()
        r = self.move(self.client_for(self.dev), TaskStatus.IN_PROGRESS)
        self.assertEqual(r.status_code, 200)

        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.IN_PROGRESS)

    def test_qaytarib_olingach_navbatdan_chiqadi(self):
        """Tekshiruvchining ro'yxati holatdan chiqadi - ikkovi ajralmasin."""
        self.submit()
        self.assertEqual(
            [t["id"] for t in self.api.get("/api/tasks/review-queue/").data],
            [self.task.pk])

        self.move(self.client_for(self.dev), TaskStatus.IN_PROGRESS)
        self.assertEqual(list(self.api.get("/api/tasks/review-queue/").data), [])

    def test_qaytarib_olinganda_tekshiruvchiga_xabar_boradi(self):
        """Navbatdagi ish g'oyib bo'lsa - sababi aytilsin."""
        from apps.notifications.models import Notification

        self.submit()
        before = Notification.objects.filter(recipient=self.manager).count()
        self.move(self.client_for(self.dev), TaskStatus.IN_PROGRESS)

        fresh = Notification.objects.filter(recipient=self.manager).order_by("-id").first()
        self.assertEqual(Notification.objects.filter(recipient=self.manager).count(),
                         before + 1)
        self.assertIn("qaytarib olindi", fresh.title.lower())

    def test_qaytarib_olish_yolni_oldinga_ochmaydi(self):
        """Ortga qaytish ochildi, «Bajarildi» esa avvalgidek yopiq."""
        self.submit()
        r = self.move(self.client_for(self.dev), TaskStatus.DONE)
        self.assertEqual(r.status_code, 403)

        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.IN_REVIEW)

    def test_chetdagi_odam_qaytarib_ololmaydi(self):
        self.submit()
        r = self.move(self.client_for(self.outsider), TaskStatus.IN_PROGRESS)
        self.assertEqual(r.status_code, 403)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, TaskStatus.IN_REVIEW)

    def test_doska_qaytarish_yolini_korsatadi(self):
        """Karta ostidagi menyu va sudrash shu ro'yxatdan chiqadi."""
        self.submit()
        r = self.client_for(self.dev).get("/api/tasks/board/", {"project": self.project.pk})
        card = next(t for c in r.data["columns"] for t in c["tasks"] if t["id"] == self.task.pk)
        self.assertEqual([m["value"] for m in card["allowed_transitions"]],
                         [TaskStatus.IN_PROGRESS])

    def test_doska_javobida_tekshirish_huquqi_bor(self):
        """Interfeys ustunni to'g'ri belgilashi uchun `access` kerak."""
        r = self.api.get("/api/tasks/board/", {"project": self.project.pk})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["access"]["can_review"])

        r2 = self.client_for(self.dev).get("/api/tasks/board/",
                                           {"project": self.project.pk})
        self.assertFalse(r2.data["access"]["can_review"])
