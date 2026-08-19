"""«Dasturchilar» bo'limi - kim kimning ish yukini ko'radi.

Bo'lim menejerga "kim band, kimda ish yo'q" degan savolga javob beradi,
ya'ni u BOSHQA odamlarning ishini ko'rsatadi. Shu sabab chegarasi
ro'yxatning o'zidan muhimroq: quyidagi testlar qamrovni qulflab qo'yadi -
odam faqat O'ZI BOSHQARADIGAN loyihalar bo'yicha ko'radi, ijrochiga esa
bo'lim umuman bo'sh qaytadi.
"""

from datetime import datetime, time as dt_time

from django.utils import timezone

from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskAssignment, TaskStatus

from .base import ApiTestCase, make_user


class TeamWorkloadTest(ApiTestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.qa = make_user("tester@sinov.uz", "Tester Vali", specialty="QA")
        ProjectMember.objects.create(project=cls.project, user=cls.qa, role=ProjectRole.QA)

        cls.open_task = Task.objects.create(project=cls.project, title="Ochiq ish",
                                            created_by=cls.manager,
                                            status=TaskStatus.IN_PROGRESS)
        cls.done_task = Task.objects.create(project=cls.project, title="Tugagan ish",
                                            created_by=cls.manager, status=TaskStatus.DONE)
        TaskAssignment.objects.create(task=cls.open_task, user=cls.dev)
        TaskAssignment.objects.create(task=cls.done_task, user=cls.dev)

        # Begona loyiha - menejerimizning boshqaruvida emas.
        cls.other_manager = make_user("boshqa@sinov.uz", "Boshqa Menejer", role="MANAGER")
        cls.other = Project.objects.create(workspace=cls.workspace, name="Begona loyiha",
                                           manager=cls.other_manager,
                                           created_by=cls.other_manager)
        ProjectMember.objects.create(project=cls.other, user=cls.outsider,
                                     role=ProjectRole.DEVELOPER)

    def workload(self, user, **params):
        return self.client_for(user).get("/api/team/workload/", params).data

    def names(self, data):
        return sorted(row["user"]["full_name"] for row in data["developers"])

    def row(self, data, user):
        return next(r for r in data["developers"] if r["user"]["id"] == user.pk)

    def test_menejer_oz_loyihasidagi_ijrochilarni_koradi(self):
        d = self.workload(self.manager)
        self.assertEqual(self.names(d), ["Dasturchi Ali", "Tester Vali"])
        self.assertEqual([p["name"] for p in d["projects"]], ["Sinov loyihasi"])

    def test_menejer_ozi_va_kuzatuvchi_royxatda_yoq(self):
        """Bo'lim ISHNI BAJARADIGANLAR haqida - boshqaruvchi bu yerda emas."""
        d = self.workload(self.manager)
        self.assertNotIn("Loyiha Menejeri", self.names(d))

    def test_begona_loyiha_qamrovga_tushmaydi(self):
        d = self.workload(self.manager)
        self.assertNotIn("Chetdagi Odam", self.names(d))

    def test_standart_royxatda_faqat_tugallanmagan_ish(self):
        row = self.row(self.workload(self.manager), self.dev)
        self.assertEqual([t["title"] for t in row["tasks"]], ["Ochiq ish"])
        self.assertEqual(row["task_count"], 1)

    def test_holat_filtri_bajarilganini_ham_korsatadi(self):
        row = self.row(self.workload(self.manager, status="DONE"), self.dev)
        self.assertEqual([t["title"] for t in row["tasks"]], ["Tugagan ish"])

    def test_qidiruv_vazifa_boyicha(self):
        """Qidiruv ISH ustidan boradi, odam ismi ustidan emas."""
        d = self.workload(self.manager, search="Ochiq")
        self.assertEqual(self.names(d), ["Dasturchi Ali"])
        self.assertEqual([t["title"] for t in self.row(d, self.dev)["tasks"]], ["Ochiq ish"])

    def test_qidiruv_kod_boyicha(self):
        """«HIR-1» ham, shunchaki «1» ham ishlasin - kod bazada ustun emas."""
        code = self.open_task.code
        self.assertEqual(self.names(self.workload(self.manager, search=code)), ["Dasturchi Ali"])
        self.assertEqual(self.names(self.workload(self.manager, search=str(self.open_task.number))),
                         ["Dasturchi Ali"])

    def test_qidiruv_loyiha_nomi_boyicha(self):
        """Loyiha nomi yozilsa - o'sha loyihadagi ishlar chiqsin.

        Menejer ko'pincha vazifa nomini emas, loyihani eslaydi: «Sinov
        loyihasi» da kimda nima bor. Ilgari bunday qidiruv bo'sh ro'yxat
        berardi - shart faqat vazifa nomi va kodi bo'yicha edi.
        """
        d = self.workload(self.manager, search="Sinov loyihasi")
        self.assertEqual(self.names(d), ["Dasturchi Ali"])
        self.assertEqual([t["title"] for t in self.row(d, self.dev)["tasks"]], ["Ochiq ish"])

    def test_qidiruv_loyiha_nomining_bolagi_ham_yetadi(self):
        self.assertEqual(self.names(self.workload(self.manager, search="sinov")),
                         ["Dasturchi Ali"])

    def test_qidiruv_loyiha_kaliti_boyicha(self):
        self.assertEqual(self.names(self.workload(self.manager, search=self.project.key)),
                         ["Dasturchi Ali"])

    def test_begona_loyiha_nomi_qamrovni_kengaytirmaydi(self):
        """Nom bo'yicha ham chegara o'sha: boshqaruvdagi loyihalar."""
        self.assertEqual(self.workload(self.manager, search="Begona loyiha")["developers"], [])

    def test_qidiruvda_ishi_yoq_odam_royxatda_qolmaydi(self):
        """Javob ISH bo'lgani uchun bo'sh qatorlar orasida ko'milib ketmasin."""
        self.assertEqual(self.workload(self.manager, search="bunday ish yoq")["developers"], [])

    # ---------------------------------------------------------- ism bo'yicha
    def test_qidiruv_odam_ismi_boyicha(self):
        """Jamoa kattalashganda kerakli odamni ko'z bilan qidirib bo'lmaydi."""
        d = self.workload(self.manager, search="Vali")
        self.assertEqual(self.names(d), ["Tester Vali"])

    def test_qidiruv_familiya_boyicha(self):
        self.assertEqual(self.names(self.workload(self.manager, search="Tester")),
                         ["Tester Vali"])

    def test_ism_boyicha_topilgan_odamning_HAMMA_ishi_chiqadi(self):
        """Ism vazifa sarlavhasida uchramaydi - vazifa sharti bilan kesib
        tashlansa natija doim bo'sh bo'lardi."""
        row = self.row(self.workload(self.manager, search="Ali"), self.dev)
        self.assertEqual([t["title"] for t in row["tasks"]], ["Ochiq ish"])

    def test_ismi_mos_odam_ishi_bolmasa_ham_qoladi(self):
        """«Unda ish yo'q ekan» ham javob - aynan o'sha odam so'ralgan bo'lsa."""
        d = self.workload(self.manager, search="Tester")
        self.assertEqual(self.row(d, self.qa)["task_count"], 0)

    def test_begona_odam_ismi_qamrovni_kengaytirmaydi(self):
        """Chegara o'sha: boshqaruvdagi loyihalardagi ijrochilar."""
        self.assertEqual(self.workload(self.manager, search="Chetdagi")["developers"], [])

    def test_davr_filtri_kalendar_boyicha(self):
        """«Bugun» - shu kun, «shu yil» - yil boshidan oxirigacha."""
        today = timezone.localdate()
        Task.objects.filter(pk=self.open_task.pk).update(
            due_date=timezone.make_aware(datetime.combine(today, dt_time(15, 0))))
        self.assertEqual(
            self.row(self.workload(self.manager, period="today"), self.dev)["task_count"], 1)
        self.assertEqual(
            self.row(self.workload(self.manager, period="year"), self.dev)["task_count"], 1)

    def test_yaroqsiz_davr_400(self):
        r = self.client_for(self.manager).get("/api/team/workload/", {"period": "haftalik"})
        self.assertEqual(r.status_code, 400)

    def test_aniq_sana_davrdan_ustun(self):
        """Ikkovi birga kelsa aniq sana ishlaydi - u aniqroq so'rov."""
        Task.objects.filter(pk=self.open_task.pk).update(
            due_date=timezone.make_aware(datetime(2026, 8, 23, 18, 0)))
        row = self.row(self.workload(self.manager, due="2026-08-23", period="today"), self.dev)
        self.assertEqual(row["task_count"], 1)

    def test_mutaxassislik_filtri(self):
        self.assertEqual(self.names(self.workload(self.manager, specialty="QA")), ["Tester Vali"])

    def test_loyiha_filtri_begona_loyihani_ochmaydi(self):
        """Boshqa odamning loyihasi raqami yozilsa ham qamrov kengaymasin."""
        d = self.workload(self.manager, project=self.other.pk)
        self.assertEqual(d["developers"], [])

    def test_muddat_filtri_aynan_shu_kun(self):
        """«Muddat sanasi» - faqat o'sha kunga tushadigan ish, oldingisi ham,
        keyingisi ham emas."""
        Task.objects.filter(pk=self.open_task.pk).update(
            due_date=timezone.make_aware(datetime(2026, 8, 23, 18, 0)))
        self.assertEqual(
            self.row(self.workload(self.manager, due="2026-08-23"), self.dev)["task_count"], 1)
        self.assertEqual(
            self.row(self.workload(self.manager, due="2026-08-22"), self.dev)["task_count"], 0)
        self.assertEqual(
            self.row(self.workload(self.manager, due="2026-08-24"), self.dev)["task_count"], 0)

    def test_kun_chegarasi_mintaqa_boyicha(self):
        """Kechqurun 23:30 da tugaydigan ish ERTASI kunga surilib ketmasin.

        Db2 ga vaqt UTC da boradi: Toshkent 23:30 = UTC 18:30, ya'ni
        solishtirish mahalliy vaqtda qilinmasa ish 22-avgustga tushardi."""
        Task.objects.filter(pk=self.open_task.pk).update(
            due_date=timezone.make_aware(datetime(2026, 8, 23, 23, 30)))
        self.assertEqual(
            self.row(self.workload(self.manager, due="2026-08-23"), self.dev)["task_count"], 1)

    def test_muddatsiz_vazifa_sana_kesimiga_tushmaydi(self):
        """Bajarish sanasi yo'q ish muddat bo'yicha kesimda ko'rinmasin."""
        self.assertIsNone(self.open_task.due_date)
        self.assertEqual(
            self.row(self.workload(self.manager, due="2030-01-01"), self.dev)["task_count"], 0)

    def test_yaroqsiz_sana_400(self):
        r = self.client_for(self.manager).get("/api/team/workload/", {"due": "23.08.2026"})
        self.assertEqual(r.status_code, 400)

    def test_yaroqsiz_loyiha_raqami_400(self):
        r = self.client_for(self.manager).get("/api/team/workload/", {"project": "abc"})
        self.assertEqual(r.status_code, 400)

    def test_yaroqsiz_holat_400(self):
        r = self.client_for(self.manager).get("/api/team/workload/", {"status": "YOQ"})
        self.assertEqual(r.status_code, 400)

    def test_ijrochiga_bolim_bosh(self):
        """Dasturchi hamkasbining ish yukini ko'rmaydi - u boshqarmaydi."""
        d = self.workload(self.dev)
        self.assertEqual(d["developers"], [])
        self.assertEqual(d["projects"], [])

    def test_admin_hamma_loyihani_koradi(self):
        d = self.workload(self.admin)
        self.assertIn("Chetdagi Odam", self.names(d))

    def test_ochirilgan_loyiha_royxatda_qolmaydi(self):
        self.project.soft_delete(actor=self.manager)
        d = self.workload(self.manager)
        self.assertEqual(d["developers"], [])
        self.assertEqual(d["projects"], [])

    def test_kirmagan_odam_401(self):
        self.assertEqual(self.anon.get("/api/team/workload/").status_code, 401)


class MyWorkFiltersTest(ApiTestCase):
    """«Vazifalarim» ro'yxatidagi qidiruv va muddat kesimi.

    Ikkala ro'yxat ham (bu va «Vazifalar») bitta qoidadan foydalanadi:
    qidiruv `task_search_q`, muddat `due_span`. Testlar shuni qulflaydi -
    odam bir ro'yxatda topgan ishini ikkinchisida ham topsin.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.today_task = Task.objects.create(
            project=cls.project, title="Bugungi ish", created_by=cls.manager,
            status=TaskStatus.IN_PROGRESS)
        cls.later_task = Task.objects.create(
            project=cls.project, title="Keyingi yilgi ish", created_by=cls.manager,
            status=TaskStatus.TODO)
        TaskAssignment.objects.create(task=cls.today_task, user=cls.dev)
        TaskAssignment.objects.create(task=cls.later_task, user=cls.dev)

    def my_work(self, **params):
        return self.client_for(self.dev).get("/api/my-work/", params).data

    def titles(self, data):
        return sorted(t["title"] for g in data["groups"] for t in g["tasks"])

    def test_qidiruv_vazifa_nomi_boyicha(self):
        self.assertEqual(self.titles(self.my_work(search="Bugungi")), ["Bugungi ish"])

    def test_qidiruv_kod_boyicha(self):
        self.assertEqual(self.titles(self.my_work(search=self.today_task.code)),
                         ["Bugungi ish"])

    def test_davr_boyicha_kesim(self):
        today = timezone.localdate()
        Task.objects.filter(pk=self.today_task.pk).update(
            due_date=timezone.make_aware(datetime.combine(today, dt_time(12, 0))))
        self.assertEqual(self.titles(self.my_work(period="today")), ["Bugungi ish"])

    def test_muddatsiz_ish_kesimga_tushmaydi(self):
        self.assertIsNone(self.later_task.due_date)
        self.assertEqual(self.my_work(period="year")["groups"], [])

    def test_aniq_sana_boyicha(self):
        Task.objects.filter(pk=self.later_task.pk).update(
            due_date=timezone.make_aware(datetime(2026, 8, 23, 10, 0)))
        self.assertEqual(self.titles(self.my_work(due="2026-08-23")), ["Keyingi yilgi ish"])

    def test_yaroqsiz_sana_400(self):
        r = self.client_for(self.dev).get("/api/my-work/", {"due": "23.08.2026"})
        self.assertEqual(r.status_code, 400)

    def test_yaroqsiz_davr_400(self):
        r = self.client_for(self.dev).get("/api/my-work/", {"period": "yillik"})
        self.assertEqual(r.status_code, 400)


class MeManagesProjectsTest(ApiTestCase):
    """`/auth/me/` dagi `manages_projects` - interfeys shunga qarab bo'linadi."""

    def me(self, user):
        return self.client_for(user).get("/api/auth/me/").data

    def test_menejer_uchun_rost(self):
        self.assertTrue(self.me(self.manager)["manages_projects"])

    def test_dasturchi_uchun_yolgon(self):
        self.assertFalse(self.me(self.dev)["manages_projects"])

    def test_admin_uchun_rost(self):
        self.assertTrue(self.me(self.admin)["manages_projects"])

    def test_loyihaga_menejer_qilib_qoyilgan_dasturchi(self):
        """Global roli «Dasturchi», lekin loyihani boshqaradi - ro'yxat unga ham kerak."""
        self.assertFalse(self.me(self.dev)["can_create_project"])
        ProjectMember.objects.filter(project=self.project, user=self.dev)\
            .update(role=ProjectRole.ADMIN)
        self.assertTrue(self.me(self.dev)["manages_projects"])


class WorkloadStatsTest(ApiTestCase):
    """Qator xulosasi: nechtasi bajarildi, nechtasi yo'q va necha foiz.

    Eng muhim qoida: xulosa RO'YXATDAN emas, alohida sanoqdan olinadi.
    Ro'yxat standart holatda bajarilganini yashiradi - agar xulosa ham
    o'sha ro'yxatdan olinsa, «Bajarilgan» doim nol bo'lib, butun
    ko'rsatkichning ma'nosi qolmasdi.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        made = []
        for title, status in [("Ish 1", TaskStatus.TODO),
                              ("Ish 2", TaskStatus.TODO),
                              ("Ish 3", TaskStatus.IN_PROGRESS),
                              ("Ish 4", TaskStatus.DONE),
                              ("Ish 5", TaskStatus.CANCELLED)]:
            task = Task.objects.create(project=cls.project, title=title,
                                       created_by=cls.manager, status=status)
            TaskAssignment.objects.create(task=task, user=cls.dev)
            made.append(task)
        cls.made = made

    def stats(self, **params):
        d = self.client_for(self.manager).get("/api/team/workload/", params).data
        row = next(r for r in d["developers"] if r["user"]["id"] == self.dev.pk)
        return row

    def test_holatlar_boyicha_sanoq(self):
        st = self.stats()["stats"]
        self.assertEqual(st["todo"], 2)
        self.assertEqual(st["in_progress"], 1)
        self.assertEqual(st["done"], 1)
        self.assertEqual(st["cancelled"], 1)

    def test_bajarilgan_standart_royxat_yashirsa_ham_sanaladi(self):
        """Ro'yxatda bajarilgani yo'q, xulosada esa bor - qoida shu."""
        row = self.stats()
        self.assertNotIn("Ish 4", [t["title"] for t in row["tasks"]])
        self.assertEqual(row["stats"]["done"], 1)

    def test_foiz_maxrajida_bekor_qilingani_yoq(self):
        """4 ta ish (bekor qilingani hisobga kirmaydi), 1 tasi bajarilgan -> 25%."""
        st = self.stats()["stats"]
        self.assertEqual(st["total"], 4)
        self.assertEqual(st["done_percent"], 25)

    def test_hammasi_bajarilsa_100_foiz(self):
        Task.objects.filter(pk__in=[t.pk for t in self.made]).exclude(
            status=TaskStatus.CANCELLED).update(status=TaskStatus.DONE)
        self.assertEqual(self.stats()["stats"]["done_percent"], 100)

    def test_muddati_otgan_sanoqda(self):
        past = timezone.now() - timezone.timedelta(days=3)
        Task.objects.filter(pk=self.made[0].pk).update(due_date=past)
        # Bajarilgan ishning muddati o'tgan hisoblanmaydi (`Task.is_overdue`).
        Task.objects.filter(pk=self.made[3].pk).update(due_date=past)
        self.assertEqual(self.stats()["stats"]["overdue"], 1)

    def test_xulosa_holat_filtridan_TASHQARI(self):
        """Holat tanlansa ro'yxat qisqaradi, xulosa esa o'zgarmaydi."""
        row = self.stats(status=TaskStatus.TODO)
        self.assertEqual([t["title"] for t in row["tasks"]], ["Ish 1", "Ish 2"])
        self.assertEqual(row["stats"]["total"], 4)
        self.assertEqual(row["stats"]["done"], 1)

    def test_xulosa_qolgan_kesimlarga_boysunadi(self):
        """Loyiha tanlansa foiz ham o'sha loyihaniki bo'ladi."""
        other = Project.objects.create(workspace=self.workspace, name="Ikkinchi",
                                       manager=self.manager, created_by=self.manager)
        ProjectMember.objects.create(project=other, user=self.manager,
                                     role=ProjectRole.MANAGER)
        ProjectMember.objects.create(project=other, user=self.dev,
                                     role=ProjectRole.DEVELOPER)
        task = Task.objects.create(project=other, title="Ikkinchidagi ish",
                                   created_by=self.manager, status=TaskStatus.DONE)
        TaskAssignment.objects.create(task=task, user=self.dev)
        st = self.stats(project=other.pk)["stats"]
        self.assertEqual(st["total"], 1)
        self.assertEqual(st["done_percent"], 100)


class WorkloadPaginationTest(ApiTestCase):
    """Ijrochilar ro'yxati o'ntadan sahifalanadi.

    O'ttiz kishilik jamoada ro'yxat bir necha ekran pastga cho'zilib
    ketardi va oxiridagi odam hech qachon ko'rilmasdi.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # `base` da bitta dasturchi bor - ustiga 24 ta qo'shamiz (jami 25).
        for i in range(24):
            person = make_user("dev{:02d}@sinov.uz".format(i), "Dasturchi {:02d}".format(i))
            ProjectMember.objects.create(project=cls.project, user=person,
                                         role=ProjectRole.DEVELOPER)

    def page(self, **params):
        r = self.client_for(self.manager).get("/api/team/workload/", params)
        self.assertEqual(r.status_code, 200)
        return r.data

    def test_birinchi_sahifada_10_kishi(self):
        d = self.page()
        self.assertEqual(len(d["developers"]), 10)
        self.assertEqual(d["page"], 1)
        self.assertEqual(d["page_size"], 10)

    def test_sanoq_jami_royxatniki(self):
        """Sarlavhadagi «N kishi» jamoaning kattaligini aytadi."""
        d = self.page()
        self.assertEqual(d["count"], 25)
        self.assertEqual(d["pages"], 3)

    def test_oxirgi_sahifada_qoldiq(self):
        d = self.page(page=3)
        self.assertEqual(len(d["developers"]), 5)

    def test_sahifalar_takrorlanmaydi(self):
        first = {r["user"]["id"] for r in self.page(page=1)["developers"]}
        second = {r["user"]["id"] for r in self.page(page=2)["developers"]}
        self.assertEqual(len(first & second), 0)

    def test_chegaradan_chiqqan_sahifa_oxirgisini_beradi(self):
        self.assertEqual(self.page(page=99)["page"], 3)

    def test_yaroqsiz_sahifa_400(self):
        r = self.client_for(self.manager).get("/api/team/workload/", {"page": "abc"})
        self.assertEqual(r.status_code, 400)

    def test_qidiruv_sahifalar_sonini_qayta_hisoblaydi(self):
        d = self.page(search="Dasturchi 03")
        self.assertEqual(d["count"], 1)
        self.assertEqual(d["pages"], 1)

    def test_boshqaruvsiz_odamga_javob_shakli_bir_xil(self):
        """Bo'sh qamrovda ham `pages` bo'lishi shart - interfeys uni o'qiydi."""
        d = self.client_for(self.outsider).get("/api/team/workload/").data
        self.assertEqual(d["developers"], [])
        self.assertEqual(d["pages"], 1)
        self.assertEqual(d["count"], 0)
