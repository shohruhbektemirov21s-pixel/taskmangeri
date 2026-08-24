"""Ma'lumot yaxlitligi: yarim bajarilgan amal qolmasin.

Loyiha yaratish oltita yozuv yasaydi va ular tranzaksiyasiz edi - o'rtada
uzilsa menejersiz loyiha qolib ketardi, ya'ni uni hech kim boshqara olmasdi.
"""

from datetime import timedelta
from unittest import mock

from django.db import transaction
from django.utils import timezone

from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskStatus

from .base import ApiTestCase


class ProjectCreationTest(ApiTestCase):

    def create(self):
        return self.api.post("/api/projects/", {
            "workspace": self.workspace.id,
            "name": "Yangi loyiha",
            "description": "tavsif",
        }, format="json")

    def test_yaratilgan_loyihada_menejer_bor(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content[:300])

        project = Project.objects.get(name="Yangi loyiha")
        self.assertTrue(project.has_active_manager)
        self.assertTrue(ProjectMember.objects.filter(
            project=project, role=ProjectRole.MANAGER, is_active=True).exists())

    def test_ortada_uzilsa_hech_narsa_qolmaydi(self):
        """Tarix yozuvida xato bo'lsa - loyiha ham yaratilmaydi."""
        before = Project.objects.count()

        with mock.patch("apps.projects.api.log", side_effect=RuntimeError("uzildi")):
            with self.assertRaises(RuntimeError):
                self.create()

        # Tranzaksiya bo'lmaganda bu yerda menejersiz loyiha qolib ketardi.
        self.assertEqual(Project.objects.count(), before)

    def test_kalit_avtomatik_va_takrorlanmaydi(self):
        self.assertEqual(self.create().status_code, 201)
        second = self.api.post("/api/projects/", {
            "workspace": self.workspace.id, "name": "Yangi loyiha",
        }, format="json")
        self.assertEqual(second.status_code, 201)

        keys = list(Project.objects.filter(workspace=self.workspace)
                    .values_list("key", flat=True))
        self.assertEqual(len(keys), len(set(keys)))


class TaskNumberTest(ApiTestCase):
    """Vazifa raqami qulf ostida olinadi - takrorlanmasligi kerak."""

    def test_raqam_qulf_bilan_olinadi(self):
        with transaction.atomic():
            t1 = Task.objects.create(project=self.project, title="Bir",
                                     created_by=self.manager)
            t2 = Task.objects.create(project=self.project, title="Ikki",
                                     created_by=self.manager)
        self.assertNotEqual(t1.number, t2.number)
        self.assertEqual({t1.number, t2.number}, {1, 2})

    def test_ochirilgan_vazifadan_keyin_ham_takrorlanmaydi(self):
        t1 = Task.objects.create(project=self.project, title="Bir", created_by=self.manager)
        t2 = Task.objects.create(project=self.project, title="Ikki", created_by=self.manager)
        t2.delete()
        t3 = Task.objects.create(project=self.project, title="Uch", created_by=self.manager)
        self.assertNotEqual(t3.number, t1.number)

    def test_qulf_backend_qollasa_ishlatiladi(self):
        """Qulf SHARTLI: SQLite uni bilmaydi, Db2 esa biladi.

        `next_task_number` `SELECT ... FOR UPDATE` bilan loyiha qatorini
        band qiladi - ikki kishi bir vaqtda vazifa yaratsa raqam
        takrorlanmasin. SQLite da Django `NotSupportedError` beradi,
        shuning uchun u yerda qulf o'tkazib yuboriladi (bitta jarayon,
        bitta ulanish - qulf shart ham emas).

        Test ikkala tomonni ham qulflaydi: qo'llaydigan bazada qulf
        HAQIQATAN qo'yiladi, qo'llamaydiganida esa kod yiqilmaydi.
        """
        from django.db import connection

        with transaction.atomic():
            if connection.features.has_select_for_update:
                # Db2: qulf so'rovi bajarilishi va xato bermasligi kerak.
                with connection.execute_wrapper(self._collect_sql):
                    self._seen = []
                    Task.objects.create(project=self.project, title="Qulfli",
                                        created_by=self.manager)
                joined = " ".join(self._seen).upper()
                # SINTAKSIS BAZAGA QARAB O'ZGARADI. Db2 `FOR UPDATE` emas,
                # `WITH RS USE AND KEEP UPDATE LOCKS` yozadi - ma'nosi
                # o'sha: qator o'qilib, tranzaksiya oxirigacha band
                # qilinadi. Test shu sabab ikkala shaklni ham qabul
                # qiladi va u tekshiradigan narsa - qulf QO'YILGANI.
                self.assertTrue(
                    "FOR UPDATE" in joined or "KEEP UPDATE LOCKS" in joined,
                    "qulf so'rovi yuborilmadi: " + joined[:400])
            else:
                # SQLite: qulfsiz ham ishlashi kerak.
                task = Task.objects.create(project=self.project, title="Qulfsiz",
                                           created_by=self.manager)
                self.assertGreater(task.number, 0)

    def _collect_sql(self, execute, sql, params, many, context):
        self._seen.append(sql)
        return execute(sql, params, many, context)


