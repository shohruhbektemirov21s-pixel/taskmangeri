"""Uchta qo'shimcha: hujjat sanasi, tugash sanalari taqvimi va o'chirish tasdig'i.

HUJJAT SANASI. Fayl yuklangan lahza (`created_at`) hujjatning o'z sanasi emas:
o'tgan yilgi shartnoma bugun yuklanishi mumkin. Shuning uchun alohida maydon
bor va u fayllar bilan BIR TARTIBDA keladi - i-chi sana i-chi faylniki.

TAQVIM. Ilgari har loyiha boshlanishdan muddatgacha tasma bo'lib cho'zilardi
va oy tasmalar bilan to'lib ketardi. Endi taqvimda faqat TUGASH sanalari
turadi: qaysi kuni nima topshirilishi kerak.

O'CHIRISH. Loyiha jarayondagi ishlari bilan birga bir bosishda yo'q bo'lardi.
Endi birinchi so'rov 409 va sanoq bilan qaytadi, o'chirish esa faqat
`?confirm=1` bilan bo'ladi - odam nima yo'qolishini ko'rib turib tasdiqlaydi.
"""

import os
from datetime import date, datetime, timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.projects.models import Project, ProjectFile, ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskAssignment, TaskStatus

from .base import ApiTestCase, make_user


def local_stamp(value):
    """Saqlangan `doc_date` ni TOSHKENT vaqtida "2026-02-21 14:30" ko'rinishida.

    Bazada UTC yotadi, tekshiradigan narsamiz esa odam kiritgan mahalliy
    soat - shuning uchun solishtirishdan oldin qaytarib o'giramiz.
    """
    return timezone.localtime(value).strftime("%Y-%m-%d %H:%M")


def local_dt(year, month, day, hour=0, minute=0):
    """Toshkent vaqtidagi mintaqali sana+soat - fixture'lar uchun."""
    return timezone.make_aware(datetime(year, month, day, hour, minute))


