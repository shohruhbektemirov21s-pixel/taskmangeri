"""Suhbat: xabar yuborish va olish yo'li.

Bu qism hech qachon sinalmagan edi - jadval bo'sh turardi, ya'ni u yerda
xato bor-yo'qligini hech kim bilmasdi.
"""

from apps.chat.models import ChatMessage

from .base import ApiTestCase


def bodies(response):
    data = response.json()
    rows = data["results"] if isinstance(data, dict) and "results" in data else data
    return [m["text"] for m in rows]


class DirectMessageTest(ApiTestCase):
    """Ikki odam orasidagi shaxsiy yozishma."""

    def send(self, client, to_user, text):
        return client.post("/api/chat/messages/",
                           {"recipient_id": to_user.id, "text": text}, format="json")

    def test_xabar_yuboriladi_va_korinadi(self):
        r = self.send(self.api, self.dev, "Salom, vazifa tayyormi?")
        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertEqual(ChatMessage.objects.count(), 1)

        # Qabul qiluvchi xabarni o'z yozishmasida ko'radi.
        dev_client = self.client_for(self.dev)
        got = dev_client.get("/api/chat/messages/", {"direct": self.manager.id})
        self.assertEqual(got.status_code, 200)
        self.assertIn("Salom, vazifa tayyormi?", bodies(got))

    def test_yozishmalar_royxatida_hamroh_korinadi(self):
        self.assertEqual(self.send(self.api, self.dev, "salom").status_code, 201)

        dev_client = self.client_for(self.dev)
        convs = dev_client.get("/api/chat/messages/conversations/")
        self.assertEqual(convs.status_code, 200)
        partners = [c["partner"]["id"] for c in convs.json()]
        self.assertIn(self.manager.id, partners)

    def test_yozishma_faqat_ishtirokchilarga_korinadi(self):
        self.assertEqual(self.send(self.api, self.dev, "Maxfiy gap").status_code, 201)

        chetdagi = self.client_for(self.outsider)
        r = chetdagi.get("/api/chat/messages/", {"direct": self.manager.id})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("Maxfiy gap", bodies(r))

    def test_bosh_xabar_yuborilmaydi(self):
        r = self.send(self.api, self.dev, "   ")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ChatMessage.objects.count(), 0)

    def test_ozingizga_yozib_bolmaydi(self):
        r = self.send(self.api, self.manager, "o'zimga")
        self.assertEqual(r.status_code, 400)

    def test_tokensiz_yozib_bolmaydi(self):
        r = self.anon.post("/api/chat/messages/",
                           {"recipient_id": self.dev.id, "text": "salom"}, format="json")
        self.assertEqual(r.status_code, 401)


class ProjectChatTest(ApiTestCase):
    """Loyiha suhbati - faqat jamoa ichida."""

    def test_azo_yozadi_va_oqiydi(self):
        r = self.api.post("/api/chat/messages/",
                          {"project": self.project.id, "text": "Yigilish soat 10 da"},
                          format="json")
        self.assertEqual(r.status_code, 201, r.content[:300])

        dev_client = self.client_for(self.dev)
        got = dev_client.get("/api/chat/messages/", {"project": self.project.id})
        self.assertEqual(got.status_code, 200)
        self.assertIn("Yigilish soat 10 da", bodies(got))

    def test_chetdagi_odam_loyiha_suhbatiga_yoza_olmaydi(self):
        chetdagi = self.client_for(self.outsider)
        r = chetdagi.post("/api/chat/messages/",
                          {"project": self.project.id, "text": "kirdim"}, format="json")
        self.assertIn(r.status_code, (403, 404))
        self.assertEqual(ChatMessage.objects.count(), 0)

    def test_chetdagi_odam_loyiha_suhbatini_oqiy_olmaydi(self):
        self.assertEqual(
            self.api.post("/api/chat/messages/",
                          {"project": self.project.id, "text": "ichki gap"},
                          format="json").status_code, 201)

        chetdagi = self.client_for(self.outsider)
        r = chetdagi.get("/api/chat/messages/", {"project": self.project.id})
        self.assertEqual(r.status_code, 403)
