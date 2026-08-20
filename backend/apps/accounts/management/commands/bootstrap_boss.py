"""Boshliq hisobini `.env` asosida yaratadi.

Boshliq — takliflar bo'yicha qaror qabul qiladigan yagona rol
(`GlobalRole.BOSS`). Tizim admini bu huquqqa ega emas, shuning uchun
hisob alohida yaratiladi va entrypoint uni har ishga tushishda tekshiradi.

Mavjud hisobga TEGILMAYDI: paroli almashtirilgan bo'lsa qaytarilmaydi.
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.accounts.models import GlobalRole

User = get_user_model()


class Command(BaseCommand):
    help = "Boshliq (takliflarni tasdiqlovchi) hisobini yaratadi."

    def handle(self, *args, **options):
        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured

        email = os.getenv("BOSS_EMAIL", "boss@teamflow.uz").strip().lower()
        password = os.getenv("BOSS_PASSWORD", "")
        name = os.getenv("BOSS_NAME", "Boshliq")

        existing = User.objects.filter(email__iexact=email).first()
        if existing:
            # Rol qo'lda o'zgartirilgan bo'lsa tiklaymiz - aks holda
            # takliflarni hech kim tasdiqlay olmay qolardi.
            if existing.global_role != GlobalRole.BOSS:
                existing.global_role = GlobalRole.BOSS
                existing.save(update_fields=["global_role"])
                self.stdout.write(self.style.WARNING(
                    "Boshliq roli tiklandi: " + email))
            else:
                self.stdout.write("Boshliq allaqachon mavjud: " + email)
            return

        # Sababi `bootstrap_admin` dagi bilan bir xil: standart parol dev
        # uchun qulay, produksiyada esa bosh hisobning paroli hammaga
        # ma'lum bo'lib qolardi.
        if not password:
            if not settings.DEBUG:
                raise ImproperlyConfigured(
                    "BOSS_PASSWORD berilmagan. Boshliq hisobi uchun kuchli parol "
                    "qo'ying: backend/.env -> BOSS_PASSWORD=...")
            password = "boss12345"
            self.stdout.write(self.style.WARNING(
                "BOSS_PASSWORD yo'q - dev uchun standart parol ishlatiladi."))

        User.objects.create_user(
            email=email, password=password, full_name=name,
            global_role=GlobalRole.BOSS, job_title="Boshliq")
        self.stdout.write(self.style.SUCCESS("Boshliq yaratildi: " + email))
