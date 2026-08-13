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

python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py bootstrap_admin

# DEBUG=1 bo'lsa runserver ishlatamiz - kod o'zgarishi darrov qo'llanadi.
if [ "${DEBUG}" = "1" ] || [ "${DEBUG}" = "true" ]; then
  echo "==> Dev rejimi: avtomatik qayta yuklash yoqilgan"
  exec python manage.py runserver 0.0.0.0:8000
fi

exec "$@"
