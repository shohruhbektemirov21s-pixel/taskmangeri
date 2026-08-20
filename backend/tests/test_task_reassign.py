"""Vazifani boshqa odamga o'tkazish (`POST /api/tasks/<id>/reassign/`).

NEGA ALOHIDA AMAL. Ijrochini vazifa formasidan ham almashtirsa bo'ladi, lekin
u yerda butun topshiriq qaytadan ochiladi va ro'yxatdan belgi olib tashlanadi.
Odam kasal bo'lib qolganda yoki ish boshqasiga oshganda menejerga bitta amal
kerak: kimga va nega. Shu bilan birga ikkala tomon ham xabar oladi - eski
ijrochi eski topshiriq ustida ishlab yurmasin.

Qoida serverda: ijrochining o'zi ishni boshqaga o'tkaza olmaydi.
"""

from apps.activity.models import Activity
from apps.notifications.models import Notification, NotificationKind
from apps.projects.models import ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskAssignment, TaskStatus

from .base import ApiTestCase, make_user


class TaskReassignTest(ApiTestCase):

    def setUp(self):
        super().setUp()
        # Ikkinchi dasturchi - ish o'ziga o'tadigan odam.
        self.dev2 = make_user("dasturchi2@sinov.uz", "Dasturchi Vali")
        ProjectMember.objects.create(project=self.project, user=self.dev2,
                                     role=ProjectRole.DEVELOPER)
        self.task = Task.objects.create(project=self.project, title="O'tkaziladigan ish",
                                        status=TaskStatus.IN_PROGRESS, created_by=self.manager)
        TaskAssignment.objects.create(task=self.task, user=self.dev, assigned_by=self.manager)

    def reassign(self, client, user_id, note=""):
        return client.post("/api/tasks/%d/reassign/" % self.task.pk,
                           {"user_id": user_id, "note": note}, format="json")

    def active_ids(self):
        return set(self.task.assignments.filter(is_active=True).values_list("user_id", flat=True))

    # ------------------------------------------------------------ asosiy yo'l
    def test_menejer_ishni_boshqaga_otkazadi(self):
        response = self.reassign(self.api, self.dev2.pk, note="Ta'tilga chiqdi")
        self.assertEqual(response.status_code, 200, response.data)

        # Ish BITTA odamda qoladi - "o'tkazish" degani shu.
        self.assertEqual(self.active_ids(), {self.dev2.pk})
        # Eski yozuv o'chmaydi, faqat nofaol bo'ladi: kim qachon ishlagani qoladi.
        old = self.task.assignments.get(user=self.dev)
        self.assertFalse(old.is_active)
        self.assertIsNotNone(old.unassigned_at)

    def test_tarixda_bitta_yozuv_va_sabab_qoladi(self):
        self.reassign(self.api, self.dev2.pk, note="Ta'tilga chiqdi")
        rows = Activity.objects.filter(task=self.task, verb="task.reassigned")
        self.assertEqual(rows.count(), 1)
        row = rows.first()
        self.assertIn(self.dev2.full_name, row.summary)
        self.assertIn("Ta'tilga chiqdi", row.detail)
        self.assertIn(self.dev.full_name, row.detail)

    def test_ikkala_tomon_ham_xabar_oladi(self):
        self.reassign(self.api, self.dev2.pk)
        # Yangi ijrochi uchun bu - yangi ish.
        self.assertTrue(Notification.objects.filter(
            recipient=self.dev2, kind=NotificationKind.TASK_ASSIGNED).exists())
        # Eski ijrochi ish undan ketganini bilishi kerak.
        self.assertTrue(Notification.objects.filter(
            recipient=self.dev, kind=NotificationKind.TASK_REASSIGNED).exists())

    def test_ilgari_ishlagan_odamga_qaytarilsa_yangi_qator_ochilmaydi(self):
        self.reassign(self.api, self.dev2.pk)
        self.reassign(self.api, self.dev.pk)
        self.assertEqual(self.active_ids(), {self.dev.pk})
        # Bir odam bir vazifada ikki marta turmaydi.
        self.assertEqual(self.task.assignments.filter(user=self.dev).count(), 1)

    # ------------------------------------------------------------ qoidalar
    def test_ijrochi_ozi_otkaza_olmaydi(self):
        response = self.reassign(self.client_for(self.dev), self.dev2.pk)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.active_ids(), {self.dev.pk})

    def test_faqat_loyiha_azosiga(self):
        response = self.reassign(self.api, self.outsider.pk)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.active_ids(), {self.dev.pk})

    def test_ayni_odamga_otkazib_bolmaydi(self):
        response = self.reassign(self.api, self.dev.pk)
        self.assertEqual(response.status_code, 400)

    def test_yakunlangan_ish_otkazilmaydi(self):
        self.task.status = TaskStatus.DONE
        self.task.save(update_fields=["status"])
        response = self.reassign(self.api, self.dev2.pk)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.active_ids(), {self.dev.pk})
