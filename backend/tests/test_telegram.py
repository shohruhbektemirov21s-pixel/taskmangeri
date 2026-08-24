"""Telegram boti — bog'lanish, buyruqlar va chegaralar.

Tashqi tarmoqqa CHIQMAYDI: `client.send_message` va `client.is_configured`
almashtiriladi. Test Telegramning ishlashini emas, BIZNING mantiqni
tekshiradi: kim kimga bog'lanadi, kim nimani ko'radi.
"""
from unittest import mock

from apps.tasks.models import Task, TaskAssignment
from apps.telegram import commands
from apps.telegram.linkcode import make_code
from apps.telegram.models import TelegramLink, normalize_username

from .base import ApiTestCase


def update(chat_id, text, username="dasturchi_ali"):
    """Telegramdan keladigan yangilik shakli."""
    return {
        "update_id": 1,
        "message": {
            "chat": {"id": chat_id, "type": "private"},
            "from": {"id": chat_id, "username": username},
            "text": text,
        },
    }


class NormalizeTest(ApiTestCase):
    def test_har_xil_shakl_bitta_nomga_keladi(self):
        for raw in ("@Shohruh", " shohruh ", "https://t.me/SHOHRUH", "t.me/shohruh"):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_username(raw), "shohruh")

    def test_bosh_qiymat(self):
        self.assertEqual(normalize_username(""), "")
        self.assertEqual(normalize_username(None), "")


class BotCommandTest(ApiTestCase):
    """`/start` va o'qish buyruqlari."""

    CHAT = 555001

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.dev.telegram = "@dasturchi_ali"
        cls.dev.save(update_fields=["telegram"])
        cls.task = Task.objects.create(project=cls.project, title="Bot sinovi",
                                       created_by=cls.manager)
        TaskAssignment.objects.create(task=cls.task, user=cls.dev)

    def setUp(self):
        super().setUp()
        self.sent = []
        patch_send = mock.patch(
            "apps.telegram.client.send_message",
            side_effect=lambda chat_id, text, buttons=None: self.sent.append((chat_id, text)) or True)
        patch_cfg = mock.patch("apps.telegram.client.is_configured", return_value=True)
        patch_send.start()
        patch_cfg.start()
        self.addCleanup(patch_send.stop)
        self.addCleanup(patch_cfg.stop)

    def last(self):
        return self.sent[-1][1] if self.sent else ""

    # ---------------------------------------------------------- bog'lanish
    #
    # BOG'LANISH BIR MARTALIK KOD BILAN. Ilgari u profildagi `telegram`
    # maydoni bo'yicha edi: maydonni hech kim tasdiqlamaydi, ya'ni begona
    # username'ni yozib qo'yib, o'sha odamning `chat_id` sini o'z hisobiga
    # tortib olish mumkin edi (`telegram/linkcode.py`).
    def test_kod_bilan_boglaydi(self):
        commands.handle(update(self.CHAT, "/start " + make_code(self.dev)))
        link = TelegramLink.objects.get(user=self.dev)
        self.assertEqual(link.chat_id, self.CHAT)
        self.assertIn(self.dev.full_name, self.last())

    def test_kodsiz_start_boglamaydi(self):
        commands.handle(update(self.CHAT, "/start"))
        self.assertFalse(TelegramLink.objects.exists())
        self.assertIn("Profil", self.last())

    def test_profildagi_username_endi_yetarli_emas(self):
        """Regressiya: username - tasdiqlanmagan maydon, kalit emas."""
        self.assertEqual(self.dev.telegram, "@dasturchi_ali")
        commands.handle(update(self.CHAT, "/start", username="dasturchi_ali"))
        self.assertFalse(TelegramLink.objects.exists())

    def test_begona_kod_boglamaydi(self):
        commands.handle(update(self.CHAT, "/start qalbaki-kod-12345"))
        self.assertFalse(TelegramLink.objects.exists())
        self.assertIn("Profil", self.last())

    def test_eskirgan_kod_boglamaydi(self):
        code = make_code(self.dev)
        # Kod 15 daqiqa yashaydi - undan keyin yaroqsiz.
        with mock.patch("apps.telegram.linkcode.MAX_AGE", -1):
            commands.handle(update(self.CHAT, "/start " + code))
        self.assertFalse(TelegramLink.objects.exists())

    def test_bitta_chat_bitta_hisob(self):
        """Chat boshqa hisobga o'tsa, eskisi uziladi."""
        commands.handle(update(self.CHAT, "/start " + make_code(self.dev)))
        commands.handle(update(self.CHAT, "/start " + make_code(self.manager)))
        self.assertFalse(TelegramLink.objects.filter(user=self.dev).exists())
        self.assertEqual(TelegramLink.objects.get(chat_id=self.CHAT).user, self.manager)

    # --------------------------------------------------------- faqat xabar
    # Bot buyruqlarni qabul qilmaydi: `/vazifalarim`, `/bugun` va
    # `/tekshiruv` olib tashlandi - ular ilovadagi sahifalarni Telegramda
    # takrorlardi. Quyidagi testlar shu qarorni bog'laydi.
    def test_eski_buyruqlar_ishlamaydi(self):
        commands.handle(update(self.CHAT, "/start " + make_code(self.dev)))
        for text in ("/vazifalarim", "/bugun", "/tekshiruv", "/uzish", "/yordam"):
            with self.subTest(text=text):
                commands.handle(update(self.CHAT, text))
                self.assertIn("faqat bildirishnoma", self.last())
                # Vazifa nomi javobga tushib qolmasin.
                self.assertNotIn("Bot sinovi", self.last())

    def test_oddiy_matn_ham_shu_javobni_oladi(self):
        """Bot jim qolmaydi - aks holda odam «yetib bordimi?» deb o'ylardi."""
        commands.handle(update(self.CHAT, "/start " + make_code(self.dev)))
        self.assertTrue(commands.handle(update(self.CHAT, "salom")))
        self.assertIn("faqat bildirishnoma", self.last())

    def test_bosh_xabar_javobsiz(self):
        self.assertFalse(commands.handle(update(self.CHAT, "")))

    def test_start_boglashda_davom_etadi(self):
        """`/start` ni olib tashlab bo'lmaydi - `chat_id` faqat shundan."""
        commands.handle(update(self.CHAT, "/start " + make_code(self.dev)))
        self.assertTrue(TelegramLink.objects.filter(user=self.dev).exists())
        self.assertIn("bog'landi", self.last())


