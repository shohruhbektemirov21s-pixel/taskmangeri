#!/bin/sh
set -e

# Db2 konteyneri "tayyor" bo'lgach ham port bir necha soniya kechikib ochiladi,
# shuning uchun compose dagi healthcheck ustiga yana bir bor tekshiramiz.
echo "==> Db2 kutilmoqda..."
until python -c "
import socket, sys, os
s = socket.socket()
s.settimeout(3)
try:
    s.connect((os.getenv('DB2_HOST', 'db2'), int(os.getenv('DB2_PORT', '50000'))))
except Exception:
    sys.exit(1)
finally:
    s.close()
" >/dev/null 2>&1; do
  sleep 2
done
echo "==> Db2 tayyor."

# Bazani tayyorlash faqat WEB konteynerda (CMD - `daphne`). Bir xil obraz
# boshqa jarayonlar uchun ham ishlatiladi (masalan Telegram boti) va ular
# bir vaqtda `migrate` qilsa bir-birini kutib qolardi. Bot tayyor bazaga
# ulanadi, xolos.
if [ "$1" = "daphne" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput
  python manage.py bootstrap_admin
  # Boshliq - takliflarni tasdiqlaydigan yagona rol.
  python manage.py bootstrap_boss
  # Interfeys so'zlari bazadan o'qiladi. Yangi kalitlar qo'shiladi, admin
  # tahrirlagan matnlarga tegilmaydi (`--force` berilmagan).
  python manage.py seed_ui_texts

  # IXTIYORIY SOZLAMALAR HOLATI. Ular yo'q bo'lsa ilova jimgina ishlayveradi
  # va bu ataylab shunday - lekin o'shanda funksiya NEGA ishlamayotgani
  # hech qayerda ko'rinmasdi. Endi jurnalning boshida bir qatorda turadi.
  python - <<'PY'
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.conf import settings

rows = [
    ("Telegram boti", bool(settings.TELEGRAM_BOT_TOKEN),
     "TELEGRAM_BOT_TOKEN qo'yilmagan - xabar yuborilmaydi"),
    ("Telegram havolalari", bool(settings.SITE_URL),
     "SITE_URL bo'sh - xabardagi «Ochish» tugmasi chizilmaydi"),
    ("Fon oqimi", bool(settings.BACKGROUND_TASKS),
     "BACKGROUND_TASKS o'chirilgan - tashqi chaqiruvlar so'rov ichida"),
]
print("==> Ixtiyoriy sozlamalar:")
for name, on, why in rows:
    print("    [{}] {}{}".format("v" if on else " ", name, "" if on else " - " + why))
PY

  # DEBUG=1 bo'lsa runserver ishlatamiz - kod o'zgarishi darrov qo'llanadi.
  if [ "${DEBUG}" = "1" ] || [ "${DEBUG}" = "true" ]; then
    echo "==> Dev rejimi: avtomatik qayta yuklash yoqilgan"
    exec python manage.py runserver 0.0.0.0:8000
  fi
fi

# Boshqa buyruq berilgan bo'lsa - o'shani bajaramiz.
exec "$@"