class ProjectFileDateTest(ApiTestCase):
    """Hujjatning o'z sanasi - yuklangan vaqtdan alohida."""

    def upload(self, files, dates=None, note="Sinov hujjati", client=None):
        body = {"file": files}
        if dates is not None:
            body["doc_date"] = dates
        if note is not None:
            body["description"] = note
        response = (client or self.api).post("/api/projects/%d/files/" % self.project.pk,
                                             body, format="multipart")
        for f in ProjectFile.objects.all():
            if f.file:
                self.addCleanup(self.remove_file, f.file.path)
        return response

    @staticmethod
    def remove_file(path):
        try:
            os.remove(path)
        except OSError:
            pass

    def test_sana_va_soat_saqlanadi(self):
        """Hujjat sanasida SOAT ham bor: bir kunda kelgan ikki bayonnomani
        faqat kun bilan tartiblab bo'lmasdi - ro'yxatda ular bir xil sana
        bilan yonma-yon turardi."""
        response = self.upload([SimpleUploadedFile("shartnoma.txt", b"matn")],
                               ["2026-02-21T14:30"])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(local_stamp(ProjectFile.objects.get().doc_date),
                         "2026-02-21 14:30")
        self.assertTrue(response.data[0]["doc_date"].startswith("2026-02-21T14:30"))

    def test_soatsiz_sana_ham_qabul_qilinadi(self):
        """Faqat kun yozilsa kun boshi tushuniladi - eski yozuvlar va qo'lda
        yuborilgan so'rovlar ishlayversin."""
        response = self.upload([SimpleUploadedFile("eskisi.txt", b"matn")], ["2026-02-21"])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(local_stamp(ProjectFile.objects.get().doc_date),
                         "2026-02-21 00:00")

    def test_sanasiz_yuklab_bolmaydi(self):
        """Sanasiz hujjat: qaysi variant yangi ekanini hech kim ayta olmaydi."""
        response = self.upload([SimpleUploadedFile("dizayn.txt", b"matn")])
        self.assertEqual(response.status_code, 400)
        self.assertIn("doc_date", response.data)
        self.assertEqual(ProjectFile.objects.count(), 0)

    def test_nomsiz_yuklab_bolmaydi(self):
        """Nomsiz hujjatni ro'yxatdan faqat uni yuklagan odam taniydi."""
        response = self.upload([SimpleUploadedFile("dizayn.txt", b"matn")],
                               ["2026-02-21"], note="   ")
        self.assertEqual(response.status_code, 400)
        self.assertIn("description", response.data)
        self.assertEqual(ProjectFile.objects.count(), 0)

    def test_har_faylga_oz_sanasi_tegadi(self):
        """Sanalar fayllar bilan bir tartibda: indeks siljib ketmasin."""
        response = self.upload(
            [SimpleUploadedFile("bir.txt", b"a"), SimpleUploadedFile("ikki.txt", b"b")],
            ["2026-01-05T09:00", "2026-03-09T17:45"])
        self.assertEqual(response.status_code, 201, response.data)
        got = {f.original_name: local_stamp(f.doc_date) for f in ProjectFile.objects.all()}
        self.assertEqual(got, {"bir.txt": "2026-01-05 09:00",
                               "ikki.txt": "2026-03-09 17:45"})

    def test_bitta_sana_butun_toplamga_tegishli(self):
        response = self.upload(
            [SimpleUploadedFile("uch.txt", b"a"), SimpleUploadedFile("tort.txt", b"b")],
            ["2026-04-01T08:15"])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual({local_stamp(f.doc_date) for f in ProjectFile.objects.all()},
                         {"2026-04-01 08:15"})

    def test_yaroqsiz_sana_400_beradi(self):
        response = self.upload([SimpleUploadedFile("besh.txt", b"a")], ["kecha"])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ProjectFile.objects.count(), 0)

    def test_qayta_yuklashda_eski_sana_tarixda_qoladi(self):
        self.upload([SimpleUploadedFile("olti.txt", b"a")], ["2026-01-01T10:00"])
        self.upload([SimpleUploadedFile("olti.txt", b"b")], ["2026-05-05T16:20"])
        doc = ProjectFile.objects.get()
        self.assertEqual(local_stamp(doc.doc_date), "2026-05-05 16:20")
        self.assertEqual(local_stamp(doc.versions.get().doc_date), "2026-01-01 10:00")


class ProjectFileEditTest(ApiTestCase):
    """Hujjatni kim tahrirlay va o'chira oladi.

    Yuklagan odam o'znikiga, menejer va admin hammasiga. Ilgari yuklagan
    odam o'zi qo'ygan faylga ham tega olmasdi - xato nom yozib qo'ysa,
    menejerni bezovta qilishga to'g'ri kelardi.
    """

    def setUp(self):
        super().setUp()
        self.doc = ProjectFile.objects.create(
            project=self.project, file="projects/1/hujjat.txt",
            original_name="hujjat.txt", description="Eski nom",
            doc_date=local_dt(2026, 2, 21), uploaded_by=self.dev)
        self.url = "/api/projects/%d/files/%d/" % (self.project.pk, self.doc.pk)

    def patch(self, client, **body):
        payload = {"description": "Yangi nom", "doc_date": "2026-03-05T11:00"}
        payload.update(body)
        return client.patch(self.url, payload, format="json")

    def test_yuklagan_odam_ozinikini_tahrirlaydi(self):
        response = self.patch(self.client_for(self.dev))
        self.assertEqual(response.status_code, 200, response.data)
        self.doc.refresh_from_db()
        self.assertEqual(self.doc.description, "Yangi nom")
        self.assertEqual(local_stamp(self.doc.doc_date), "2026-03-05 11:00")

    def test_yuklagan_odam_ozinikini_ochiradi(self):
        response = self.client_for(self.dev).delete(self.url)
        self.assertEqual(response.status_code, 204)
        self.doc.refresh_from_db()
        self.assertIsNotNone(self.doc.deleted_at)

    def test_menejer_hammasiga_tega_oladi(self):
        self.assertEqual(self.patch(self.api).status_code, 200)

    def test_boshqa_azo_tega_olmaydi(self):
        other = make_user("boshqa@sinov.uz", "Boshqa Dasturchi")
        ProjectMember.objects.create(project=self.project, user=other,
                                     role=ProjectRole.DEVELOPER)
        client = self.client_for(other)
        self.assertEqual(self.patch(client).status_code, 403)
        self.assertEqual(client.delete(self.url).status_code, 403)

    def test_nom_va_sana_bosh_qolmaydi(self):
        client = self.client_for(self.dev)
        self.assertEqual(self.patch(client, description="  ").status_code, 400)
        self.assertEqual(self.patch(client, doc_date=None).status_code, 400)
        self.doc.refresh_from_db()
        self.assertEqual(self.doc.description, "Eski nom")


