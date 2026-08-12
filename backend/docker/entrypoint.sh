#!/bin/sh
set -e

echo "==> Postgres kutilmoqda..."
until pg_isready -h "${POSTGRES_HOST:-db}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-teamflow}" >/dev/null 2>&1; do
  sleep 1
done
echo "==> Postgres tayyor."

python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py bootstrap_admin

# DEBUG=1 bo'lsa runserver ishlatamiz - kod o'zgarishi darrov qo'llanadi.
if [ "${DEBUG}" = "1" ] || [ "${DEBUG}" = "true" ]; then
  echo "==> Dev rejimi: avtomatik qayta yuklash yoqilgan"
  exec python manage.py runserver 0.0.0.0:8000
fi

exec "$@"
