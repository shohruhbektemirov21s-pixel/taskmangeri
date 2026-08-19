"""«Bajarildi» degan, lekin yakunlangan vaqti yozilmagan vazifalarni to'g'rilaydi.

MUAMMO. Panel «Bajarilganlar: 0» deb turardi, holbuki bazada 29 ta yopilgan
ish bor edi. Sabab holatda emas, VAQTDA: davr bo'yicha sanoq
(`apps/core/api.py` dagi `panel_metric_q`) `completed_at__gte=<davr boshi>`
shartiga tayanadi - "qachon bajarilgani" bilinmasa, ishni yil, oy yoki hafta
kesimiga qo'yib bo'lmaydi. Bo'sh `completed_at` esa hech qanday davrga
tushmaydi va ish sanoqdan butunlay chiqib ketadi.

QAYERDAN KELIB CHIQQAN. Vazifa ilova orqali yopilganda `Task.apply_status()`
vaqtni o'zi qo'yadi. Lekin holat boshqa yo'l bilan ham yozilishi mumkin -
import skripti, admin paneli, to'g'ridan-to'g'ri ORM - va o'shanda maydon
bo'sh qolardi. Haftalik ish rejasi aynan shunday import qilingan edi.

KELAJAKDA TAKRORLANMAYDI: qoida endi modelning o'zida (`Task.save()`), ya'ni
qaysi yo'l bilan yozilishidan qat'i nazar DONE qatori vaqtsiz saqlanmaydi.
Bu buyruq esa O'TGAN yozuvlar uchun - bir marta yugurtiriladi.

QAYSI VAQT QO'YILADI. Haqiqiy yakunlanish lahzasi hech qayerda saqlanmagan,
shuning uchun eng yaqin manba - `updated_at` (yozuvga oxirgi marta tegilgan
payt). Bu TAXMIN va shundayligicha aytiladi; boshqa varianti yo'q.

    docker compose exec -T backend python manage.py backfill_completed_at --dry-run
    docker compose exec -T backend python manage.py backfill_completed_at
"""
from django.core.management.base import BaseCommand
from django.db.models import Count, F

from apps.tasks.models import Task, TaskStatus


class Command(BaseCommand):
    help = "«Bajarildi» vazifalarda bo'sh completed_at ni updated_at bilan to'ldiradi"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Hech narsa yozmaydi - faqat nechtasi tuzatilishini aytadi.")

    def handle(self, *args, **options):
        # `all_objects`: o'chirilgan vazifalar ham to'g'rilanadi - ular
        # tiklanishi mumkin va o'shanda yana sanoqdan tushib qolmasin.
        rows = Task.all_objects.filter(status=TaskStatus.DONE,
                                       completed_at__isnull=True)
        total = rows.count()

        if not total:
            self.stdout.write(self.style.SUCCESS(
                "Tuzatish kerak bo'lgan vazifa yo'q."))
            return

        # Ko'rib chiqish uchun - qaysi loyihada nechtasi.
        self.stdout.write("Yakunlangan vaqti yozilmagan vazifalar: {}".format(total))
        for row in rows.values("project__name").annotate(n=Count("id")).order_by("-n"):
            self.stdout.write("  {} - {} ta".format(row["project__name"], row["n"]))

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING(
                "--dry-run: hech narsa yozilmadi."))
            return

        # `.update()` ataylab: `save()` `auto_now` ni qo'zg'atib `updated_at`
        # ni bugunga surib yuborardi - ya'ni tayanch nuqtamizni o'zi yo'q
        # qilardi.
        changed = rows.update(completed_at=F("updated_at"))
        self.stdout.write(self.style.SUCCESS(
            "{} ta vazifaga yakunlangan vaqt qo'yildi (manba: updated_at - "
            "taxminiy).".format(changed)))
