"""Eskirgan yozuvlarni tozalaydi - saqlash muddati siyosati.

MUAMMO. Loyihada hech narsa hech qachon o'chirilmasdi. `Activity` har bir
maydon o'zgarishiga bittadan qator yozadi, `Notification` har bir hodisaga
bittadan, yumshoq o'chirilgan vazifalar va fayllar esa jadvalda abadiy
qoladi. Hajm muammosi allaqachon sezilgan edi - Db2 tranzaksiya jurnali
~2 GB ga kengaytirilgan va `AUTO_REORG` yoqilgan
(`docker/db2/10-teamflow-tuning.sh`) - lekin yechim faqat «ko'proq joy»
edi, «kamroq ma'lumot» emas. 40 000 vazifali bazada `Activity` bir necha
yuz mingga chiqadi va har bir so'rov shuncha qator ustidan o'tadi.

NIMA O'CHADI VA NIMA QOLADI.

  * `Activity` - `--activity-days` (standart 365) dan eski qatorlar.
    Tarix bir yildan keyin operativ ma'noni yo'qotadi; hisobot kerak
    bo'lsa u vaqtga qadar olingan bo'ladi.
  * `Notification` - O'QILGAN va `--notify-days` (standart 90) dan eski.
    O'qilmagani TEGILMAYDI: odam uni hali ko'rmagan.
  * Yumshoq o'chirilgan qatorlar - `--deleted-days` (standart 180) dan
    eski bo'lsa BUTUNLAY o'chiriladi. Yumshoq o'chirishning maqsadi
    «adashib bosildi» ni qaytarish edi; olti oydan keyin uni hech kim
    qaytarmaydi, joyni esa egallab turadi.

NEGA `apps.panel` DA. Bu buyruq beshta domen ilovasining modelini
o'qiydi (`activity`, `chat`, `notifications`, `projects`, `tasks`).
Bunday narsaning yagona qonuniy joyi - eng ustki qavat: panel hammani
biladi, uni esa hech kim import qilmaydi. Ilgari u `apps.core` da edi
va bu loyihaning birinchi qoidasini buzardi - «`apps/core` da domen
importi BO'LMASIN». Import funksiya ichida yashiringani bilan halqa
baribir qoladi, faqat ko'rinmay turadi.

NIMA HECH QACHON O'CHMAYDI: loyiha, vazifa va foydalanuvchining o'zi
(tirik bo'lsa), chat tarixi, takliflar. Ular «tarix» emas, ishning o'zi.

XAVFSIZLIK. Standart rejim - `--dry-run`ga o'xshash emas, lekin har
o'chirishdan oldin son ko'rsatiladi va `--yes` berilmasa so'raladi.
Rejalashtiruvchi uni `--yes` bilan chaqiradi.

BO'LAKLAB o'chiriladi: bitta ulkan `DELETE` Db2 tranzaksiya jurnalini
to'ldirib, `SQL0964C` bilan yiqilardi - aynan shu xato 40 000 vazifa
yuklashda bo'lgan.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

# Bitta tranzaksiyada o'chiriladigan qatorlar soni. Jurnal to'lib
# ketmasin - sabab modul izohida.
CHUNK = 2000


class Command(BaseCommand):
    help = "Eskirgan tarix, bildirishnoma va yumshoq o'chirilgan qatorlarni tozalaydi."

    def add_arguments(self, parser):
        parser.add_argument("--activity-days", type=int, default=365)
        parser.add_argument("--notify-days", type=int, default=90)
        parser.add_argument("--deleted-days", type=int, default=180)
        parser.add_argument("--dry-run", action="store_true",
                            help="Hech narsa o'chirilmaydi, faqat sanaladi.")
        parser.add_argument("--yes", action="store_true",
                            help="Tasdiq so'ralmaydi (rejalashtiruvchi uchun).")

    def handle(self, *args, **opts):
        from datetime import timedelta

        from apps.activity.models import Activity
        from apps.chat.models import ChatMessage
        from apps.notifications.models import Notification
        from apps.projects.models import ProjectFile
        from apps.tasks.models import Attachment, Submission, Task

        now = timezone.now()
        dry = opts["dry_run"]

        jobs = [
            ("Tarix (Activity)",
             Activity.objects.filter(
                 created_at__lt=now - timedelta(days=opts["activity_days"]))),
            ("O'qilgan bildirishnomalar",
             Notification.objects.filter(
                 is_read=True,
                 created_at__lt=now - timedelta(days=opts["notify_days"]))),
        ]

        # Yumshoq o'chirilganlar - `all_objects` orqali, chunki standart
        # menejer ularni allaqachon yashiradi.
        dead_before = now - timedelta(days=opts["deleted_days"])
        for label, model in (("Vazifalar", Task), ("Vazifa fayllari", Attachment),
                             ("Loyiha fayllari", ProjectFile),
                             ("Topshiriqlar", Submission),
                             ("Chat xabarlari", ChatMessage)):
            jobs.append((
                "O'chirilgan: " + label,
                model.all_objects.filter(deleted_at__isnull=False,
                                         deleted_at__lt=dead_before),
            ))

        total = 0
        plan = []
        for label, qs in jobs:
            count = qs.count()
            plan.append((label, qs, count))
            total += count
            self.stdout.write("{:<32} {:>8}".format(label, count))

        if not total:
            self.stdout.write(self.style.SUCCESS("Tozalanadigan narsa yo'q."))
            return

        if dry:
            self.stdout.write(self.style.WARNING(
                "[quruq ishga tushirish] {} ta qator o'chirilishi mumkin edi.".format(total)))
            return

        if not opts["yes"]:
            self.stdout.write(self.style.WARNING(
                "{} ta qator O'CHIRILADI. Davom etish uchun `--yes` qo'shing.".format(total)))
            return

        removed = 0
        for label, qs, count in plan:
            if not count:
                continue
            removed += self._delete_in_chunks(qs)
            self.stdout.write("  {} tozalandi".format(label))

        self.stdout.write(self.style.SUCCESS(
            "{} ta qator o'chirildi.".format(removed)))

    @staticmethod
    def _delete_in_chunks(qs):
        """Bo'laklab o'chiradi - Db2 jurnali to'lib ketmasin."""
        gone = 0
        while True:
            ids = list(qs.values_list("pk", flat=True)[:CHUNK])
            if not ids:
                return gone
            # `qs.model` - `all_objects` bo'lsa ham to'g'ri modelni beradi.
            deleted, _ = qs.model._base_manager.filter(pk__in=ids).delete()
            gone += len(ids)
            if deleted == 0:
                # Hech narsa o'chmadi - cheksiz siklga tushmaslik uchun.
                return gone