class CalendarDueDatesTest(ApiTestCase):
    """Taqvimda faqat tugash sanalari."""

    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.month = self.today.strftime("%Y-%m")
        # Shu oyning 15-kuni - oy chegarasidan xavfsiz masofada.
        self.day = date(self.today.year, self.today.month, 15)

    def calendar(self):
        response = self.api.get("/api/projects/calendar/", {"month": self.month})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_loyiha_faqat_muddat_kunida_turadi(self):
        self.project.start_date = self.day - timedelta(days=40)
        self.project.due_date = self.day
        self.project.save(update_fields=["start_date", "due_date"])

        rows = self.calendar()["projects"]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        # Tasma emas, bitta kun: boshlanish sanasi ma'lumot uchun qoladi.
        self.assertEqual(str(row["from"]), str(self.day))
        self.assertEqual(str(row["to"]), str(self.day))
        self.assertEqual(str(row["start_date"]), str(self.day - timedelta(days=40)))

    def test_muddatsiz_loyiha_taqvimda_turmaydi(self):
        self.project.start_date = self.day
        self.project.due_date = None
        self.project.save(update_fields=["start_date", "due_date"])
        self.assertEqual(self.calendar()["projects"], [])

    def test_muddati_boshqa_oyda_bolgan_loyiha_chiqmaydi(self):
        self.project.due_date = self.day + timedelta(days=60)
        self.project.save(update_fields=["due_date"])
        self.assertEqual(self.calendar()["projects"], [])

    def test_vazifa_oz_muddati_kunida_turadi(self):
        """Loyihaning o'zi shu oyda tugamasa ham, ichidagi ish ko'rinadi."""
        self.project.due_date = None
        self.project.save(update_fields=["due_date"])
        due = timezone.make_aware(
            timezone.datetime(self.day.year, self.day.month, self.day.day, 18, 0))
        Task.objects.create(project=self.project, title="Muddatli ish",
                            due_date=due, created_by=self.manager)
        Task.objects.create(project=self.project, title="Muddatsiz ish",
                            created_by=self.manager)

        tasks = self.calendar()["tasks"]
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["title"], "Muddatli ish")
        self.assertEqual(str(tasks[0]["from"]), str(self.day))
        self.assertEqual(str(tasks[0]["to"]), str(self.day))

    def test_kun_katagidagi_uchta_sanoq(self):
        """Kun katagi: nazoratda / jarayonda / bajarilgan.

        Oraliq holatlar («Tekshiruvda» va boshqalar) JARAYONGA qo'shiladi -
        uchta raqamning yig'indisi o'sha kungi vazifalar soniga teng
        bo'lsin, aks holda odam "qolgani qayerda?" deb qolardi.
        """
        due = timezone.make_aware(
            timezone.datetime(self.day.year, self.day.month, self.day.day, 18, 0))
        for status in ["TODO", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE",
                       "CANCELLED"]:
            Task.objects.create(project=self.project, title="Ish " + status,
                                due_date=due, status=status, created_by=self.manager)

        row = next(d for d in self.calendar()["days"] if str(d["date"]) == str(self.day))
        self.assertEqual(row["todo"], 2)
        self.assertEqual(row["in_progress"], 2)      # IN_PROGRESS + IN_REVIEW
        self.assertEqual(row["done"], 1)             # bekor qilingani sanalmaydi

    def test_vazifasiz_kunda_sanoqlar_nol(self):
        row = next(d for d in self.calendar()["days"] if str(d["date"]) == str(self.day))
        self.assertEqual((row["todo"], row["in_progress"], row["done"]), (0, 0, 0))