class TelegramApiTest(ApiTestCase):
    """Profil sahifasidagi endpoint."""

    URL = "/api/telegram/link/"

    def test_kirmagan_odam_otmaydi(self):
        self.assertEqual(self.anon.get(self.URL).status_code, 401)

    def test_holat_profildagi_nomni_qaytaradi(self):
        self.manager.telegram = "@menejer_bek"
        self.manager.save(update_fields=["telegram"])
        r = self.api.get(self.URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["username"], "menejer_bek")
        self.assertFalse(r.data["is_linked"])

    def test_uzish_faqat_ozinikini_ochiradi(self):
        mine = TelegramLink.objects.create(user=self.manager, chat_id=1)
        alien = TelegramLink.objects.create(user=self.dev, chat_id=2)

        self.assertEqual(self.api.delete(self.URL).status_code, 200)
        self.assertFalse(TelegramLink.objects.filter(pk=mine.pk).exists())
        self.assertTrue(TelegramLink.objects.filter(pk=alien.pk).exists())

    def test_ovozni_ochirish(self):
        TelegramLink.objects.create(user=self.manager, chat_id=1)
        r = self.api.post(self.URL, {"is_muted": True}, format="json")
        self.assertTrue(r.data["is_muted"])
        self.assertTrue(TelegramLink.objects.get(user=self.manager).is_muted)


class NotifyBridgeTest(ApiTestCase):
    """Bildirishnoma Telegramga uzatiladi - lekin uni buzmaydi."""

    def test_boglanmagan_odamga_yuborilmaydi(self):
        from apps.notifications.services import notify
        from apps.notifications.models import NotificationKind

        with mock.patch("apps.telegram.client.send_message") as send:
            notify(self.dev, NotificationKind.TASK_ASSIGNED, "Sinov")
            send.assert_not_called()

    def test_telegram_yiqilsa_ham_bildirishnoma_yoziladi(self):
        """Eng muhim qoida: tashqi xizmat asosiy amalni to'xtatmasin."""
        from apps.notifications.models import Notification, NotificationKind
        from apps.notifications.services import notify

        TelegramLink.objects.create(user=self.dev, chat_id=42)
        with mock.patch("apps.telegram.client.is_configured", return_value=True), \
             mock.patch("apps.telegram.client.send_message", side_effect=RuntimeError("tarmoq")):
            obj = notify(self.dev, NotificationKind.TASK_ASSIGNED, "Sinov")

        self.assertIsNotNone(obj)
        self.assertTrue(Notification.objects.filter(pk=obj.pk).exists())

    def test_boglangan_odamga_ketadi(self):
        from apps.notifications.models import NotificationKind
        from apps.notifications.services import notify

        TelegramLink.objects.create(user=self.dev, chat_id=42)
        with mock.patch("apps.telegram.client.is_configured", return_value=True), \
             mock.patch("apps.telegram.client.send_message", return_value=True) as send:
            notify(self.dev, NotificationKind.TASK_ASSIGNED, "Vazifa biriktirildi", body="TVKA-1")

        send.assert_called_once()
        self.assertEqual(send.call_args[0][0], 42)
        self.assertIn("Vazifa biriktirildi", send.call_args[0][1])

    def test_ovozi_ochirilganga_ketmaydi(self):
        from apps.notifications.models import NotificationKind
        from apps.notifications.services import notify

        TelegramLink.objects.create(user=self.dev, chat_id=42, is_muted=True)
        with mock.patch("apps.telegram.client.is_configured", return_value=True), \
             mock.patch("apps.telegram.client.send_message") as send:
            notify(self.dev, NotificationKind.TASK_ASSIGNED, "Sinov")
            send.assert_not_called()
