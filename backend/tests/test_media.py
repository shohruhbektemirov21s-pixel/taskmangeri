"""Fayllar: kim ocha oladi va nima yuklash mumkin.

Bu yerdagi testlar aynan topilgan kamchiliklarni qulflaydi: media
autentifikatsiyasiz ochiq edi va yuklanadigan fayl turi cheklanmagan edi.

MEDIA_ROOT bu yerda almashtirilmaydi. Django 4.2 dan beri saqlash qatlami
`STORAGES` orqali bir marta yasaladi va `override_settings(MEDIA_ROOT=...)`
uni qayta yaratmaydi: fayl eski joyga yozilib, `serve` yangi joydan qidirardi.
Shuning uchun fayllar odatdagi joyga tushadi va har testdan keyin o'chiriladi.
"""

import os

from django.core import signing
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.core.media import MEDIA_SALT, media_url
from apps.projects.models import ProjectFile

from .base import ApiTestCase


class MediaTestCase(ApiTestCase):
    """Yuklangan fayllarni testdan keyin diskdan tozalaydi."""

    def upload(self, name="hujjat.txt", body=b"maxfiy matn"):
        # Nom (izoh) va hujjat sanasi majburiy - shartlar
        # `test_deadlines_files_and_delete.py` da tekshiriladi.
        response = self.api.post(
            "/api/projects/%d/files/" % self.project.id,
            {"file": SimpleUploadedFile(name, body),
             "description": "Sinov hujjati", "doc_date": "2026-02-21"},
            format="multipart")
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


class MediaAccessTest(MediaTestCase):
    """`/media/...` faqat API bergan imzo bilan ochilishi kerak."""

    def test_imzosiz_manzil_ochilmaydi(self):
        self.assertEqual(self.upload().status_code, 201)
        path = ProjectFile.objects.get().file.name

        # Tokensiz ham, tizimga kirgan holda ham - imzosiz ochilmaydi.
        self.assertEqual(self.anon.get("/media/" + path).status_code, 403)
        self.assertEqual(self.api.get("/media/" + path).status_code, 403)

    def test_api_bergan_manzil_ochiladi(self):
        self.assertEqual(self.upload().status_code, 201)
        url = media_url(ProjectFile.objects.get().file)

        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b"".join(r.streaming_content), b"maxfiy matn")

    def test_bir_faylning_imzosi_boshqasini_ochmaydi(self):
        self.assertEqual(self.upload("birinchi.txt", b"bir").status_code, 201)
        self.assertEqual(self.upload("ikkinchi.txt", b"ikki").status_code, 201)

        first, second = ProjectFile.objects.order_by("id")
        token = media_url(first.file).split("?t=")[1]

        r = self.client.get("/media/%s?t=%s" % (second.file.name, token))
        self.assertEqual(r.status_code, 403)

    def test_buzilgan_imzo_ishlamaydi(self):
        self.assertEqual(self.upload().status_code, 201)
        path = ProjectFile.objects.get().file.name

        r = self.client.get("/media/%s?t=%s" % (path, "yasalgan-imzo"))
        self.assertEqual(r.status_code, 403)

    def test_muddati_otgan_imzo_ishlamaydi(self):
        self.assertEqual(self.upload().status_code, 201)
        path = ProjectFile.objects.get().file.name
        token = signing.dumps(path, salt=MEDIA_SALT)

        from apps.core import media
        old_ttl = media.MEDIA_TTL
        media.MEDIA_TTL = -1              # hamma imzo "eskirgan" bo'lib qoladi
        try:
            r = self.client.get("/media/%s?t=%s" % (path, token))
            self.assertEqual(r.status_code, 403)
        finally:
            media.MEDIA_TTL = old_ttl


class UploadRulesTest(MediaTestCase):
    """Yuklanadigan faylning turi va hajmi."""

    def test_brauzerda_ishga_tushadigan_fayl_qabul_qilinmaydi(self):
        for name in ("zarar.html", "rasm.svg", "skript.js", "sahifa.htm"):
            with self.subTest(name=name):
                r = self.upload(name, b"<script>alert(1)</script>")
                self.assertEqual(r.status_code, 400)
                self.assertEqual(ProjectFile.objects.count(), 0)

    def test_oddiy_hujjat_qabul_qilinadi(self):
        for name in ("shartnoma.pdf", "jadval.xlsx", "kod.py", "arxiv.zip"):
            with self.subTest(name=name):
                self.assertEqual(self.upload(name).status_code, 201)

    def test_juda_katta_fayl_qabul_qilinmaydi(self):
        from apps.core.uploads import MAX_UPLOAD_BYTES

        r = self.upload("katta.bin", b"x" * (MAX_UPLOAD_BYTES + 1))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ProjectFile.objects.count(), 0)

    def test_bosh_fayl_qabul_qilinmaydi(self):
        r = self.upload("bosh.txt", b"")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ProjectFile.objects.count(), 0)

    def test_javobda_ichki_docker_manzili_yoq(self):
        self.assertEqual(self.upload("hujjat.txt").status_code, 201)

        r = self.api.get("/api/projects/%d/files/" % self.project.id)
        self.assertEqual(r.status_code, 200)
        item = r.json()[0]
        # `file` maydoni `http://backend:8000/...` qaytarardi - brauzer bu
        # hostni tanimaydi. Endi faqat imzolangan nisbiy `url` beriladi.
        self.assertNotIn("file", item)
        self.assertTrue(item["url"].startswith("/media/"))
        self.assertIn("?t=", item["url"])
