"""Panel raqamlarining HISOBI — qaysi ish qaysi katakka tushadi.

`test_dashboard_scope.py` qamrovni (kimning ishi sanaladi) tekshiradi,
bu yer esa sanoqning o'zini: davr chegarasi, muddat va yakunlangan sana
to'g'ri ishlatilyaptimi.

Sanalar ANIQ qo'yiladi (`created_at` ni `auto_now_add` dan keyin qayta
yozamiz), aks holda test bugungi kunga bog'lanib qolardi va oyning
birinchi kunida boshqacha natija berardi.
"""
from datetime import datetime, time as dtime

from django.utils import timezone

from apps.tasks.models import Task, TaskAssignment, TaskStatus

from .base import ApiTestCase


def at(days_ago=0, hours=12):
    """Bugundan `days_ago` kun oldingi lahza (Toshkent vaqtida)."""
    day = timezone.localdate() - timezone.timedelta(days=days_ago)
    return timezone.make_aware(datetime.combine(day, dtime(hour=hours)))


class DashboardNumbersTest(ApiTestCase):
    """Hamma ish DASTURCHIga biriktiriladi - u hech nimani boshqarmaydi,
    ya'ni qamrov «faqat o'zimniki» bo'lib qoladi va sanoq toza chiqadi."""

    def panel(self):
        return self.client_for(self.dev).get("/api/dashboard/").data

    def period(self, data, key):
        return next(p for p in data["periods"] if p["key"] == key)

    def make(self, status, created=None, due=None, completed=None):
        task = Task.objects.create(project=self.project, title="Ish",
                                   created_by=self.manager, status=status)
        TaskAssignment.objects.create(task=task, user=self.dev)
        fields = {}
        if created is not None:
            fields["created_at"] = created
        if due is not None:
            fields["due_date"] = due
        if completed is not None:
            fields["completed_at"] = completed
        if fields:
            # `created_at` - `auto_now_add`, oddiy `save()` uni qaytarib
            # qo'yardi. Shuning uchun to'g'ridan-to'g'ri UPDATE.
            Task.objects.filter(pk=task.pk).update(**fields)
        return Task.objects.get(pk=task.pk)

    # ------------------------------------------------------------ nazoratda
    def test_nazoratda_shu_davrda_ochilgan_yopilmagan_ish(self):
        self.make(TaskStatus.TODO, created=at(1))
        d = self.panel()
        self.assertEqual(self.period(d, "week")["todo"], 1)
        self.assertEqual(self.period(d, "year")["todo"], 1)

    def test_yopilgan_ish_nazoratda_sanalmaydi(self):
        self.make(TaskStatus.DONE, created=at(1), completed=at(0))
        self.assertEqual(self.period(self.panel(), "year")["todo"], 0)

    def test_tekshiruvdagi_ish_ham_yopilmagan_hisoblanadi(self):
        """Topshirilgan, lekin qabul qilinmagan ish - hamon ochiq."""
        self.make(TaskStatus.IN_REVIEW, created=at(1))
        self.assertEqual(self.period(self.panel(), "year")["todo"], 1)

    def test_bekor_qilingan_ish_sanalmaydi(self):
        self.make(TaskStatus.CANCELLED, created=at(1))
        self.assertEqual(self.period(self.panel(), "year")["todo"], 0)

    # -------------------------------------------------------- muddati o'tgan
    def test_muddati_otgan_yopilmagan_ish(self):
        self.make(TaskStatus.TODO, created=at(3), due=at(1))
        self.assertEqual(self.period(self.panel(), "year")["overdue"], 1)

    def test_muddati_kelmagan_ish_otgan_emas(self):
        self.make(TaskStatus.TODO, created=at(1), due=at(-5))
        self.assertEqual(self.period(self.panel(), "year")["overdue"], 0)

    def test_yopilgan_ish_muddati_otgan_qatorida_turmaydi(self):
        self.make(TaskStatus.DONE, created=at(3), due=at(2), completed=at(1))
        self.assertEqual(self.period(self.panel(), "year")["overdue"], 0)

    # ---------------------------------------------------------- bajarilganlar
    def test_bajarilganlar_yakunlangan_sana_boyicha(self):
        self.make(TaskStatus.DONE, created=at(10), completed=at(1))
        d = self.panel()
        self.assertEqual(self.period(d, "week")["done"], 1)
        self.assertEqual(self.period(d, "year")["done"], 1)

    # ------------------------------------------------------------- davrlar
    def test_yil_oyni_va_haftani_oz_ichiga_oladi(self):
        """Bir yarim oy oldingi ish yilda ko'rinadi, haftada - yo'q."""
        self.make(TaskStatus.DONE, created=at(60), completed=at(45))
        d = self.panel()
        self.assertEqual(self.period(d, "year")["done"], 1)
        self.assertEqual(self.period(d, "week")["done"], 0)

    def test_otgan_yilgi_ish_hech_qaysi_davrga_tushmaydi(self):
        self.make(TaskStatus.DONE, created=at(500), completed=at(400))
        d = self.panel()
        for key in ("year", "month", "week"):
            with self.subTest(key=key):
                self.assertEqual(self.period(d, key)["done"], 0)

    # ------------------------------------------------------- muddat holati
    def test_muddati_buzib_bajarilgan(self):
        """Yopilgan, lekin muddatdan KEYIN."""
        self.make(TaskStatus.DONE, created=at(10), due=at(5), completed=at(2))
        d = self.panel()
        self.assertEqual(d["deadlines"]["late_done"], 1)
        self.assertEqual(d["deadlines"]["overdue"], 0)

    def test_vaqtida_bajarilgan_buzilgan_hisoblanmaydi(self):
        self.make(TaskStatus.DONE, created=at(10), due=at(2), completed=at(5))
        self.assertEqual(self.panel()["deadlines"]["late_done"], 0)

    def test_muddatsiz_ish_buzilgan_hisoblanmaydi(self):
        self.make(TaskStatus.DONE, created=at(10), completed=at(2))
        self.assertEqual(self.panel()["deadlines"]["late_done"], 0)

    def test_kutilmoqda_muddati_kelmagan_va_muddatsiz(self):
        self.make(TaskStatus.TODO, created=at(1), due=at(-5))   # muddati oldinda
        self.make(TaskStatus.IN_PROGRESS, created=at(1))        # muddatsiz
        d = self.panel()
        self.assertEqual(d["deadlines"]["waiting"], 2)
        self.assertEqual(d["deadlines"]["overdue"], 0)

    def test_kechikkan_va_kutilayotgan_ish_bir_biriga_qoshilmaydi(self):
        """Yopilmagan ish YO kechikkan, YO kutilmoqda - ikkovi ham emas."""
        self.make(TaskStatus.TODO, created=at(5), due=at(2))     # kechikkan
        self.make(TaskStatus.TODO, created=at(5), due=at(-2))    # kutilmoqda
        d = self.panel()
        self.assertEqual(d["deadlines"]["overdue"], 1)
        self.assertEqual(d["deadlines"]["waiting"], 1)

    def test_bosh_bazada_hamma_raqam_nol(self):
        d = self.panel()
        self.assertEqual(d["deadlines"], {"late_done": 0, "overdue": 0, "waiting": 0})
        for key in ("year", "month", "week"):
            row = self.period(d, key)
            self.assertEqual((row["todo"], row["overdue"], row["done"]), (0, 0, 0))


