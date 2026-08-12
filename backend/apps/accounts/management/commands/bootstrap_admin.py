import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Birinchi admin akkauntni .env asosida yaratadi."

    def handle(self, *args, **options):
        email = os.getenv("ADMIN_EMAIL", "admin@teamflow.uz").lower()
        password = os.getenv("ADMIN_PASSWORD", "admin12345")
        name = os.getenv("ADMIN_NAME", "Bosh Admin")

        if User.objects.filter(email__iexact=email).exists():
            self.stdout.write(self.style.WARNING("Admin allaqachon mavjud: " + email))
            return

        User.objects.create_superuser(email=email, password=password, full_name=name)
        self.stdout.write(self.style.SUCCESS("Admin yaratildi: " + email))
