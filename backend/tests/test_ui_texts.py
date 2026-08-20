"""Interfeys matnlari — ochiq endpoint, ETag va urug'lantirish buyrug'i.

Sayt so'zlari endi kodda emas, bazada. Shu sababli ular uchun ham xuddi
boshqa ma'lumot kabi tekshiruv kerak: tokensiz o'qiladimi, o'zgargani
brauzerga yetib boradimi va admin tahriri ustidan yozib yuborilmaydimi.
"""
import json
from io import StringIO
from pathlib import Path

from django.core.management import call_command

from apps.uitexts.models import UiText

from .base import ApiTestCase

DEFAULTS = Path(__file__).resolve().parent.parent / "apps" / "uitexts" / "defaults.json"


class UiTextsEndpointTest(ApiTestCase):
    def setUp(self):
        super().setUp()
        UiText.objects.all().delete()
        UiText.objects.create(key="login.title", value="Hisobingizga kiring")
        UiText.objects.create(key="common.save", value="Saqlash")

    def test_texts_are_readable_without_token(self):
        """Kirish sahifasining so'zlari ham shu yerdan keladi — token yo'q."""
        res = self.anon.get("/api/ui-texts/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"]["login.title"], "Hisobingizga kiring")
        self.assertEqual(res.data["items"]["common.save"], "Saqlash")

    def test_repeat_request_with_same_etag_returns_304(self):
        first = self.anon.get("/api/ui-texts/")
        etag = first["ETag"]

        again = self.anon.get("/api/ui-texts/", HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(again.status_code, 304)

    def test_etag_changes_after_a_text_is_edited(self):
        """Admin so'zni tuzatsa, brauzerdagi eski nusxa eskirgan bo'lishi kerak."""
        etag = self.anon.get("/api/ui-texts/")["ETag"]

        row = UiText.objects.get(key="common.save")
        row.value = "Saqlab qo'yish"
        row.save()

        fresh = self.anon.get("/api/ui-texts/", HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(fresh.status_code, 200)
        self.assertEqual(fresh.data["items"]["common.save"], "Saqlab qo'yish")
        self.assertNotEqual(fresh["ETag"], etag)

    def test_group_comes_from_the_key(self):
        row = UiText.objects.get(key="login.title")
        self.assertEqual(row.group, "login")


class SeedCommandTest(ApiTestCase):
    def setUp(self):
        super().setUp()
        UiText.objects.all().delete()

    def run_seed(self, *args):
        out = StringIO()
        call_command("seed_ui_texts", *args, stdout=out)
        return out.getvalue()

    def test_seed_fills_an_empty_database(self):
        self.run_seed()
        self.assertEqual(UiText.objects.count(), len(json.loads(DEFAULTS.read_text(encoding="utf-8"))))

    def test_seed_does_not_overwrite_an_edited_text(self):
        """Admin tuzatgan so'z konteyner qayta ko'tarilganda yo'qolmasin."""
        self.run_seed()
        row = UiText.objects.first()
        row.value = "Admin qo'li bilan yozilgan"
        row.save()

        self.run_seed()
        row.refresh_from_db()
        self.assertEqual(row.value, "Admin qo'li bilan yozilgan")

    def test_force_restores_the_repository_wording(self):
        self.run_seed()
        row = UiText.objects.first()
        original = json.loads(DEFAULTS.read_text(encoding="utf-8"))[row.key]["value"]
        row.value = "Vaqtinchalik matn"
        row.save()

        self.run_seed("--force")
        row.refresh_from_db()
        self.assertEqual(row.value, original)

    def test_seed_adds_only_the_new_keys_on_a_second_run(self):
        self.run_seed()
        UiText.objects.filter(key__startswith="login.").delete()
        missing = UiText.objects.filter(key__startswith="login.").count()
        self.assertEqual(missing, 0)

        self.run_seed()
        self.assertGreater(UiText.objects.filter(key__startswith="login.").count(), 0)


class DefaultsFileTest(ApiTestCase):
    """Repodagi lug'at fayli o'zi butunmi."""

    def test_every_entry_has_a_value(self):
        data = json.loads(DEFAULTS.read_text(encoding="utf-8"))
        self.assertGreater(len(data), 500)
        for key, entry in data.items():
            self.assertIn(".", key, f"kalit guruhsiz: {key}")
            self.assertTrue(entry["value"].strip(), f"bo'sh matn: {key}")

    def test_keys_fit_the_column(self):
        """Kalit ustuni 150 belgi — undan uzuni bazaga sig'maydi."""
        data = json.loads(DEFAULTS.read_text(encoding="utf-8"))
        longest = max(data, key=len)
        self.assertLessEqual(len(longest), 150, f"juda uzun kalit: {longest}")