class BacklogRemovedTest(ApiTestCase):
    """`BACKLOG` holati butunlay olib tashlangan - qaytib kelmasin."""

    def test_holatlar_royxatida_yoq(self):
        self.assertNotIn("BACKLOG", TaskStatus.values)

    def test_doska_ustunlarida_yoq(self):
        from apps.tasks.models import BOARD_COLUMNS

        self.assertNotIn("BACKLOG", [str(s) for s in BOARD_COLUMNS])

    def test_meta_ham_bermaydi(self):
        """Frontend ro'yxatni `/api/meta/` dan oladi - u yerda ham yo'q."""
        data = self.api.get("/api/meta/").data
        for key in ("task_status", "board_columns"):
            with self.subTest(key=key):
                self.assertNotIn("BACKLOG", [row["value"] for row in data[key]])

    def test_backlog_holatini_yozib_bolmaydi(self):
        r = self.api.post("/api/tasks/", {"project": self.project.pk, "title": "Sinov",
                                          "status": "BACKLOG"}, format="json")
        self.assertEqual(r.status_code, 400)


class BoardCoversAllWorkTest(ApiTestCase):
    """Doska HAMMA ochiq ishni ko'rsatsin.

    Ustuni yo'q holatdagi vazifa doskada umuman ko'rinmaydi va jimgina
    yo'qoladi: loyihada 74 ta ish bo'lgan, doskada 69 tasi turgan edi -
    farq «to'xtab qolgan» beshta ish edi. Test shu turdagi yo'qotishning
    qaytishiga yo'l qo'ymaydi.
    """

    def test_bekor_qilingandan_boshqa_hamma_holat_ustunga_ega(self):
        from apps.tasks.models import BOARD_COLUMNS, TaskStatus

        columns = {str(s) for s in BOARD_COLUMNS}
        for status in TaskStatus.values:
            if status == TaskStatus.CANCELLED:
                continue          # yopilgan ish - doskada kerak emas
            with self.subTest(status=status):
                self.assertIn(status, columns)

    def test_toxtab_qolgan_ish_doskada_korinadi(self):
        task = Task.objects.create(project=self.project, title="To'xtagan ish",
                                   created_by=self.manager, status=TaskStatus.BLOCKED)
        r = self.api.get("/api/tasks/board/", {"project": self.project.pk})
        self.assertEqual(r.status_code, 200)
        seen = [t["id"] for col in r.data["columns"] for t in col["tasks"]]
        self.assertIn(task.pk, seen)

    def test_doskadagi_sanoq_royxatdagi_bilan_bir_xil(self):
        """Eng muhimi: doskadagi jami = loyihadagi ochiq ishlar soni."""
        for status in (TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED,
                       TaskStatus.IN_REVIEW, TaskStatus.CHANGES_REQUESTED, TaskStatus.DONE):
            Task.objects.create(project=self.project, title="Ish " + status,
                                created_by=self.manager, status=status)

        r = self.api.get("/api/tasks/board/", {"project": self.project.pk})
        doskada = sum(col["count"] for col in r.data["columns"])
        bazada = Task.objects.filter(project=self.project).exclude(
            status=TaskStatus.CANCELLED).count()
        self.assertEqual(doskada, bazada)