class CalendarTaskScopeTest(ApiTestCase):
    """Taqvimda kim kimning ishini ko'radi.

    Menejerga butun manzara kerak - u ish taqsimlaydi. Dasturchiga esa
    o'ziniki: ilgari a'zo bo'lgan loyihaning HAMMA vazifasi ko'rinardi va
    o'z ishi jamoadagi o'nlab begona muddat orasida yo'qolib ketardi.
    """

    def setUp(self):
        super().setUp()
        today = timezone.localdate()
        self.month = today.strftime("%Y-%m")
        day = date(today.year, today.month, 15)
        due = timezone.make_aware(timezone.datetime(day.year, day.month, day.day, 18, 0))

        self.mine = Task.objects.create(project=self.project, title="Dasturchining ishi",
                                        due_date=due, created_by=self.manager)
        TaskAssignment.objects.create(task=self.mine, user=self.dev)
        self.other = Task.objects.create(project=self.project, title="Begona ish",
                                         due_date=due, created_by=self.manager)

    def calendar_for(self, user):
        response = self.client_for(user).get("/api/projects/calendar/", {"month": self.month})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_menejer_hamma_vazifani_koradi(self):
        data = self.calendar_for(self.manager)
        self.assertFalse(data["tasks_limited"])
        self.assertEqual({t["title"] for t in data["tasks"]},
                         {"Dasturchining ishi", "Begona ish"})

    def test_dasturchi_faqat_ozining_ishini_koradi(self):
        data = self.calendar_for(self.dev)
        self.assertTrue(data["tasks_limited"])
        self.assertEqual([t["title"] for t in data["tasks"]], ["Dasturchining ishi"])

    def test_admin_hammasini_koradi(self):
        data = self.calendar_for(self.admin)
        self.assertFalse(data["tasks_limited"])
        self.assertEqual(len(data["tasks"]), 2)

    def test_kuzatuvchi_hamma_vazifani_koradi(self):
        """Kuzatuvchining biriktirilgan ishi bo'lmaydi - cheklov unga tegmaydi.

        Aks holda «Kuzatuvchi» roli bo'm-bo'sh taqvim degani bo'lardi.
        """
        viewer = make_user("kuzatuvchi@sinov.uz", "Kuzatuvchi Vali")
        ProjectMember.objects.create(project=self.project, user=viewer,
                                     role=ProjectRole.VIEWER)
        data = self.calendar_for(viewer)
        self.assertFalse(data["tasks_limited"])
        self.assertEqual(len(data["tasks"]), 2)


