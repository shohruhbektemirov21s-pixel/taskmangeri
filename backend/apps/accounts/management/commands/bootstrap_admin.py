import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Birinchi admin akkauntni .env asosida yaratadi."

    def handle(self, *args, **options):
        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured

        email = os.getenv("ADMIN_EMAIL", "admin@teamflow.uz").lower()
        password = os.getenv("ADMIN_PASSWORD", "")
        name = os.getenv("ADMIN_NAME", "Bosh Admin")

        if User.objects.filter(email__iexact=email).exists():
            self.stdout.write(self.style.WARNING("Admin allaqachon mavjud: " + email))
            return

        # Standart parol faqat ishlab chiqishda qulay. Produksiyada u bilan
        # ishga tushish - eng jimgina xato: bosh hisobning paroli hammaga
        # ma'lum bo'ladi. `SECRET_KEY` uchun shunday tekshiruv allaqachon
        # `settings.py` da bor - bu esa o'sha qoidaning davomi.
        if not password:
            if not settings.DEBUG:
                raise ImproperlyConfigured(
                    "ADMIN_PASSWORD berilmagan. Bosh hisob uchun kuchli parol "
                    "qo'ying: backend/.env -> ADMIN_PASSWORD=...")
            password = "admin12345"
            self.stdout.write(self.style.WARNING(
                "ADMIN_PASSWORD yo'q - dev uchun standart parol ishlatiladi."))

        User.objects.create_superuser(email=email, password=password, full_name=name)
        self.stdout.write(self.style.SUCCESS("Admin yaratildi: " + email))