class PanelDrillDownTest(ApiTestCase):
    """Katak bosilganda chiqadigan ro'yxat SANOQ bilan bir xil bo'lsin.

    Ikkovi bir manbadan (`panel_metric_q`) oladi - shu bog'lanish
    uzilmasin: katakda «5» turib, ochilganda 4 ta ish chiqsa, qaysi biri
    to'g'riligi noma'lum bo'lib qolardi.
    """

    URL = "/api/dashboard/tasks/"

    def setUp(self):
        super().setUp()
        self.api = self.client_for(self.dev)      # dasturchi - qamrov «o'zimniki»

    def make(self, status, **fields):
        task = Task.objects.create(project=self.project, title="Ish",
                                   created_by=self.manager, status=status)
        TaskAssignment.objects.create(task=task, user=self.dev)
        if fields:
            Task.objects.filter(pk=task.pk).update(**fields)
        return task

    def panel(self):
        return self.api.get("/api/dashboard/").data

    def test_royxat_va_sanoq_mos_keladi(self):
        self.make(TaskStatus.TODO, created_at=at(2))
        self.make(TaskStatus.IN_PROGRESS, created_at=at(1))
        self.make(TaskStatus.DONE, created_at=at(3), completed_at=at(1))

        d = self.panel()
        for key in ("year", "month", "week"):
            row = next(p for p in d["periods"] if p["key"] == key)
            for metric in ("todo", "overdue", "done"):
                with self.subTest(period=key, metric=metric):
                    r = self.api.get(self.URL, {"period": key, "metric": metric})
                    self.assertEqual(r.status_code, 200, r.data)
                    self.assertEqual(r.data["count"], row[metric])
                    self.assertEqual(len(r.data["results"]), row[metric])

    def test_muddat_kataklari_ham_mos(self):
        self.make(TaskStatus.TODO, created_at=at(5), due_date=at(2))       # kechikkan
        self.make(TaskStatus.TODO, created_at=at(5), due_date=at(-3))      # kutilmoqda
        self.make(TaskStatus.DONE, created_at=at(9), due_date=at(5),
                  completed_at=at(2))                                       # kech bajarilgan

        d = self.panel()
        for metric, key in (("late_done", "late_done"), ("overdue_now", "overdue"),
                            ("waiting", "waiting")):
            with self.subTest(metric=metric):
                r = self.api.get(self.URL, {"metric": metric})
                self.assertEqual(r.status_code, 200, r.data)
                self.assertEqual(r.data["count"], d["deadlines"][key])

    def test_begona_ish_royxatga_tushmaydi(self):
        """Qamrov sanoqdagi bilan bir xil - dasturchi faqat o'zinikini ko'radi."""
        alien = Task.objects.create(project=self.project, title="Begona",
                                    created_by=self.manager, status=TaskStatus.TODO)
        r = self.api.get(self.URL, {"period": "year", "metric": "todo"})
        self.assertNotIn(alien.pk, [t["id"] for t in r.data["results"]])

    def test_notogri_parametr_400(self):
        for params in ({"period": "asr", "metric": "todo"},
                       {"period": "year", "metric": "allaqanday"},
                       {"metric": ""}):
            with self.subTest(params=params):
                self.assertEqual(self.api.get(self.URL, params).status_code, 400)

    def test_kirmagan_odam_otmaydi(self):
        self.assertEqual(self.anon.get(self.URL, {"metric": "waiting"}).status_code, 401)
