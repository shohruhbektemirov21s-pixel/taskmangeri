"""Interfeys matnlarining boshlang'ich to'plamini bazaga soladi.

`defaults.json` - kalitlarning repodagi nusxasi: yangi muhitda (bo'sh bazada)
sayt so'zsiz qolmasin. Bazadagi matn esa asosiy manba: admin uni tahrirlagan
bo'lsa, bu buyruq ustidan yozmaydi.

    python manage.py seed_ui_texts            # faqat yetishmayotganini qo'shadi
    python manage.py seed_ui_texts --force    # hammasini repodagi holatga qaytaradi
    python manage.py seed_ui_texts --prune    # defaults.json da yo'q kalitlarni o'chiradi

Entrypoint har ishga tushishda `--force`siz chaqiradi: yangi kalitlar o'zi
paydo bo'ladi, qo'lda kiritilgan tahrirlar joyida qoladi.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.uitexts.models import UiText

DEFAULTS = Path(__file__).resolve().parent.parent.parent / "defaults.json"


class Command(BaseCommand):
    help = "Interfeys matnlarini defaults.json dan bazaga soladi"

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true",
                            help="Mavjud matnlarni ham repodagi holatga qaytaradi")
        parser.add_argument("--prune", action="store_true",
                            help="defaults.json da yo'q kalitlarni bazadan o'chiradi")

    def handle(self, *args, **options):
        if not DEFAULTS.exists():
            self.stderr.write(f"Topilmadi: {DEFAULTS}")
            return

        data = json.loads(DEFAULTS.read_text(encoding="utf-8"))
        existing = {t.key: t for t in UiText.objects.all()}

        created, updated, skipped = 0, 0, 0
        to_create = []

        for key, entry in data.items():
            # Yozuv sodda satr ham, izohli lug'at ham bo'lishi mumkin.
            value = entry["value"] if isinstance(entry, dict) else entry
            note = entry.get("note", "") if isinstance(entry, dict) else ""

            row = existing.get(key)
            if row is None:
                to_create.append(UiText(key=key, value=value, note=note,
                                        group=key.split(".", 1)[0] if "." in key else ""))
                created += 1
            elif options["force"] and (row.value != value or row.note != note):
                row.value = value
                row.note = note
                row.save()
                updated += 1
            else:
                skipped += 1

        if to_create:
            # `bulk_create` `save()` ni chaqirmaydi, shuning uchun `group` ni
            # yuqorida qo'lda to'ldirdik.
            UiText.objects.bulk_create(to_create, batch_size=200)

        removed = 0
        if options["prune"]:
            stale = set(existing) - set(data)
            if stale:
                removed = UiText.objects.filter(key__in=stale).delete()[0]

        self.stdout.write(
            f"Interfeys matnlari: {created} qo'shildi, {updated} yangilandi, "
            f"{skipped} tegilmadi, {removed} o'chirildi."
        )
