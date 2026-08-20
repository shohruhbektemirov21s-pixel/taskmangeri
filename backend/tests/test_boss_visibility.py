"""Boshliq nimani ko'radi va nimaga tegmaydi.

Boshliq (`GlobalRole.BOSS`) ilgari faqat takliflar bo'yicha qaror qilardi
va loyihalar tomonida oddiy odam edi: a'zo bo'lmagan loyihasi ko'rinmasdi.
Endi u butun tashkilotni KUZATADI. Shu bilan birga BOSHQARMAYDI - ikkovi
bir-biriga oqib ketmasligi kerak, aks holda «qaror qiladi, ishni jamoa
qiladi» degan taqsimot buzilardi.

Quyidagi testlar ikkala tomonni ham qulflaydi: ko'rinishning ochilganini
ham, huquqning kengaymaganini ham.
"""

from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.suggestions.models import Suggestion, SuggestionScope, SuggestionStatus
from apps.tasks.models import Task, TaskStatus
from apps.workspaces.models import Workspace

from .base import ApiTestCase, make_user


class BossProjectVisibilityTest(ApiTestCase):
    """Begona ish maydonidagi YOPIQ loyiha - boshliqqa ochiq, boshqaga yo'q."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.boss = make_user("boshliq@sinov.uz", "Katta Boshliq", role="BOSS")

        # Ataylab eng qattiq holat: boshqa maydon, `is_public=False` va
        # boshliq na maydonda, na loyihada a'zo emas.
        cls.other_ws = Workspace.objects.create(name="Begona maydon", owner=cls.admin,
                                                is_open=False)
        cls.other_project = Project.objects.create(
            workspace=cls.other_ws, name="Begona loyiha", manager=cls.admin,
            created_by=cls.admin, is_public=False)
        ProjectMember.objects.create(project=cls.other_project, user=cls.admin,
                                     role=ProjectRole.MANAGER)
        cls.other_task = Task.objects.create(
            project=cls.other_project, title="Begona ish", created_by=cls.admin)

    def setUp(self):
        super().setUp()
        self.boss_api = self.client_for(self.boss)

    # ------------------------------------------------------------- ko'radi
    def test_boshliq_azo_bolmagan_loyihani_ochadi(self):
        r = self.boss_api.get("/api/projects/{}/".format(self.other_project.pk))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["access"]["can_view"])
        self.assertTrue(r.data["access"]["is_boss"])
        self.assertFalse(r.data["access"]["is_member"])
        self.assertEqual(r.data["access"]["role_label"], "Boshliq")

    def test_boshliq_royxatda_hamma_loyihani_koradi(self):
        """Asosiy regressiya.

        `visible_projects_q` boshliq uchun bo'sh `Q()` qaytaradi, Django esa
        `Q() | Q(manager=user)` ni O'NG tomonga qisqartiradi. Shart shu
        holicha qoldirilsa, "hammasi yoki boshqaruvidagi" amalda "faqat
        boshqaruvidagi" bo'lib qolardi - boshliq esa hech nimani
        boshqarmaydi, ya'ni ro'yxati BO'SH chiqardi.
        """
        r = self.boss_api.get("/api/projects/", {"scope": "visible"})
        self.assertEqual(r.status_code, 200)
        ids = [p["id"] for p in r.data["results"]]
        self.assertIn(self.other_project.pk, ids)
        self.assertIn(self.project.pk, ids)

    def test_boshliq_begona_loyihaning_vazifalarini_koradi(self):
        ids = [t["id"] for t in self.boss_api.get("/api/tasks/").data["results"]]
        self.assertIn(self.other_task.pk, ids)

    def test_boshliq_yopiq_ish_maydonini_ochadi(self):
        """Loyiha ko'ringan joyda uning maydoni ham ochilishi kerak.

        Aks holda loyiha sahifasidagi maydon havolasi 404 berardi - ya'ni
        ko'rish huquqi havolaning yarmida uzilardi.
        """
        r = self.boss_api.get("/api/workspaces/{}/".format(self.other_ws.slug))
        self.assertEqual(r.status_code, 200)

    def test_boshliq_paneli_butun_tizim_boyicha(self):
        d = self.boss_api.get("/api/dashboard/").data
        self.assertEqual(d["scope"], "all")

    def test_boshliq_umumiy_tarixda_begona_loyihani_koradi(self):
        Project.objects.filter(pk=self.other_project.pk).update(name="Begona loyiha")
        r = self.boss_api.get("/api/activity/by-project/")
        self.assertEqual(r.status_code, 200)
        ids = [p["id"] for p in (r.data["results"] if "results" in r.data else r.data)]
        self.assertIn(self.other_project.pk, ids)

    # ------------------------------------------------- va hamma amalni qiladi
    def test_boshliq_loyihani_tahrirlay_oladi(self):
        r = self.boss_api.patch("/api/projects/{}/".format(self.other_project.pk),
                                {"name": "Boshliq qo'ygan nom"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.other_project.refresh_from_db()
        self.assertEqual(self.other_project.name, "Boshliq qo'ygan nom")

    def test_boshliq_vazifa_yarata_oladi(self):
        r = self.boss_api.post("/api/tasks/", {"project": self.other_project.pk,
                                               "title": "Boshliq bergan ish"}, format="json")
        self.assertEqual(r.status_code, 201)

    def test_boshliq_vazifani_tekshira_oladi(self):
        Task.objects.filter(pk=self.other_task.pk).update(status=TaskStatus.IN_REVIEW)
        r = self.boss_api.post("/api/tasks/{}/review/".format(self.other_task.pk),
                               {"verdict": "APPROVED"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.other_task.refresh_from_db()
        self.assertEqual(self.other_task.status, TaskStatus.DONE)

    def test_boshliq_azo_qosha_oladi(self):
        r = self.boss_api.post("/api/projects/{}/members/add/".format(self.other_project.pk),
                               {"user_id": self.dev.pk}, format="json")
        self.assertEqual(r.status_code, 201)

    def test_boshliq_loyihani_ochira_oladi(self):
        """O'chirish `can_manage` dan o'tmaydi - o'z sharti bor edi.

        `destroy` va `perform_destroy` ichida qoida qo'lda yozilgan va
        `ProjectAccess` dan uzilib qolgan edi: boshliqqa boshqaruv
        berilgani bilan o'chirish jimgina 403 berardi.

        Tugallanmagan ish borligi uchun avval 409 (tasdiq so'raladi),
        keyin `?confirm=1` bilan o'chadi - ikkala yo'l ham tekshiriladi.
        """
        url = "/api/projects/{}/".format(self.other_project.pk)

        r = self.boss_api.delete(url)
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.data["needs_confirm"])

        r = self.boss_api.delete(url + "?confirm=1")
        self.assertEqual(r.status_code, 204)
        self.other_project.refresh_from_db()
        self.assertIsNotNone(self.other_project.deleted_at)

    def test_loyiha_admini_hamon_ochira_olmaydi(self):
        """O'chirish TAHRIRLASHDAN tor bo'lib qolsin.

        Loyiha admini sozlamalarni o'zgartiradi (`can_manage`), lekin
        butun loyihani yo'q qila olmaydi. Boshliqqa huquq berilgani bu
        chegarani surib yubormasligi kerak.
        """
        ProjectMember.objects.create(project=self.other_project, user=self.outsider,
                                     role=ProjectRole.ADMIN)
        c = self.client_for(self.outsider)
        acc = c.get("/api/projects/{}/".format(self.other_project.pk)).data["access"]
        self.assertTrue(acc["can_manage"])
        self.assertFalse(acc["can_delete_project"])

        r = c.delete("/api/projects/{}/?confirm=1".format(self.other_project.pk))
        self.assertEqual(r.status_code, 403)

    def test_boshliq_yangi_loyiha_ocha_oladi(self):
        r = self.boss_api.post("/api/projects/", {"name": "Boshliq loyihasi",
                                                  "workspace": self.workspace.pk},
                               format="json")
        self.assertEqual(r.status_code, 201)

    def test_boshliq_access_hamma_huquqni_ochiq_deb_qaytaradi(self):
        acc = self.boss_api.get(
            "/api/projects/{}/".format(self.other_project.pk)).data["access"]
        for key in ("can_view", "can_manage", "can_create_task", "can_delete_task",
                    "can_review", "can_work"):
            self.assertTrue(acc[key], key)
        # `can_appoint_admin` ATAYLAB ro'yxatda yo'q: u loyiha roli emas,
        # odamning TIZIM rolini `ADMIN` ga o'tkazadi. Pastdagi
        # `test_boshliq_tizim_admini_emas` uni alohida qulflaydi.
        self.assertFalse(acc["can_appoint_admin"])

    # ------------------------------------------------------ bitta chegara bor
    def test_boshliq_ham_menejerga_tegolmaydi(self):
        """Menejer himoyasi rolga emas, MENEJERLIKKA bog'langan.

        Uni na tizim admini, na boshqa menejer, na boshliq chiqara oladi -
        menejer loyihadan faqat o'zi chiqadi. Boshliqqa hamma huquq
        berilgani bu qulfni ochib yubormasligi kerak.
        """
        member = ProjectMember.objects.get(project=self.other_project, user=self.admin)
        r = self.boss_api.post(
            "/api/projects/{}/members/{}/".format(self.other_project.pk, member.pk),
            {"action": "remove"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(
            ProjectMember.objects.filter(pk=member.pk, is_active=True).exists())

    def test_boshliq_tizim_admini_emas(self):
        """`django-admin` va foydalanuvchi rollari boshliqqa ochilmaydi.

        Rollar ataylab ajratilgan: admin tizimni ushlab turadi, boshliq
        ishni boshqaradi. «Hamma imkoniyat» loyihalar doirasida.
        """
        acc = self.boss_api.get(
            "/api/projects/{}/".format(self.other_project.pk)).data["access"]
        self.assertFalse(acc["is_admin"])
        self.assertTrue(acc["is_boss"])
        # Foydalanuvchi rolini o'zgartirish - `IsPlatformAdmin` ostida.
        r = self.boss_api.patch("/api/users/{}/role/".format(self.dev.pk),
                                {"global_role": "MANAGER"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_loyiha_sahifasidan_ham_tizim_admini_tayinlab_bolmaydi(self):
        """Yuqoridagi qulfning IKKINCHI eshigi.

        `/api/users/:id/role/` yopiq edi-yu, loyiha a'zolari ro'yxatidagi
        «Admin qilish» tugmasi ayni o'sha ishni qilardi: `global_role` ni
        `ADMIN` ga o'tkazardi. Ya'ni boshliq (va istalgan loyiha menejeri)
        qulfni yonidan aylanib o'ta olardi.
        """
        member = ProjectMember.objects.create(
            project=self.other_project, user=self.dev, role=ProjectRole.DEVELOPER)
        r = self.boss_api.post(
            "/api/projects/{}/members/{}/".format(self.other_project.pk, member.pk),
            {"action": "appoint_admin"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.dev.refresh_from_db()
        self.assertFalse(self.dev.is_platform_admin)

    # ------------------------------------------------- boshqalar kengaymadi
    def test_oddiy_dasturchi_uchun_hech_narsa_ozgarmadi(self):
        """Qulf: boshliqqa ochilgan eshik hammaga ochilib ketmasin."""
        c = self.client_for(self.outsider)
        self.assertEqual(
            c.get("/api/projects/{}/".format(self.other_project.pk)).status_code, 403)
        ids = [p["id"] for p in c.get("/api/projects/", {"scope": "visible"}).data["results"]]
        self.assertNotIn(self.other_project.pk, ids)
        task_ids = [t["id"] for t in c.get("/api/tasks/").data["results"]]
        self.assertNotIn(self.other_task.pk, task_ids)


class BossSuggestionFiltersTest(ApiTestCase):
    """Boshliq profilidagi uch kesim: barchasi, tasdiqlangan, rad etilgan.

    Filtrlarning o'zi serverda allaqachon bor edi (`?status=`, `?scope=`) -
    bu testlar ular boshliq uchun AYNAN kutilgan to'plamni berishini va
    oddiy odamga hech narsa ochilmasligini qulflaydi.
    """

    URL = "/api/suggestions/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.boss = make_user("boshliq@sinov.uz", "Katta Boshliq", role="BOSS")

        def make(title, scope, status):
            return Suggestion.objects.create(
                title=title, body="Taklif matni - tafsilot shu yerda.",
                author=cls.dev, scope=scope, status=status)

        cls.open_pending = make("Ochiq kutilmoqda", SuggestionScope.OPEN,
                                SuggestionStatus.PENDING)
        cls.open_approved = make("Ochiq tasdiqlangan", SuggestionScope.OPEN,
                                 SuggestionStatus.APPROVED)
        cls.closed_rejected = make("Yopiq rad etilgan", SuggestionScope.CLOSED,
                                   SuggestionStatus.REJECTED)
        cls.closed_approved = make("Yopiq tasdiqlangan", SuggestionScope.CLOSED,
                                   SuggestionStatus.APPROVED)

        # ANONIM takliflar. Ikkinchisi ataylab YOPIQ va anonim: serializer
        # bunday juftlikni endi rad etadi, lekin qoida joriy qilinishidan
        # oldin yozilgan yozuv bazada qolgan bo'lishi mumkin. Boshliqning
        # yangi «Barcha takliflar» bo'limi aynan shundaylarni ekranga
        # olib chiqadi - shuning uchun qulf bazadagi yozuv darajasida.
        cls.anon_open = make("Anonim ochiq", SuggestionScope.OPEN,
                             SuggestionStatus.PENDING)
        cls.anon_open.is_anonymous = True
        cls.anon_open.save(update_fields=["is_anonymous"])

        cls.anon_closed = make("Anonim yopiq", SuggestionScope.CLOSED,
                               SuggestionStatus.APPROVED)
        cls.anon_closed.is_anonymous = True
        cls.anon_closed.save(update_fields=["is_anonymous"])

    def setUp(self):
        super().setUp()
        self.boss_api = self.client_for(self.boss)

    def ids(self, response):
        rows = response.json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        return [r["id"] for r in rows]

    def test_barchasi_ochiq_va_yopiqni_birga_beradi(self):
        """Filtrsiz so'rov - «Barcha takliflar» bo'limi."""
        ids = self.ids(self.boss_api.get(self.URL))
        self.assertCountEqual(ids, [self.open_pending.pk, self.open_approved.pk,
                                    self.closed_rejected.pk, self.closed_approved.pk,
                                    self.anon_open.pk, self.anon_closed.pk])

    def test_tasdiqlangan_kesimi_turdan_qatiy_nazar_yigadi(self):
        ids = self.ids(self.boss_api.get(self.URL, {"status": "APPROVED"}))
        self.assertCountEqual(ids, [self.open_approved.pk, self.closed_approved.pk,
                                    self.anon_closed.pk])

    def test_rad_etilgan_kesimi(self):
        ids = self.ids(self.boss_api.get(self.URL, {"status": "REJECTED"}))
        self.assertEqual(ids, [self.closed_rejected.pk])

    def test_oddiy_odamga_kesim_yopiq_taklifni_ochmaydi(self):
        """Eng muhim qulf: `status` filtri ko'rinish qoidasini aylanib o'tmasin.

        Chetdagi odam «tasdiqlanganlar» ni so'rasa ham, unga faqat OCHIQ
        tasdiqlangan taklif chiqadi - yopig'i muallif va boshliqniki.
        """
        c = self.client_for(self.outsider)
        ids = self.ids(c.get(self.URL, {"status": "APPROVED"}))
        self.assertEqual(ids, [self.open_approved.pk])

        ids = self.ids(c.get(self.URL, {"status": "REJECTED"}))
        self.assertEqual(ids, [])

        # Filtrsiz so'rov ham yopiqni bermaydi.
        ids = self.ids(c.get(self.URL))
        self.assertCountEqual(ids, [self.open_pending.pk, self.open_approved.pk,
                                    self.anon_open.pk])

    def test_muallif_oz_yopiq_taklifini_kesimda_ham_koradi(self):
        ids = self.ids(self.client_for(self.dev).get(self.URL, {"status": "REJECTED"}))
        self.assertEqual(ids, [self.closed_rejected.pk])

    # --------------------------------------------------------- anonimlik
    def rows(self, response):
        data = response.json()
        return data["results"] if isinstance(data, dict) else data

    def test_anonim_muallif_boshliqqa_ham_korinmaydi(self):
        """Yangi bo'limlar anonimlikni ochib yubormasin.

        «Barcha takliflar» endi YOPIQ takliflarni ham ekranga chiqaradi.
        Ular orasida anonim yozuv bo'lsa (qoida joriy qilinishidan oldin
        yaratilgan), muallifi baribir chiqmasligi kerak - anonimlik
        boshliq uchun ham istisnosiz.
        """
        by_id = {r["id"]: r for r in self.rows(self.boss_api.get(self.URL))}
        for suggestion in (self.anon_open, self.anon_closed):
            row = by_id[suggestion.pk]
            self.assertIsNone(row["author"], suggestion.title)
            self.assertTrue(row["is_anonymous"])

        # Anonim bo'lmagani esa oldingidek muallifi bilan keladi.
        self.assertIsNotNone(by_id[self.open_pending.pk]["author"])

    def test_anonim_muallif_kesimlarda_ham_yashirin(self):
        row = next(r for r in self.rows(self.boss_api.get(self.URL, {"status": "APPROVED"}))
                   if r["id"] == self.anon_closed.pk)
        self.assertIsNone(row["author"])

    def test_anonim_taklifning_javobida_muallif_izi_qolmaydi(self):
        """Ism `author` dan boshqa maydonga ham sizib chiqmasin.

        Tekshiruv ANONIM qatorning butun matni bo'yicha: `author` ni
        `None` qilib qo'yib, ismni masalan fayl yozuvida qoldirib
        yuborish oson bo'lardi. Anonim bo'lmagan takliflar bu tekshiruvga
        kirmaydi - ularda muallif ko'rinishi TO'G'RI.
        """
        import json

        rows = {r["id"]: r for r in self.rows(self.boss_api.get(self.URL))}
        for suggestion in (self.anon_open, self.anon_closed):
            raw = json.dumps(rows[suggestion.pk], ensure_ascii=False)
            self.assertNotIn(self.dev.full_name, raw, suggestion.title)
            self.assertNotIn(self.dev.email, raw, suggestion.title)


class SuggestionDecisionIsBossOnlyTest(ApiTestCase):
    """Taklifni tasdiqlash/rad etish - FAQAT boshliqda.

    Loyiha menejeriga hamma loyiha ko'rinadigan bo'ldi va bu huquq
    takliflarga O'TMASLIGI kerak: menejer taklifni o'qiydi va ovoz
    beradi, qaror esa boshliqniki. Tizim admini ham qila olmaydi -
    qoida ilgaridan shunday.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.boss = make_user("boshliq@sinov.uz", "Katta Boshliq", role="BOSS")
        cls.suggestion = Suggestion.objects.create(
            title="Ish vaqtini moslashuvchan qilaylik",
            body="Ertalab 8 dan 11 gacha boshlash imkoni bo'lsin.",
            author=cls.dev, scope=SuggestionScope.OPEN)

    def decide(self, user, status="APPROVED"):
        return self.client_for(user).post(
            "/api/suggestions/{}/decide/".format(self.suggestion.pk),
            {"status": status, "note": "izoh"}, format="json")

    def test_loyiha_menejeri_tasdiqlay_olmaydi(self):
        self.assertEqual(self.decide(self.manager).status_code, 403)
        self.suggestion.refresh_from_db()
        self.assertEqual(self.suggestion.status, SuggestionStatus.PENDING)

    def test_loyiha_menejeri_rad_ham_eta_olmaydi(self):
        self.assertEqual(self.decide(self.manager, "REJECTED").status_code, 403)

    def test_tizim_admini_ham_tasdiqlay_olmaydi(self):
        self.assertEqual(self.decide(self.admin).status_code, 403)

    def test_boshliq_tasdiqlaydi(self):
        self.assertEqual(self.decide(self.boss).status_code, 200)
        self.suggestion.refresh_from_db()
        self.assertEqual(self.suggestion.status, SuggestionStatus.APPROVED)
        self.assertEqual(self.suggestion.decided_by_id, self.boss.pk)