class CompletedAtInvariantTest(ApiTestCase):
    """«Bajarildi» degan vazifa yakunlangan vaqtsiz saqlanmaydi.

    Panel «Bajarilganlar» ni holatga emas, `completed_at` ga qarab sanaydi
    (`panel_metric_q`): "qachon bajarilgani" bilinmasa ishni yil, oy yoki
    hafta kesimiga qo'yib bo'lmaydi. Ilova orqali yopilganda vaqtni
    `apply_status()` qo'yadi, lekin import, admin paneli va to'g'ridan-to'g'ri
    ORM shu yo'ldan o'tmaydi - o'shanda 29 ta yopilgan ish panelda «0» bo'lib
    turardi. Shuning uchun qoida modelning o'zida.
    """

    def test_done_holatida_yaratilgan_vazifada_vaqt_boladi(self):
        task = Task.objects.create(project=self.project, title="Import qilingan ish",
                                   status=TaskStatus.DONE, created_by=self.manager)
        self.assertIsNotNone(task.completed_at)

    def test_holat_ormdan_ozgartirilsa_ham_vaqt_qoyiladi(self):
        task = Task.objects.create(project=self.project, title="Ish",
                                   created_by=self.manager)
        self.assertIsNone(task.completed_at)
        task.status = TaskStatus.DONE
        task.save(update_fields=["status"])
        task.refresh_from_db()
        # `update_fields` da `completed_at` yo'q edi - model uni o'zi
        # qo'shmasa o'zgarish jimgina yo'qolardi.
        self.assertIsNotNone(task.completed_at)

    def test_mavjud_vaqt_qayta_yozilmaydi(self):
        moment = timezone.now() - timedelta(days=30)
        task = Task.objects.create(project=self.project, title="Eski ish",
                                   status=TaskStatus.DONE, created_by=self.manager)
        Task.all_objects.filter(pk=task.pk).update(completed_at=moment)
        task.refresh_from_db()
        task.title = "Eski ish (tahrirlangan)"
        task.save(update_fields=["title"])
        task.refresh_from_db()
        self.assertEqual(task.completed_at, moment)


class ByteLengthTest(ApiTestCase):
    """Db2 da `CharField` BAYT bilan o'lchanadi, belgi bilan emas.

    O'zbekcha matnda «ʻ», «—» va «…» ikki-uch bayt egallaydi. Ilgari
    audit jurnali matnni BELGI bo'yicha kesardi (`summary[:300]`), ya'ni
    uzun o'zbekcha sarlavha ustunga sig'masdi va `SQL0302N` bilan
    yiqilardi. `log()` esa istisnoni yutadi - yozuv jimgina yo'qolardi.
    """

    # Har bir belgi IKKI bayt. 400 ta belgini BELGI bo'yicha kessak
    # (`[:300]`) 600 bayt qoladi, ya'ni `VARCHAR(300)` ga sig'maydi va
    # yozuv `SQL0302N` beradi. BAYT bo'yicha kesilganda esa 300 baytda
    # to'xtaydi. Uzunlik shu sabab ataylab shuncha: qisqasi ikkala yo'lda
    # ham sig'ib ketardi va test hech narsani isbotlamasdi.
    LONG = "ʻ" * 400

    def test_uzun_sarlavha_tarixga_tushadi(self):
        from apps.activity.models import Activity
        from apps.activity.services import log

        row = log(actor=self.manager, verb="task.created", project=self.project,
                  summary=self.LONG, target=self.project)
        self.assertIsNotNone(row, "uzun sarlavha tarixga yozilmadi")
        self.assertTrue(Activity.objects.filter(pk=row.pk).exists())

    def test_kesish_bayt_boyicha(self):
        from apps.core.text import byte_len, clip

        self.assertLessEqual(byte_len(clip(self.LONG, 300)), 300)
        # Chala bayt qolmasin - matn qayta o'qilishi kerak.
        clip(self.LONG, 301).encode("utf-8").decode("utf-8")

    def test_uzun_bildirishnoma_ham_yoziladi(self):
        from apps.notifications.models import NotificationKind
        from apps.notifications.services import notify

        row = notify(self.dev, NotificationKind.TASK_ASSIGNED,
                     title=self.LONG, body=self.LONG, actor=self.manager)
        self.assertIsNotNone(row, "uzun bildirishnoma yozilmadi")


