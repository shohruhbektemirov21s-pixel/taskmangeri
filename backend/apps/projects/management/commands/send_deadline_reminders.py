"""Muddat eslatmalarini yuborish - kuniga bir marta chaqiriladi.

    docker compose exec backend python manage.py send_deadline_reminders

Ilova ichidan ham kuniga bir marta o'zi ishga tushadi (`apps/core/api.py` ->
`dashboard`), shuning uchun rejalashtiruvchi (cron) shart emas. Buyruq esa
qo'lda tekshirish va aniq rejaga qo'yish uchun qulay.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.projects.deadlines import STAGES, send_due_reminders


class Command(BaseCommand):
    help = "Muddati yaqinlashgan loyihalar bo'yicha eslatma yuboradi (1 hafta va 3 kun)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true",
                            help="Hech narsa yuborilmaydi, faqat nima bo'lishi ko'rsatiladi.")
        parser.add_argument("--date", help="Sanani majburlash (YYYY-MM-DD) - sinash uchun.")

    def handle(self, *args, **options):
        today = None
        if options.get("date"):
            from datetime import date

            try:
                today = date.fromisoformat(options["date"])
            except ValueError:
                self.stderr.write("Sana formati: YYYY-MM-DD")
                return
        today = today or timezone.localdate()

        dry = options.get("dry_run", False)
        projects, messages = send_due_reminders(today=today, dry_run=dry)

        self.stdout.write(
            "{}{} - {} ta loyiha, {} ta bildirishnoma ({} kun qolganlar tekshirildi)".format(
                "[quruq ishga tushirish] " if dry else "", today,
                projects, messages, " va ".join(str(d) for d in STAGES)))