class GlobalManagerSeesAllProjectsTest(ApiTestCase):
    """Loyiha menejeri (global rol) hamma loyihani KO'RADI, boshqarmaydi.

    Talab: menejer yangi loyiha ochilishini kutmasin - ro'yxatda hammasi
    tursin. Chegara esa saqlanadi: begona loyihada u kuzatuvchi.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # Boshqa maydondagi YOPIQ loyiha: `cls.manager` unda hech kim emas.
        cls.other_ws = Workspace.objects.create(name="Begona maydon", owner=cls.admin,
                                                is_open=False)
        cls.other_project = Project.objects.create(
            workspace=cls.other_ws, name="Begona loyiha", manager=cls.admin,
            created_by=cls.admin, is_public=False)
        ProjectMember.objects.create(project=cls.other_project, user=cls.admin,
                                     role=ProjectRole.MANAGER)
        cls.other_task = Task.objects.create(
            project=cls.other_project, title="Begona ish", created_by=cls.admin)

    def setUp(self):
        super().setUp()
        self.mgr = self.client_for(self.manager)

    def test_menejer_begona_loyihani_royxatda_koradi(self):
        ids = [p["id"] for p in
               self.mgr.get("/api/projects/", {"scope": "visible"}).data["results"]]
        self.assertIn(self.other_project.pk, ids)

    def test_menejer_begona_loyihani_ochadi(self):
        r = self.mgr.get("/api/projects/{}/".format(self.other_project.pk))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["access"]["can_view"])

    def test_menejer_begona_loyihaning_vazifalarini_koradi(self):
        ids = [t["id"] for t in self.mgr.get("/api/tasks/").data["results"]]
        self.assertIn(self.other_task.pk, ids)

    def test_menejer_begona_loyihani_boshqara_olmaydi(self):
        """Ko'rish ochildi, BOSHQARUV ochilmadi - eng muhim chegara."""
        acc = self.mgr.get(
            "/api/projects/{}/".format(self.other_project.pk)).data["access"]
        self.assertFalse(acc["can_manage"])
        self.assertFalse(acc["can_create_task"])
        self.assertFalse(acc["can_review"])

        r = self.mgr.patch("/api/projects/{}/".format(self.other_project.pk),
                           {"name": "Menejer qo'ygan nom"}, format="json")
        self.assertEqual(r.status_code, 403)

        r = self.mgr.post("/api/tasks/", {"project": self.other_project.pk,
                                          "title": "Begona ish"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_menejer_oz_loyihasini_oldingidek_boshqaradi(self):
        acc = self.mgr.get("/api/projects/{}/".format(self.project.pk)).data["access"]
        self.assertTrue(acc["can_manage"])
        self.assertTrue(acc["can_review"])

    def test_dasturchiga_hech_narsa_ochilmadi(self):
        """Kengaytma global roli MANAGER bo'lganlarga - hammaga emas."""
        c = self.client_for(self.outsider)
        self.assertEqual(
            c.get("/api/projects/{}/".format(self.other_project.pk)).status_code, 403)
        ids = [p["id"] for p in c.get("/api/projects/", {"scope": "visible"}).data["results"]]
        self.assertNotIn(self.other_project.pk, ids)
