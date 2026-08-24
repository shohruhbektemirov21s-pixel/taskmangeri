"""Takliflar: kim ko'radi, kim ovoz beradi, kim qaror qiladi.

Bu yerdagi testlar uchta va'dani qulflaydi — ular buzilsa xususiyatning
o'zi ma'nosini yo'qotadi:

  1. **Yopiq taklif** muallif va boshliqdan boshqa hech kimga ko'rinmaydi.
  2. **Anonim muallif** hech kimga — boshliqqa ham — ochilmaydi.
  3. **Kim ovoz bergani** javobda umuman uchramaydi: faqat sonlar va
     so'rayotgan odamning o'z tanlovi chiqadi.

Fayllar odatdagi `MEDIA_ROOT` ga tushadi va testdan keyin o'chiriladi —
sababi `test_media.py` ning boshida yozilgan.
"""

import os

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.notifications.models import Notification, NotificationKind
from apps.suggestions.models import (Suggestion, SuggestionFile, SuggestionScope,
                                     SuggestionStatus, SuggestionVote, VoteChoice)

from .base import ApiTestCase, make_user

URL = "/api/suggestions/"


class SuggestionTestCase(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.boss = make_user("boshliq@sinov.uz", "Katta Boshliq", role="BOSS")

    def setUp(self):
        super().setUp()
        self.dev_api = self.client_for(self.dev)
        self.boss_api = self.client_for(self.boss)

    def make(self, author=None, **kw):
        data = {"title": "Ish vaqtini moslashuvchan qilaylik",
                "body": "Ertalab 9 emas, 8 dan 11 gacha boshlash imkoni bo'lsin.",
                "author": author or self.dev}
        data.update(kw)
        return Suggestion.objects.create(**data)

    def ids(self, response):
        rows = response.json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        return [r["id"] for r in rows]


class VisibilityTest(SuggestionTestCase):
    """Ochiq — hammaga; yopiq — faqat muallif va boshliq."""

    def test_ochiq_taklifni_hamma_koradi(self):
        item = self.make()
        for client in (self.api, self.dev_api, self.boss_api, self.client_for(self.outsider)):
            self.assertIn(item.id, self.ids(client.get(URL)))

    def test_yopiq_taklif_begonaga_korinmaydi(self):
        item = self.make(scope=SuggestionScope.CLOSED)
        self.assertNotIn(item.id, self.ids(self.api.get(URL)))
        self.assertEqual(self.api.get("%s%d/" % (URL, item.id)).status_code, 404)

    def test_yopiq_taklifni_muallif_va_boshliq_koradi(self):
        item = self.make(scope=SuggestionScope.CLOSED)
        self.assertIn(item.id, self.ids(self.dev_api.get(URL)))
        self.assertIn(item.id, self.ids(self.boss_api.get(URL)))

    def test_kesimlar_ajratiladi(self):
        opened = self.make()
        closed = self.make(scope=SuggestionScope.CLOSED)
        self.assertEqual(self.ids(self.boss_api.get(URL, {"scope": "OPEN"})), [opened.id])
        self.assertEqual(self.ids(self.boss_api.get(URL, {"scope": "CLOSED"})), [closed.id])

    def test_tokensiz_ochilmaydi(self):
        self.make()
        self.assertEqual(self.anon.get(URL).status_code, 401)


class AnonymityTest(SuggestionTestCase):
    """Anonim taklifda muallif hech kimga ko'rsatilmaydi."""

    def test_muallif_boshliqqa_ham_korinmaydi(self):
        item = self.make(is_anonymous=True)
        row = self.boss_api.get("%s%d/" % (URL, item.id)).json()
        self.assertIsNone(row["author"])
        self.assertNotIn(self.dev.full_name, str(row))

    def test_muallif_ozi_meniki_ekanini_biladi(self):
        item = self.make(is_anonymous=True)
        row = self.dev_api.get("%s%d/" % (URL, item.id)).json()
        self.assertTrue(row["is_mine"])
        self.assertTrue(row["can_edit"])
        self.assertIsNone(row["author"])

    def test_yopiq_taklif_ham_anonim_bola_oladi(self):
        """Eng og'ir mavzu aynan yopiqda yoziladi - ism majburiy bo'lmasin.

        Ilgari bu 400 qaytarardi va ismini yashirmoqchi bo'lgan odamning
        yagona yo'li taklifni OCHIQ qilish - butun jamoa oldida aytish edi.
        """
        response = self.dev_api.post(URL, {
            "title": "Maosh haqida gap bor",
            "body": "Buni jamoa oldida emas, yakkama-yakka aytmoqchiman.",
            "scope": "CLOSED", "is_anonymous": True}, format="json")
        self.assertEqual(response.status_code, 201)

        # Boshliq ko'radi, lekin kim yozganini BILMAYDI.
        row = self.boss_api.get("%s%d/" % (URL, response.json()["id"])).json()
        self.assertEqual(row["scope"], "CLOSED")
        self.assertTrue(row["is_anonymous"])
        self.assertIsNone(row["author"])
        self.assertNotIn(self.dev.full_name, str(row))


class VoteTest(SuggestionTestCase):
    """Uchta tugma, sonlar va tartib. Kim bosgani hech qayerda chiqmaydi."""

    def test_ovoz_beriladi_almashadi_va_olinadi(self):
        item = self.make(author=self.manager)
        url = "%s%d/vote/" % (URL, item.id)

        row = self.dev_api.post(url, {"choice": "FOR"}, format="json").json()
        self.assertEqual((row["for_count"], row["my_vote"]), (1, "FOR"))

        # Fikri o'zgardi - yangi qator emas, o'sha ovoz almashadi.
        row = self.dev_api.post(url, {"choice": "AGAINST"}, format="json").json()
        self.assertEqual((row["for_count"], row["against_count"]), (0, 1))
        self.assertEqual(SuggestionVote.objects.filter(suggestion=item).count(), 1)

        # O'sha tugma qayta bosilsa - ovoz olib tashlanadi.
        row = self.dev_api.post(url, {"choice": "AGAINST"}, format="json").json()
        self.assertEqual((row["against_count"], row["my_vote"]), (0, None))
        self.assertEqual(SuggestionVote.objects.filter(suggestion=item).count(), 0)

    def test_kim_ovoz_bergani_javobda_yoq(self):
        item = self.make(author=self.manager)
        self.dev_api.post("%s%d/vote/" % (URL, item.id), {"choice": "FOR"}, format="json")

        row = self.boss_api.get("%s%d/" % (URL, item.id)).json()
        self.assertEqual(row["for_count"], 1)
        # Boshliq ham, boshqa ham ovoz bergan odamni ko'rmaydi.
        self.assertNotIn(self.dev.full_name, str(row))
        self.assertNotIn(self.dev.email, str(row))
        self.assertIsNone(row["my_vote"])

    def test_kop_yoqqan_taklif_birinchi_turadi(self):
        quiet = self.make(author=self.manager, title="Kam quvvatlangan taklif")
        loud = self.make(author=self.manager, title="Ko'p quvvatlangan taklif")

        for user in (self.dev, self.admin, self.outsider):
            self.client_for(user).post("%s%d/vote/" % (URL, loud.id),
                                       {"choice": "FOR"}, format="json")
        self.dev_api.post("%s%d/vote/" % (URL, quiet.id), {"choice": "AGAINST"},
                          format="json")

        self.assertEqual(self.ids(self.boss_api.get(URL, {"scope": "OPEN"})),
                         [loud.id, quiet.id])

    def test_yopiq_taklifga_ovoz_berilmaydi(self):
        item = self.make(scope=SuggestionScope.CLOSED)
        response = self.dev_api.post("%s%d/vote/" % (URL, item.id),
                                     {"choice": "FOR"}, format="json")
        # Begona odam yopiq taklifni umuman ko'rmaydi (404), muallif esa
        # ovoz bera olmaydi (400) - ikkalasi ham ovozsiz tugaydi.
        self.assertEqual(response.status_code, 400)
        self.assertEqual(SuggestionVote.objects.count(), 0)


class OwnerTest(SuggestionTestCase):
    """Tahrirlash va o'chirish - faqat taklif bergan odamga."""

    def test_muallif_tahrirlaydi_va_ochiradi(self):
        item = self.make()
        response = self.dev_api.patch("%s%d/" % (URL, item.id),
                                      {"title": "Yangilangan sarlavha"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.dev_api.delete("%s%d/" % (URL, item.id)).status_code, 204)
        self.assertFalse(Suggestion.objects.filter(pk=item.id).exists())

    def test_begona_odam_tegolmaydi(self):
        item = self.make()
        self.assertEqual(self.api.patch("%s%d/" % (URL, item.id),
                                        {"title": "Boshqa sarlavha"}, format="json").status_code,
                         403)
        self.assertEqual(self.api.delete("%s%d/" % (URL, item.id)).status_code, 403)

    def test_boshliq_ham_tegolmaydi(self):
        """Boshliq qaror qiladi, lekin birovning taklifini o'zgartirmaydi."""
        item = self.make()
        self.assertEqual(self.boss_api.delete("%s%d/" % (URL, item.id)).status_code, 403)

    def test_tahrirdan_keyin_qaror_bekor_boladi(self):
        item = self.make()
        self.boss_api.post("%s%d/decide/" % (URL, item.id),
                           {"status": "APPROVED"}, format="json")

        row = self.dev_api.patch("%s%d/" % (URL, item.id),
                                 {"body": "Matn butunlay boshqacha yozildi."},
                                 format="json").json()
        self.assertEqual(row["status"], SuggestionStatus.PENDING)
        self.assertIsNone(row["decided_by"])
        self.assertEqual(row["decision_note"], "")


class DecisionTest(SuggestionTestCase):
    """Tasdiqlash, rad etish va izoh - faqat boshliqda."""

    def test_boshliq_tasdiqlaydi(self):
        item = self.make()
        row = self.boss_api.post("%s%d/decide/" % (URL, item.id),
                                 {"status": "APPROVED", "note": "Ma'qul, keyingi oydan."},
                                 format="json").json()
        self.assertEqual(row["status"], SuggestionStatus.APPROVED)
        self.assertEqual(row["decided_by"]["id"], self.boss.id)
        self.assertEqual(row["decision_note"], "Ma'qul, keyingi oydan.")

    def test_rad_etish_sababsiz_qolmaydi(self):
        item = self.make()
        response = self.boss_api.post("%s%d/decide/" % (URL, item.id),
                                      {"status": "REJECTED"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_faqat_izoh_qoldirsa_holat_ozgarmaydi(self):
        item = self.make()
        row = self.boss_api.post("%s%d/decide/" % (URL, item.id),
                                 {"note": "Savol bor: byudjet qayerdan?"},
                                 format="json").json()
        self.assertEqual(row["status"], SuggestionStatus.PENDING)
        self.assertEqual(row["decision_note"], "Savol bor: byudjet qayerdan?")

    def test_boshqalar_qaror_qila_olmaydi(self):
        item = self.make()
        for client in (self.api, self.dev_api, self.client_for(self.admin)):
            response = client.post("%s%d/decide/" % (URL, item.id),
                                   {"status": "APPROVED"}, format="json")
            self.assertEqual(response.status_code, 403)

    def test_yopiq_taklif_ham_boshliqqa_boradi(self):
        item = self.make(scope=SuggestionScope.CLOSED)
        response = self.boss_api.post("%s%d/decide/" % (URL, item.id),
                                      {"status": "APPROVED"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_navbat_soni_boshliqqa_korinadi(self):
        self.make()
        self.make(scope=SuggestionScope.CLOSED)
        boss_counts = self.boss_api.get(URL + "counts/").json()
        self.assertEqual((boss_counts["open"], boss_counts["closed"],
                          boss_counts["pending"]), (1, 1, 2))
        # Begona odam yopiq taklifni sanamaydi ham.
        counts = self.api.get(URL + "counts/").json()
        self.assertEqual((counts["open"], counts["closed"], counts["pending"]), (1, 0, 0))


    def test_filtr_nishonlaridagi_sonlar(self):
        """Nishondagi son ro'yxat bilan BIR XIL ko'rinish shartidan chiqadi.

        Ajralib qolsa «Tasdiqlangan 6» deb yozilib, ichida to'rttasi
        turardi - son ro'yxat sahifalangani uchun ekrandan sanalmaydi.
        """
        self.make()                                     # ochiq, javob kutyapti
        approved = self.make()
        self.boss_api.post("%s%d/decide/" % (URL, approved.id),
                           {"status": "APPROVED"}, format="json")
        self.make(scope=SuggestionScope.CLOSED)         # yopiq - begonaga ko'rinmaydi

        boss = self.boss_api.get(URL + "counts/").json()
        self.assertEqual(boss["all"], 3)
        self.assertEqual(boss[SuggestionStatus.PENDING], 2)
        self.assertEqual(boss[SuggestionStatus.APPROVED], 1)
        self.assertEqual(boss[SuggestionStatus.REJECTED], 0)

        # Begona odam yopiq taklifni sanamaydi - ro'yxatda ham ko'rmaydi.
        seen = self.api.get(URL + "counts/").json()
        self.assertEqual(seen["all"], 2)
        self.assertEqual(seen["all"], self.api.get(URL).json()["count"])

    def test_ozimniki_soni(self):
        self.make()
        self.assertEqual(self.api.get(URL + "counts/").json()["mine"], 0)
        self.assertEqual(self.boss_api.get(URL + "counts/").json()["mine"], 0)

    def test_saralash_tanlovi(self):
        """Standart tartib - OVOZ bo'yicha; «eng yangi» esa tanlov."""
        eski = self.make(title="Eski taklif")
        yangi = self.make(title="Yangi taklif")
        # Eskisiga ovoz beramiz: standart tartibda u tepaga chiqadi.
        self.dev_api.post("%s%d/vote/" % (URL, eski.id), {"choice": "FOR"}, format="json")

        def titles(params=""):
            return [r["title"] for r in self.api.get(URL + params).json()["results"]]

        self.assertEqual(titles()[0], "Eski taklif")
        self.assertEqual(titles("?sort=new")[0], "Yangi taklif")
        self.assertEqual(titles("?sort=old")[0], "Eski taklif")
        # Notanish qiymat standartga qaytadi - 400 emas.
        self.assertEqual(titles("?sort=allaqanday")[0], "Eski taklif")


class FilterTest(SuggestionTestCase):
    """Ro'yxat ustidagi filtrlar: qidiruv va sana kesimi.

    Kesish SERVERDA bo'ladi - ro'yxat sahifalangan va brauzerda filtrlash
    faqat ochilgan sahifani qirqardi: «topilmadi» degan javob aslida
    «birinchi o'ttiztada yo'q» degani bo'lib qolardi.
    """

    def test_qidiruv_sarlavha_va_matndan_topadi(self):
        one = self.make(title="Kutubxona sotib olaylik",
                        body="Jamoaga texnik kitoblar kerak.")
        two = self.make(title="Ish stollarini yangilaylik",
                        body="Eski stollar past va noqulay.")

        self.assertEqual(self.ids(self.api.get(URL, {"search": "kutubxona"})), [one.id])
        # Matn ichidan ham topiladi - Db2 da `body` CLOB, LIKE unga qo'llanadi.
        self.assertEqual(self.ids(self.api.get(URL, {"search": "noqulay"})), [two.id])
        self.assertEqual(self.ids(self.api.get(URL, {"search": "umuman yo'q"})), [])

    def test_qidiruv_muallif_ismi_boyicha(self):
        mine = self.make(author=self.dev, title="Dasturchining taklifi")
        self.make(author=self.manager, title="Menejerning taklifi")
        self.assertEqual(self.ids(self.api.get(URL, {"search": "Dasturchi Ali"})), [mine.id])

    def test_anonim_taklif_ism_boyicha_topilmaydi(self):
        """Anonimlik qidiruv orqali ham buzilmaydi.

        Aks holda ro'yxatda muallif ko'rsatilmaydi-yu, ismini qidiruvga
        yozib uning yozganini topib olish mumkin bo'lardi - boshliq uchun ham.
        """
        hidden = self.make(author=self.dev, title="Anonim gap", is_anonymous=True)
        for client in (self.api, self.boss_api, self.dev_api):
            self.assertNotIn(hidden.id, self.ids(client.get(URL, {"search": "Dasturchi Ali"})))
        # Sarlavhasi bo'yicha esa odatdagidek topiladi - LEKIN uni ko'ra
        # oladigan odam uchun. Anonim taklif oddiy foydalanuvchiga umuman
        # chiqmaydi (`visible`), shuning uchun bu yerda boshliq qidiradi.
        self.assertIn(hidden.id, self.ids(self.boss_api.get(URL, {"search": "Anonim gap"})))

    def test_sana_va_davr_kesimi(self):
        """Kesim taklif QACHON yozilgani bo'yicha - `created_at`."""
        bugun = self.make(title="Bugungi taklif")
        eski = self.make(title="O'tgan yilgi taklif")
        # `auto_now_add` ni chetlab o'tib, yozuvni o'tmishga suramiz.
        Suggestion.objects.filter(pk=eski.pk).update(
            created_at=timezone.now() - timezone.timedelta(days=400))

        today = timezone.localdate().isoformat()
        self.assertEqual(self.ids(self.api.get(URL, {"date": today})), [bugun.id])
        self.assertEqual(self.ids(self.api.get(URL, {"period": "year"})), [bugun.id])
        # Kesimsiz ikkovi ham chiqadi.
        self.assertEqual(len(self.ids(self.api.get(URL))), 2)

    def test_notogri_sana_400_beradi(self):
        self.make()
        self.assertEqual(self.api.get(URL, {"date": "kecha"}).status_code, 400)
        self.assertEqual(self.api.get(URL, {"period": "asr"}).status_code, 400)

    def test_filtrlar_birga_ishlaydi(self):
        """Qidiruv, holat va «meniki» bir-birini INKOR QILMAYDI."""
        mine = self.make(author=self.manager, title="Monitor kerak")
        self.make(author=self.manager, title="Monitor kerak emas")
        self.boss_api.post("%s%d/decide/" % (URL, mine.id),
                           {"status": "APPROVED"}, format="json")
        got = self.ids(self.api.get(URL, {"search": "monitor", "status": "APPROVED",
                                          "mine": "1"}))
        self.assertEqual(got, [mine.id])


class FileTest(SuggestionTestCase):
    """Taklifga fayl biriktirish: kim yuklaydi, kim ko'radi."""

    def upload(self, client, item, name="taklif.txt", body=b"batafsil hisob-kitob"):
        response = client.post("%s%d/files/" % (URL, item.id),
                               {"file": SimpleUploadedFile(name, body)},
                               format="multipart")
        for f in SuggestionFile.objects.all():
            if f.file:
                self.addCleanup(self.remove_file, f.file.path)
        return response

    @staticmethod
    def remove_file(path):
        try:
            os.remove(path)
        except OSError:
            pass

    def test_muallif_fayl_yuklaydi_va_kim_yuklagani_korinadi(self):
        item = self.make()
        self.assertEqual(self.upload(self.dev_api, item).status_code, 201)

        row = self.api.get("%s%d/" % (URL, item.id)).json()
        self.assertEqual(len(row["files"]), 1)
        file_row = row["files"][0]
        self.assertEqual(file_row["original_name"], "taklif.txt")
        self.assertEqual(file_row["uploaded_by"]["id"], self.dev.id)
        self.assertTrue(file_row["url"].startswith("/media/"))

    def test_anonim_taklifda_yuklovchi_ham_yashiriladi(self):
        item = self.make(is_anonymous=True)
        self.upload(self.dev_api, item)
        row = self.boss_api.get("%s%d/" % (URL, item.id)).json()
        self.assertIsNone(row["files"][0]["uploaded_by"])
        self.assertNotIn(self.dev.full_name, str(row))

    def test_begona_odam_fayl_qosha_olmaydi(self):
        item = self.make()
        self.assertEqual(self.upload(self.api, item).status_code, 403)
        self.assertEqual(SuggestionFile.objects.count(), 0)

    def test_xavfli_tur_qabul_qilinmaydi(self):
        item = self.make()
        response = self.upload(self.dev_api, item, name="hujum.html",
                               body=b"<script>alert(1)</script>")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(SuggestionFile.objects.count(), 0)

    def test_faylni_faqat_muallif_ochiradi(self):
        item = self.make()
        self.upload(self.dev_api, item)
        file_id = SuggestionFile.objects.get().id
        path = "%s%d/files/%d/" % (URL, item.id, file_id)

        self.assertEqual(self.api.delete(path).status_code, 403)
        self.assertEqual(self.boss_api.delete(path).status_code, 403)
        self.assertEqual(self.dev_api.delete(path).status_code, 204)
        self.assertEqual(SuggestionFile.objects.count(), 0)

    def test_royxatda_qoshimcha_sorov_yoq(self):
        """Fayl va ovoz sonlari N+1 yasamasin."""
        for i in range(3):
            item = self.make(title="Taklif raqami %d" % i)
            self.upload(self.dev_api, item)
            self.client_for(self.admin).post("%s%d/vote/" % (URL, item.id),
                                             {"choice": "FOR"}, format="json")

        # OLTITA so'rov, lekin MA'LUMOT uchun to'rttasi:
        #   1 - foydalanuvchi, 2 - sanoq, 3 - takliflar, 4 - fayllar.
        # Qolgan ikkitasi - `SAVEPOINT` va `RELEASE TO SAVEPOINT`. Ular
        # `ATOMIC_REQUESTS` dan keladi (`config/settings.py`): har bir
        # so'rov bitta tranzaksiyada bajariladi va bu yerda test o'zi ham
        # tranzaksiya ichida bo'lgani uchun u savepoint bo'lib chiqadi.
        #
        # Son 6 ga ko'tarildi, lekin TEKSHIRUV KUCHI o'zgarmadi: uchta
        # taklif uchun ham, o'ttizta uchun ham shu son qolishi kerak.
        # Yangi N+1 qo'shilsa 7 bo'ladi va test qizaradi.
        with self.assertNumQueries(6):
            self.assertEqual(len(self.ids(self.boss_api.get(URL, {"scope": "OPEN"}))), 3)


class ChoiceTest(SuggestionTestCase):
    """Model darajasidagi kichik va'dalar."""

    def test_bir_odam_bir_marta(self):
        item = self.make(author=self.manager)
        SuggestionVote.objects.create(suggestion=item, user=self.dev,
                                      choice=VoteChoice.FOR)
        with self.assertRaises(Exception):
            SuggestionVote.objects.create(suggestion=item, user=self.dev,
                                          choice=VoteChoice.AGAINST)

    def test_ovoz_qatori_kimligini_yozmaydi(self):
        item = self.make(author=self.manager)
        vote = SuggestionVote.objects.create(suggestion=item, user=self.dev,
                                             choice=VoteChoice.FOR)
        self.assertNotIn(self.dev.full_name, str(vote))
        self.assertNotIn(self.dev.email, str(vote))


class NotificationTest(SuggestionTestCase):
    """Taklif qo'ng'iroqqa tushadi — anonimlikni buzmasdan.

    Ikki nuqta: yangi taklif boshliqqa, qaror esa muallifga boradi.
    Uchinchi va eng nozik va'da — anonim taklifda bildirishnoma ham
    muallifni aytmasligi: `actor` foydalanuvchini to'liq ochadigan
    maydon, ya'ni u yerga muallifni qo'yish sahifadagi yashirishni
    ma'nosiz qilardi.
    """

    def notes(self, user, kind=None):
        qs = Notification.objects.filter(recipient=user)
        return list(qs.filter(kind=kind) if kind else qs)

    def post_suggestion(self, **extra):
        data = {"title": "Ish vaqtini moslashuvchan qilaylik",
                "body": "Ertalab 9 emas, 8 dan 11 gacha boshlash imkoni bo'lsin."}
        data.update(extra)
        response = self.dev_api.post(URL, data, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_yangi_taklif_boshliqqa_boradi(self):
        row = self.post_suggestion()
        got = self.notes(self.boss, NotificationKind.SUGGESTION_NEW)
        self.assertEqual(len(got), 1)
        self.assertIn(row["title"], got[0].title)
        self.assertEqual(got[0].url, "/takliflar")
        self.assertEqual(got[0].meta.get("suggestion"), row["id"])
        # Nomi bilan yuborilgan taklifda muallif ko'rinadi.
        self.assertEqual(got[0].actor_id, self.dev.id)
        self.assertIn(self.dev.full_name, got[0].body)

    def test_anonim_taklifda_muallif_bildirishnomada_ham_yoq(self):
        self.post_suggestion(is_anonymous=True)
        got = self.notes(self.boss, NotificationKind.SUGGESTION_NEW)
        self.assertEqual(len(got), 1)
        self.assertIsNone(got[0].actor_id)
        self.assertNotIn(self.dev.full_name, got[0].body)
        self.assertNotIn(self.dev.full_name, got[0].title)

    def test_boshqa_odamga_xabar_ketmaydi(self):
        """Taklif — boshliqning ishi. Jamoa qo'ng'irog'i chalinmaydi."""
        self.post_suggestion()
        self.assertEqual(self.notes(self.manager, NotificationKind.SUGGESTION_NEW), [])
        self.assertEqual(self.notes(self.dev, NotificationKind.SUGGESTION_NEW), [])

    def test_ozining_taklifi_uchun_ozi_xabar_olmaydi(self):
        """Boshliq o'zi taklif yozsa, o'ziga «yangi taklif» kelmaydi."""
        response = self.boss_api.post(URL, {
            "title": "Dam olish kunini ko'chiraylik",
            "body": "Bayramdan keyingi dushanbani dam olish qilsak."}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.notes(self.boss, NotificationKind.SUGGESTION_NEW), [])

    def test_qaror_muallifga_boradi(self):
        item = self.make()
        self.boss_api.post("%s%d/decide/" % (URL, item.id),
                           {"status": "APPROVED", "note": "Kelishdik."}, format="json")
        got = self.notes(self.dev, NotificationKind.SUGGESTION_DECIDED)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0].title, "Taklifingiz tasdiqlandi")
        self.assertIn("Kelishdik.", got[0].body)
        self.assertEqual(got[0].url, "/takliflar")

    def test_rad_etilganda_ham_boradi(self):
        item = self.make()
        self.boss_api.post("%s%d/decide/" % (URL, item.id),
                           {"status": "REJECTED", "note": "Hozircha imkon yo'q."},
                           format="json")
        got = self.notes(self.dev, NotificationKind.SUGGESTION_DECIDED)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0].title, "Taklifingiz rad etildi")

    def test_faqat_izoh_qoldirilsa_ham_muallif_biladi(self):
        item = self.make()
        self.boss_api.post("%s%d/decide/" % (URL, item.id),
                           {"note": "Bir savolim bor edi."}, format="json")
        got = self.notes(self.dev, NotificationKind.SUGGESTION_DECIDED)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0].title, "Taklifingizga izoh qoldirildi")

    def test_anonim_taklif_qarori_ham_muallifga_yetadi(self):
        """Anonimlik boshliqdan yashiradi — muallifning O'ZIDAN emas."""
        row = self.post_suggestion(is_anonymous=True)
        self.boss_api.post("%s%d/decide/" % (URL, row["id"]),
                           {"status": "APPROVED", "note": "Yaxshi fikr."}, format="json")
        got = self.notes(self.dev, NotificationKind.SUGGESTION_DECIDED)
        self.assertEqual(len(got), 1)


class DecidedLastTest(SuggestionTestCase):
    """Qaror qilingan taklif ro'yxatning pastiga tushadi.

    Ilgari u ovoz bo'yicha saralanardi va yopilgan taklif eng ko'p
    ovoz to'plagani uchun boshliqning ro'yxatida birinchi bo'lib
    turaverardi - javob kutayotganini esa uni oshirib o'tib topish
    kerak edi.
    """

    def order(self, **params):
        return self.ids(self.boss_api.get(URL, params))

    def test_kutayotganlar_tepada(self):
        # Qaror qilingani KO'PROQ ovoz to'playdi - shunda tartib faqat
        # ovozga qarasa, u tepada qolardi.
        decided = self.make(title="Yopilgan")
        pending = self.make(title="Javob kutmoqda")
        for who in (self.admin, self.manager, self.dev):
            self.client_for(who).post("%s%d/vote/" % (URL, decided.id),
                                      {"choice": "FOR"}, format="json")
        decided.status = SuggestionStatus.APPROVED
        decided.save(update_fields=["status"])

        self.assertEqual(self.order()[:2], [pending.id, decided.id])

    def test_qoida_hamma_tartibda_ishlaydi(self):
        decided = self.make(title="Yopilgan")
        decided.status = SuggestionStatus.REJECTED
        decided.save(update_fields=["status"])
        pending = self.make(title="Javob kutmoqda")

        for sort in ("top", "new", "old"):
            with self.subTest(sort=sort):
                self.assertEqual(self.order(sort=sort)[:2], [pending.id, decided.id])

    def test_holat_filtri_bilan_tartib_buzilmaydi(self):
        """Bitta guruh qolganda kalit ta'sirsiz - ro'yxat bo'sh chiqmasin."""
        first = self.make(title="Bir")
        first.status = SuggestionStatus.APPROVED
        first.save(update_fields=["status"])

        rows = self.order(status=SuggestionStatus.APPROVED)
        self.assertIn(first.id, rows)


class SoftDeleteTest(FileTest):
    """O'chirilgan taklif YO'QOLMAYDI.

    Ilgari `perform_destroy` `instance.delete()` chaqirardi va taklif
    bilan birga unga berilgan hamma ovoz CASCADE bilan ketardi - boshqa
    odamlarning fikri, qaytarib bo'lmaydigan holda. Loyihaning qolgan
    hamma yeri esa yumshoq o'chiradi.

    `FileTest` dan meros: fayl yuklovchi yordamchi (`upload`) o'sha
    yerda va uni ikki joyda takrorlashning ma'nosi yo'q.
    """

    def test_ochirilgan_taklif_bazada_qoladi(self):
        item = self.make()
        self.assertEqual(self.dev_api.delete("%s%d/" % (URL, item.id)).status_code, 204)

        self.assertFalse(Suggestion.objects.filter(pk=item.id).exists())
        self.assertTrue(Suggestion.all_objects.filter(pk=item.id).exists())
        self.assertIsNotNone(Suggestion.all_objects.get(pk=item.id).deleted_at)

    def test_ochirilgan_taklif_royxatda_korinmaydi(self):
        item = self.make()
        self.dev_api.delete("%s%d/" % (URL, item.id))
        self.assertNotIn(item.id, self.ids(self.boss_api.get(URL)))
        self.assertEqual(self.boss_api.get("%s%d/" % (URL, item.id)).status_code, 404)

    def test_ovozlar_yoqolmaydi(self):
        """Eng muhimi: boshqa odamlarning fikri saqlanadi."""
        item = self.make()
        self.client_for(self.admin).post("%s%d/vote/" % (URL, item.id),
                                         {"choice": "FOR"}, format="json")
        self.assertEqual(SuggestionVote.objects.filter(suggestion=item).count(), 1)

        self.dev_api.delete("%s%d/" % (URL, item.id))
        self.assertEqual(SuggestionVote.objects.filter(suggestion=item).count(), 1)

    def test_ochirilgan_fayl_baytlari_diskda_qoladi(self):
        item = self.make()
        self.upload(self.dev_api, item)
        row = SuggestionFile.objects.get()
        path = row.file.path

        r = self.dev_api.delete("%s%d/files/%d/" % (URL, item.id, row.id))
        self.assertEqual(r.status_code, 204)

        self.assertFalse(SuggestionFile.objects.filter(pk=row.id).exists())
        self.assertTrue(SuggestionFile.all_objects.filter(pk=row.id).exists())
        self.assertTrue(os.path.exists(path), "fayl baytlari o'chirib yuborilgan")


class AnonymousAndClosedVisibilityTest(SuggestionTestCase):
    """Anonim va yopiq taklif - BOSHLIQQA aytilgan gap.

    Ilgari anonimlik faqat MUALLIFNI yashirardi: taklifning o'zi
    ro'yxatda hammaga turar, ism o'rnida «Anonim» yozilardi. Ya'ni odam
    ismini yashirsa ham gapini butun jamoa oldida aytgan bo'lardi.
    """

    def setUp(self):
        super().setUp()
        self.anon_item = self.make(author=self.dev, title="Anonim gap",
                                   is_anonymous=True)
        self.closed_item = self.make(author=self.dev, title="Yopiq gap",
                                     scope=SuggestionScope.CLOSED)
        self.plain = self.make(author=self.dev, title="Ochiq gap")

    def test_begona_odam_faqat_ochiq_va_ismli_taklifni_koradi(self):
        rows = self.ids(self.client_for(self.outsider).get(URL))
        self.assertEqual(rows, [self.plain.id])

    def test_boshliq_hammasini_koradi(self):
        rows = self.ids(self.boss_api.get(URL))
        for item in (self.anon_item, self.closed_item, self.plain):
            self.assertIn(item.id, rows)

    def test_muallif_ozinikini_koradi(self):
        """Aks holda odam yozgan taklifini o'zi kuzata olmasdi."""
        rows = self.ids(self.dev_api.get(URL))
        for item in (self.anon_item, self.closed_item, self.plain):
            self.assertIn(item.id, rows)

    def test_begona_odam_ochib_ham_kora_olmaydi(self):
        c = self.client_for(self.outsider)
        for item in (self.anon_item, self.closed_item):
            self.assertEqual(c.get("%s%d/" % (URL, item.id)).status_code, 404)

    def test_begona_odam_anonim_taklifga_ovoz_bera_olmaydi(self):
        """Ko'rmaydigan narsaga ovoz ham berilmaydi."""
        r = self.client_for(self.outsider).post(
            "%s%d/vote/" % (URL, self.anon_item.id), {"choice": "FOR"}, format="json")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(SuggestionVote.objects.count(), 0)

    def test_sanoqlar_royxat_bilan_bir_xil(self):
        """Nishondagi son ko'rinadigan qatorlar bilan mos kelsin."""
        counts = self.client_for(self.outsider).get(URL + "counts/").json()
        self.assertEqual(counts["all"], 1)
        self.assertEqual(counts["closed"], 0)

        boss_counts = self.boss_api.get(URL + "counts/").json()
        self.assertEqual(boss_counts["all"], 3)
        self.assertEqual(boss_counts["closed"], 1)
