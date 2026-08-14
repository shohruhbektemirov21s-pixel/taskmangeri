"""Bildirishnoma turlari qisqartirildi: vazifa, suhbat va qo'shilish so'rovi.

Taklif tizimi olib tashlandi (`apps.invites`), «yangi a'zo» esa qo'ng'iroqqa
emas, tarixga tegishli. Eski yozuvlar bazada qolsa, ular endi mavjud
bo'lmagan `/takliflar` sahifasiga olib borardi — shuning uchun o'chiriladi.
Bildirishnoma o'zi ham vaqtinchalik narsa: o'qilgach so'nadi, tarix esa
`activity.Activity` da butunicha turibdi.
"""
from django.db import migrations, models

# Endi ishlatilmaydigan turlar
DROPPED = ["invite.received", "invite.accepted", "invite.declined", "member.joined"]


def drop_old(apps, schema_editor):
    Notification = apps.get_model("notifications", "Notification")
    Notification.objects.filter(kind__in=DROPPED).delete()


def noop(apps, schema_editor):
    """Ortga qaytarish — o'chirilgan yozuvni tiklab bo'lmaydi, lekin
    migratsiya ortga qaytishiga to'sqinlik ham qilmasin."""


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0001_squashed"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="kind",
            field=models.CharField(
                choices=[
                    ("task.assigned", "Vazifa biriktirildi"),
                    ("task.review", "Tekshiruvga tushdi"),
                    ("task.decided", "Tekshiruv natijasi"),
                    ("task.comment", "Yangi izoh"),
                    ("chat.message", "Chat xabari"),
                    ("chat.direct", "Shaxsiy xabar"),
                    ("join.request", "Qo'shilish so'rovi"),
                ],
                db_index=True, max_length=32, verbose_name="Turi",
            ),
        ),
        migrations.RunPython(drop_old, noop),
    ]