class ProjectDeleteConfirmTest(ApiTestCase):
    """Jarayondagi ish bo'lsa loyiha tasdiqsiz o'chmaydi."""

    def setUp(self):
        super().setUp()
        self.task = Task.objects.create(project=self.project, title="Jarayondagi ish",
                                        status=TaskStatus.IN_PROGRESS, created_by=self.manager)
        TaskAssignment.objects.create(task=self.task, user=self.dev)

    def alive(self):
        return Project.objects.filter(pk=self.project.pk, deleted_at__isnull=True).exists()

    def test_tasdiqsiz_ochirish_409_va_sanoq_beradi(self):
        response = self.api.delete("/api/projects/%d/" % self.project.pk)
        self.assertEqual(response.status_code, 409, response.data)
        self.assertTrue(response.data["needs_confirm"])
        self.assertEqual(response.data["open_tasks"], 1)
        self.assertEqual(response.data["in_progress"], 1)
        self.assertEqual(response.data["in_review"], 0)
        # Loyiha joyida qoladi - bu faqat ogohlantirish.
        self.assertTrue(self.alive())

    def test_tasdiq_bilan_ochadi(self):
        response = self.api.delete("/api/projects/%d/?confirm=1" % self.project.pk)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(self.alive())

    def test_tugallangan_ish_tosiq_bolmaydi(self):
        self.task.status = TaskStatus.DONE
        self.task.save(update_fields=["status"])
        response = self.api.delete("/api/projects/%d/" % self.project.pk)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(self.alive())

    def test_begona_odam_sanoqni_ham_kormaydi(self):
        response = self.client_for(self.dev).delete("/api/projects/%d/" % self.project.pk)
        self.assertIn(response.status_code, (403, 404))
        self.assertTrue(self.alive())


class DashboardTodayAndTeamTest(ApiTestCase):
    """Panelning bugungi kesimi va menejer jamoasi."""

    def setUp(self):
        super().setUp()
        self.now = timezone.now()

    def panel(self, user):
        response = self.client_for(user).get("/api/dashboard/")
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_bugun_kesimi_sanaydi(self):
        # Muddati bugun - bajarilishi kerak.
        t1 = Task.objects.create(project=self.project, title="Bugungi ish",
                                 status=TaskStatus.IN_PROGRESS, due_date=self.now,
                                 created_by=self.manager)
        # Muddati kelasi hafta - bugungi ro'yxatga kirmaydi.
        t2 = Task.objects.create(project=self.project, title="Keyingi ish",
                                 status=TaskStatus.TODO,
                                 due_date=self.now + timedelta(days=7),
                                 created_by=self.manager)
        # Bugun yakunlangan.
        t3 = Task.objects.create(project=self.project, title="Bitgan ish",
                                 status=TaskStatus.DONE, completed_at=self.now,
                                 created_by=self.manager)
        # Bugun tekshiruvga topshirilgan.
        t4 = Task.objects.create(project=self.project, title="Topshirilgan ish",
                                 status=TaskStatus.IN_REVIEW, submitted_at=self.now,
                                 created_by=self.manager)
        for task in (t1, t2, t3, t4):
            TaskAssignment.objects.create(task=task, user=self.dev)

        today = self.panel(self.dev)["today"]
        self.assertEqual(today["todo"], 1)
        self.assertEqual(today["done"], 1)
        self.assertEqual(today["review"], 1)

    def test_menejer_jamoasini_koradi(self):
        task = Task.objects.create(project=self.project, title="Dasturchining ishi",
                                   status=TaskStatus.IN_PROGRESS, created_by=self.manager)
        TaskAssignment.objects.create(task=task, user=self.dev)

        team = self.panel(self.manager)["team"]
        self.assertEqual(team["projects"], 1)
        self.assertEqual(team["developers"], 1)
        person = team["people"][0]
        self.assertEqual(person["user"]["id"], self.dev.pk)
        self.assertEqual(person["open_tasks"], 1)
        self.assertEqual([p["id"] for p in person["projects"]], [self.project.pk])

    def test_dasturchida_jamoa_kesimi_bosh(self):
        team = self.panel(self.dev)["team"]
        self.assertEqual(team["projects"], 0)
        self.assertEqual(team["people"], [])


