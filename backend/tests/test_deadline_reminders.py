"""Muddat eslatmasi: kimga boradi va ichida nima yozilgan.

Ikki va'da qulflanadi:

  1. **Ijrochi faqat O'ZINING ishini ko'radi.** Xabar ichida boshqa
     odamning ismi ham, uning vazifasi ham bo'lmaydi.
  2. **Boshqaradigan odam KIM NIMA qilishi kerakligini ko'radi** -
     ism-familiya va vazifa kodi bilan.

Loyihada ochiq ishi yo'q a'zoga esa hech narsa ketmaydi.
"""

from datetime import timedelta

from django.utils import timezone

from apps.notifications.models import Notification, NotificationKind
from apps.projects.deadlines import STAGES, send_due_reminders
from apps.projects.models import ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskAssignment, TaskStatus

from .base import ApiTestCase, make_user


class DeadlineReminderTest(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.other = make_user("ikkinchi@sinov.uz", "Ikkinchi Dasturchi")
        ProjectMember.objects.create(project=cls.project, user=cls.other,
                                     role=ProjectRole.DEVELOPER)
        # Uchinchi a'zo - loyihada, lekin ochiq ishi yo'q.
        cls.idle = make_user("bosh@sinov.uz", "Ishsiz Azo")
        ProjectMember.objects.create(project=cls.project, user=cls.idle,
                                     role=ProjectRole.DEVELOPER)

    def setUp(self):
        super().setUp()
        # Muddat - eslatma yuboriladigan kunlardan biri.
        self.days = STAGES[-1]
        self.project.due_date = timezone.localdate() + timedelta(days=self.days)
        self.project.save(update_fields=["due_date"])

    def make_task(self, title, user, status=TaskStatus.TODO, number=None):
        task = Task.objects.create(
            project=self.project, title=title, status=status,
            created_by=self.manager, number=number or (Task.objects.count() + 1))
        TaskAssignment.objects.create(task=task, user=user, assigned_by=self.manager)
        return task

    def inbox(self, user):
        return list(Notification.objects.filter(
            recipient=user, kind=NotificationKind.PROJECT_DEADLINE))

    def test_ijrochi_faqat_ozining_vazifasini_koradi(self):
        self.make_task("Hisobotni yigish", self.dev)
        self.make_task("Bazani kochirish", self.other)

        send_due_reminders()

        mine = self.inbox(self.dev)
        self.assertEqual(len(mine), 1)
        body = mine[0].body
        self.assertIn("Hisobotni yigish", body)
        # Begona ish ham, begona ism ham chiqmaydi.
        self.assertNotIn("Bazani kochirish", body)
        self.assertNotIn(self.other.full_name, body)
        self.assertNotIn(self.dev.full_name, body)

    def test_boshqaruvchi_kim_nima_qilishini_koradi(self):
        self.make_task("Hisobotni yigish", self.dev)
        self.make_task("Bazani kochirish", self.other)

        send_due_reminders()

        boss = self.inbox(self.manager)
        self.assertEqual(len(boss), 1)
        body = boss[0].body
        for user, title in ((self.dev, "Hisobotni yigish"),
                            (self.other, "Bazani kochirish")):
            self.assertIn(user.full_name, body)
            self.assertIn(title, body)
        # Vazifa kodi ham bo'lsin - menejer qaysi ish ekanini topa olsin.
        self.assertIn(self.project.key, body)

    def test_ochiq_ishi_yoq_azoga_xabar_ketmaydi(self):
        self.make_task("Hisobotni yigish", self.dev)
        send_due_reminders()
        self.assertEqual(self.inbox(self.idle), [])

    def test_tekshiruvdagi_ish_bajarilishi_kerak_deb_yozilmaydi(self):
        """`IN_REVIEW` - navbat qabul qiladigan odamda, ijrochida emas."""
        self.make_task("Topshirilgan ish", self.dev, status=TaskStatus.IN_REVIEW)
        send_due_reminders()

        self.assertEqual(self.inbox(self.dev), [])
        boss = self.inbox(self.manager)
        self.assertEqual(len(boss), 1)
        self.assertNotIn("Topshirilgan ish", boss[0].body)

    def test_bajarilgan_ish_sanalmaydi(self):
        self.make_task("Tugagan ish", self.dev, status=TaskStatus.DONE)
        self.make_task("Qolgan ish", self.other)
        send_due_reminders()

        self.assertEqual(self.inbox(self.dev), [])
        self.assertIn("Qolgan ish", self.inbox(self.other)[0].body)

    def test_ikki_marta_yuborilmaydi(self):
        self.make_task("Hisobotni yigish", self.dev)
        first_projects, first_messages = send_due_reminders()
        second_projects, second_messages = send_due_reminders()

        self.assertEqual((first_projects, second_projects), (1, 0))
        self.assertGreater(first_messages, 0)
        self.assertEqual(second_messages, 0)
        self.assertEqual(len(self.inbox(self.dev)), 1)

    def test_uzun_royxat_qisqaradi(self):
        """`Notification.body` - 400 BAYT (Db2 da ustun shu bilan o'lchanadi).

        Sarlavhalar ataylab ko'p baytli belgilar bilan: o'zbekcha ismda
        «ʻ» ikki bayt, «…» uch bayt. Belgi bo'yicha o'lchansa matn 400
        belgidan oshmasa ham 400 BAYTdan oshib ketardi va Db2 yozuvni
        `SQL0302N` bilan rad etardi - bildirishnoma umuman yozilmasdi.
        """
        long_name = make_user("uzun@sinov.uz", "Toʻxtamurodov Boburmirzo Baxtiyorxoʻja oʻgʻli")
        ProjectMember.objects.create(project=self.project, user=long_name,
                                     role=ProjectRole.DEVELOPER)
        for i in range(40):
            self.make_task("Oʻzgartirishlarni koʻrib chiqish - qism {}".format(i), long_name)
        send_due_reminders()

        boss = self.inbox(self.manager)[0]
        self.assertLessEqual(len(boss.body.encode("utf-8")), 400)
        self.assertIn("va yana", boss.body)

        mine = self.inbox(long_name)[0]
        self.assertLessEqual(len(mine.body.encode("utf-8")), 400)

    def test_havolalar_oz_sahifasiga_olib_boradi(self):
        self.make_task("Hisobotni yigish", self.dev)
        send_due_reminders()

        self.assertEqual(self.inbox(self.dev)[0].url, "/mening-ishim")
        self.assertEqual(self.inbox(self.manager)[0].url, "/vazifalar")

    def test_quruq_yugurish_hech_narsa_yozmaydi(self):
        self.make_task("Hisobotni yigish", self.dev)
        projects, messages = send_due_reminders(dry_run=True)

        self.assertEqual(projects, 1)
        self.assertGreater(messages, 0)
        self.assertEqual(Notification.objects.filter(
            kind=NotificationKind.PROJECT_DEADLINE).count(), 0)
