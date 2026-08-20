"""Botni ishga tushiradi: `python manage.py telegram_bot`.

NEGA WEBHOOK EMAS. Webhook Telegram uchun ochiq HTTPS manzil talab qiladi.
Loyiha hozir `localhost` da ishlaydi, ya'ni webhook umuman ulanmaydi.
Uzoq so'rov (long polling) esa hech qanday tashqi manzilsiz ishlaydi:
bot Telegramga o'zi murojaat qiladi va javobni 25 soniya kutib turadi -
bo'sh so'rovlar minutiga ikki-uch marta ketadi, har soniyada emas.

Sayt ochiq domenga chiqqanda webhook ga o'tish mumkin, lekin shart emas.
"""
import logging
import time

from django.core.management.base import BaseCommand

from apps.telegram import client, commands

logger = logging.getLogger(__name__)

# Tarmoq uzilganda darrov qayta urinmaymiz - Telegram ham, log ham
# tinch qolsin.
RETRY_WAIT = 5


class Command(BaseCommand):
    help = "Telegram botni ishga tushiradi (uzoq so'rov rejimida)"

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true",
                            help="Bir marta o'qib chiqib to'xtaydi (sinov uchun)")

    def handle(self, *args, **options):
        name, error = client.check()
        if error:
            self.stderr.write(self.style.ERROR(error))
            return

        # Webhook qo'yilgan bo'lsa `getUpdates` 409 beradi - tozalab qo'yamiz.
        client.delete_webhook()
        self.stdout.write(self.style.SUCCESS("Bot ishga tushdi: @{}".format(name)))

        offset = None
        while True:
            try:
                updates = client.get_updates(offset)
            except Exception:
                logger.exception("Yangiliklarni olib bo'lmadi")
                time.sleep(RETRY_WAIT)
                continue

            for update in updates:
                # Keyingi so'rov shu yangilikdan KEYIN boshlansin, aks holda
                # bitta xabar cheksiz qayta ishlanardi.
                offset = update.get("update_id", 0) + 1
                try:
                    commands.handle(update)
                except Exception:
                    logger.exception("Yangilikni qayta ishlab bo'lmadi: %s", update.get("update_id"))

            if options["once"]:
                self.stdout.write("Bir aylanish bajarildi: {} ta yangilik".format(len(updates)))
                return