class ProjectFileDateRangeTest(ApiTestCase):
    """Hujjat sanasi loyiha oralig'idan chiqib ketmasin.

    Loyiha boshlanishidan oldingi yoki muddatidan keyingi sana deyarli har
    doim xato yozuv: odam yilni chalkashtiradi yoki bugungi sanani qo'yib
    yuboradi. Bunday hujjat keyin taqvimda ham, tartibda ham noto'g'ri
    joyda turadi.

    Chegara faqat QO'YILGAN tomonda ishlaydi: loyihada sana belgilanmagan
    bo'lsa, yo'q chegarani talab qilib bo'lmaydi.
    """

    def setUp(self):
        super().setUp()
        Project.objects.filter(pk=self.project.pk).update(
            start_date=date(2026, 2, 1), due_date=date(2026, 4, 30))
        self.project.refresh_from_db()

    @staticmethod
    def remove_file(path):
        try:
            os.remove(path)
        except OSError:
            pass

    def upload(self, name, doc_date):
        response = self.api.post(
            "/api/projects/%d/files/" % self.project.pk,
            {"file": [SimpleUploadedFile(name, b"matn")],
             "doc_date": [doc_date], "description": "Sinov hujjati"},
            format="multipart")
        for f in ProjectFile.objects.all():
            if f.file:
                self.addCleanup(self.remove_file, f.file.path)
        return response

    def test_oraliq_ichidagi_sana_qabul_qilinadi(self):
        response = self.upload("shartnoma.txt", "2026-03-15T12:00")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(local_stamp(ProjectFile.objects.get().doc_date),
                         "2026-03-15 12:00")

    def test_chegaralar_ozi_ham_qabul_qilinadi(self):
        """Oraliq YOPIQ: boshlanish va tugash kunining o'zi ham to'g'ri sana."""
        self.assertEqual(self.upload("boshi.txt", "2026-02-01T00:00").status_code, 201)
        self.assertEqual(self.upload("oxiri.txt", "2026-04-30T23:59").status_code, 201)

    def test_kun_boshidagi_soat_chegaraga_tegmaydi(self):
        """Boshlanish kunining ertalabki soati ham qabul qilinadi.

        Toshkent UTC+5: mahalliy 00:30 bazada bir kun OLDINGI 19:30 bo'lib
        yotadi. Tekshiruv UTC sanasi bo'yicha ketsa, shu hujjat "loyiha
        boshlanishidan oldin" deb rad etilardi - shuning uchun
        `_check_doc_date` solishtirishdan oldin mahalliy kunga keltiradi.
        """
        response = self.upload("erta.txt", "2026-02-01T00:30")
        self.assertEqual(response.status_code, 201, response.data)

    def test_boshlanishdan_oldingi_sana_rad_etiladi(self):
        response = self.upload("eski.txt", "2026-01-31T23:00")
        self.assertEqual(response.status_code, 400)
        self.assertIn("doc_date", response.data)
        self.assertEqual(ProjectFile.objects.count(), 0)

    def test_muddatdan_keyingi_sana_rad_etiladi(self):
        response = self.upload("kelasi.txt", "2026-05-01T00:30")
        self.assertEqual(response.status_code, 400)
        self.assertIn("doc_date", response.data)
        self.assertEqual(ProjectFile.objects.count(), 0)

    def test_tahrirda_ham_tekshiriladi(self):
        """PATCH orqali oraliqdan tashqariga chiqarib bo'lmaydi."""
        doc = ProjectFile.objects.create(
            project=self.project, file="projects/1/hujjat.txt",
            original_name="hujjat.txt", description="Nom",
            doc_date=local_dt(2026, 3, 1), uploaded_by=self.dev)
        url = "/api/projects/%d/files/%d/" % (self.project.pk, doc.pk)
        response = self.api.patch(url,
                                  {"description": "Nom", "doc_date": "2026-06-01T09:00"},
                                  format="json")
        self.assertEqual(response.status_code, 400)
        doc.refresh_from_db()
        self.assertEqual(local_stamp(doc.doc_date), "2026-03-01 00:00")

    def test_chegarasiz_loyihada_istalgan_sana(self):
        """Loyihada sana belgilanmagan bo'lsa - cheklov ham yo'q."""
        Project.objects.filter(pk=self.project.pk).update(start_date=None, due_date=None)
        self.project.refresh_from_db()
        self.assertEqual(self.upload("arxiv.txt", "2019-07-04T12:00").status_code, 201)
