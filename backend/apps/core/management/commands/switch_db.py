"""PostgreSQL va Db2 orasida ma'lumot ko'chirish.

    python manage.py switch_db --check          # ikkala bazaning holati
    python manage.py switch_db --to db2         # postgres -> db2
    python manage.py switch_db --to postgres    # db2 -> postgres

Ishlash tartibi: manba bazadan `dumpdata` bilan olinadi, maqsad bazada
migratsiyalar yuguriladi, keyin `loaddata` bilan yuklanadi. Ikkala baza ham
bir xil migratsiyalar bilan ishlagani uchun (loyihada bazaga xos maydon yo'q)
ma'lumot hech qanday o'zgartirishsiz o'tadi.

Manba bazaga TEGILMAYDI - u o'z holicha qoladi, ya'ni xohlagan paytda
orqaga qaytish mumkin.
"""
import io
import json
import os
import subprocess
import sys

from django.core.management.base import BaseCommand, CommandError

# Ko'chirilmaydigan jadvallar: ular maqsad bazada migratsiya paytida
# o'zi yaratiladi yoki ma'nosi yo'q.
EXCLUDE = [
    "contenttypes",
    "auth.permission",
    "sessions",
    "admin.logentry",
]


class Command(BaseCommand):
    help = "PostgreSQL va IBM Db2 orasida ma'lumotni ko'chiradi"

    def add_arguments(self, parser):
        parser.add_argument("--to", choices=["db2", "postgres"],
                            help="Qaysi bazaga ko'chirilsin")
        parser.add_argument("--check", action="store_true",
                            help="Faqat ikkala bazaning holatini ko'rsatadi")
        parser.add_argument("--dump", default="/app/.migrate_dump.json",
                            help="Oraliq fayl yo'li")

    # ------------------------------------------------------------------
    def handle(self, *args, **opts):
        if opts["check"]:
            return self.check_both()

        target = opts["to"]
        if not target:
            raise CommandError("--to db2 yoki --to postgres ko'rsating (yoki --check).")

        source = "postgres" if target == "db2" else "db2"
        dump = opts["dump"]

        self.stdout.write(self.style.MIGRATE_HEADING(
            "{} -> {} ko'chirish".format(source.upper(), target.upper())))

        # 1) Manbadan olish
        self.stdout.write("  1/3  {} dan o'qilmoqda...".format(source))
        data = self.run_manage(source, [
            "dumpdata", "--natural-foreign", "--natural-primary", "--indent", "1",
        ] + sum([["--exclude", e] for e in EXCLUDE], []))
        with io.open(dump, "w", encoding="utf-8") as fh:
            fh.write(data)
        rows = len(json.loads(data))
        self.stdout.write(self.style.SUCCESS("       {} ta yozuv olindi".format(rows)))

        # 2) Maqsad bazada jadvallarni yaratish
        self.stdout.write("  2/3  {} da migratsiyalar...".format(target))
        self.run_manage(target, ["migrate", "--noinput"], stream=True)

        # 3) Yuklash
        self.stdout.write("  3/3  {} ga yozilmoqda...".format(target))
        self.run_manage(target, ["loaddata", dump], stream=True)

        os.remove(dump)
        self.stdout.write(self.style.SUCCESS("\nTayyor. Endi tekshiring:"))
        self.check_both()
        self.stdout.write(
            "\nIlovani {} ga o'tkazish uchun backend/.env da: DB_ENGINE={}".format(
                target.upper(), target))

    # ------------------------------------------------------------------
    def check_both(self):
        """Ikkala bazadagi asosiy jadvallar sonini yonma-yon ko'rsatadi."""
        code = (
            "from django.contrib.auth import get_user_model;"
            "from apps.projects.models import Project, ProjectSpecialty;"
            "from apps.tasks.models import Task, Attachment;"
            "from apps.activity.models import Activity;"
            "U=get_user_model();"
            "print('|'.join(str(x) for x in ["
            "U.objects.count(), Project.objects.count(), ProjectSpecialty.objects.count(),"
            "Task.objects.count(), Attachment.objects.count(), Activity.objects.count()]))"
        )
        names = ["foydalanuvchi", "loyiha", "mutaxassislik", "vazifa", "fayl", "tarix"]
        result = {}
        for engine in ("postgres", "db2"):
            try:
                out = self.run_manage(engine, ["shell", "-c", code]).strip().splitlines()[-1]
                result[engine] = out.split("|")
            except Exception as exc:  # baza ko'tarilmagan bo'lishi mumkin
                result[engine] = ["-"] * len(names)
                self.stdout.write(self.style.WARNING(
                    "  {}: ulanib bo'lmadi ({})".format(engine, str(exc).split(chr(10))[0][:70])))

        self.stdout.write("")
        self.stdout.write("  {:<16} {:>12} {:>12}".format("", "PostgreSQL", "Db2"))
        for i, name in enumerate(names):
            self.stdout.write("  {:<16} {:>12} {:>12}".format(
                name, result["postgres"][i], result["db2"][i]))

    # ------------------------------------------------------------------
    @staticmethod
    def run_manage(engine, argv, stream=False):
        """`manage.py` ni boshqa baza bilan alohida jarayonda chaqiradi.

        Bitta jarayonda ikkala bazaga ulanish uchun `DATABASES` ni qayta
        yozish kerak bo'lardi; alohida jarayon soddaroq va xatosizroq.
        """
        env = dict(os.environ, DB_ENGINE=engine)
        cmd = [sys.executable, "manage.py"] + argv
        if stream:
            proc = subprocess.run(cmd, env=env)
            if proc.returncode:
                raise CommandError("{} bajarilmadi: {}".format(argv[0], proc.returncode))
            return ""
        proc = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if proc.returncode:
            raise CommandError("{} bajarilmadi:\n{}".format(argv[0], proc.stderr[-2000:]))
        return proc.stdout