class CleanupTest(ApiTestCase):
    """Saqlash muddati: eskisi ketadi, keragi qoladi.

    Ilgari hech narsa hech qachon o'chmasdi - `Activity` har maydon
    o'zgarishiga bittadan qator yozadi va jadval cheksiz o'sardi.
    """

    def run_cleanup(self, **kw):
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("cleanup_old_data", stdout=out, **kw)
        return out.getvalue()

    def test_eski_tarix_ochadi_yangisi_qoladi(self):
        from apps.activity.models import Activity
        from apps.activity.services import log

        old = log(actor=self.manager, verb="task.created", project=self.project,
                  summary="Eski yozuv")
        new = log(actor=self.manager, verb="task.created", project=self.project,
                  summary="Yangi yozuv")
        Activity.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=400))

        self.run_cleanup(activity_days=365, yes=True)

        self.assertFalse(Activity.objects.filter(pk=old.pk).exists())
        self.assertTrue(Activity.objects.filter(pk=new.pk).exists())

    def test_oqilmagan_bildirishnoma_tegilmaydi(self):
        """Odam uni hali ko'rmagan - eskiligi sabab bo'lolmaydi."""
        from apps.notifications.models import Notification, NotificationKind
        from apps.notifications.services import notify

        unread = notify(self.dev, NotificationKind.TASK_ASSIGNED,
                        title="O'qilmagan", actor=self.manager)
        read = notify(self.dev, NotificationKind.TASK_ASSIGNED,
                      title="O'qilgan", actor=self.manager)
        Notification.objects.filter(pk=read.pk).update(is_read=True)
        Notification.objects.filter(pk__in=[unread.pk, read.pk]).update(
            created_at=timezone.now() - timedelta(days=200))

        self.run_cleanup(notify_days=90, yes=True)

        self.assertTrue(Notification.objects.filter(pk=unread.pk).exists())
        self.assertFalse(Notification.objects.filter(pk=read.pk).exists())

    def test_yumshoq_ochirilgan_vazifa_muddatdan_keyin_ketadi(self):
        from apps.tasks.models import Task

        task = Task.objects.create(project=self.project, title="O'chirilgan ish",
                                   created_by=self.manager)
        task.soft_delete(self.manager)
        Task.all_objects.filter(pk=task.pk).update(
            deleted_at=timezone.now() - timedelta(days=200))

        self.run_cleanup(deleted_days=180, yes=True)
        self.assertFalse(Task.all_objects.filter(pk=task.pk).exists())

    def test_tasdiqsiz_hech_narsa_ochmaydi(self):
        from apps.activity.models import Activity
        from apps.activity.services import log

        row = log(actor=self.manager, verb="task.created", project=self.project,
                  summary="Eski yozuv")
        Activity.objects.filter(pk=row.pk).update(
            created_at=timezone.now() - timedelta(days=400))

        self.run_cleanup(activity_days=365)          # `yes` yo'q
        self.assertTrue(Activity.objects.filter(pk=row.pk).exists())

        self.run_cleanup(activity_days=365, dry_run=True)
        self.assertTrue(Activity.objects.filter(pk=row.pk).exists())
