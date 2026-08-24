#!/bin/sh
# TeamFlow zaxirasi: Db2 bazasi + media fayllar.
#
# MUAMMO. Loyihada zaxira siyosati umuman yo'q edi. Yagona nusxa -
# ildizdagi `.backup/` papkasi, qo'lda ko'chirilgan media fayllar bilan;
# kim, qachon va qaysi buyruq bilan yaratgani yozilmagan. Baza esa bitta
# nusxada (`db2data` volume) - replikatsiya ham, nuqtaga qaytarish ham
# yo'q. Tranzaksiya himoyasi bilan birga bu og'ir kombinatsiya edi:
# buzilgan ma'lumotni qaytaradigan hech narsa qolmasdi.
#
# ┌─────────────────────────────────────────────────────────────────┐
# │ DIQQAT: BU OFLAYN ZAXIRA - BAZA QISQA MUDDATGA UZILADI.        │
# └─────────────────────────────────────────────────────────────────┘
#
# Sababi: `docker-compose.yml` da `ARCHIVE_LOGS: "false"`, ya'ni Db2
# aylanma (circular) jurnal rejimida. Bunday bazani ONLAYN zaxiralab
# bo'lmaydi - Db2 buni ataylab taqiqlaydi, chunki jurnal saqlanmagani
# uchun nusxa yaxlit bo'lmasligi mumkin.
#
# ONLAYN ZAXIRAGA O'TISH (ishlab turgan tizimni uzmaslik uchun):
#   1. docker exec teamflow_db2 su - db2inst1 -c \
#        "db2 update db cfg for TEAMFLOW using LOGARCHMETH1 DISK:/database/data/archive"
#   2. Bir marta OFLAYN zaxira (shu skript) - Db2 buni talab qiladi.
#   3. Shundan keyin `db2 backup ... online` ishlaydi.
#   Narxi: arxiv jurnallari disk egallaydi va ularni ham tozalab turish kerak.
#
# ISHLATISH (xostdan):
#   bash docker/backup.sh              -> ./backups/ ga yozadi
#   bash docker/backup.sh /mnt/zaxira  -> boshqa joyga
#
# TIKLASH - pastda, «TIKLASH» bo'limida.

set -e

OUT_DIR="${1:-./backups}"
DB_NAME="${DB2_DB:-TEAMFLOW}"
DB_CONTAINER="${DB2_CONTAINER:-teamflow_db2}"
# Nechta kunlik zaxira saqlanadi. Eskisi o'chiriladi - aks holda disk
# jimgina to'ladi va o'shanda Db2 yozolmay qoladi.
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

echo "==> TeamFlow zaxirasi: $STAMP"

# ---------------------------------------------------------------- media
# Media BIRINCHI: u bazadan mustaqil va uzilish talab qilmaydi.
echo "--> Media fayllar..."
docker run --rm \
  -v hjasdhkjahskdha_backend_media:/media:ro \
  -v "$(pwd)/$OUT_DIR":/out \
  alpine tar czf "/out/media-$STAMP.tar.gz" -C /media . 2>/dev/null \
  || echo "    (media volume topilmadi - o'tkazib yuborildi)"

# ---------------------------------------------------------------- baza
echo "--> Db2 bazasi (baza qisqa muddatga uziladi)..."

# Ulanishlarni uzamiz: oflayn zaxira band bazani qabul qilmaydi.
# `force application all` - ochiq sessiyalarni yopadi; backend keyin
# o'zi qayta ulanadi (`CONN_MAX_AGE`).
docker exec "$DB_CONTAINER" su - db2inst1 -c "
  db2 connect to $DB_NAME > /dev/null 2>&1 || true
  db2 quiesce database immediate force connections > /dev/null 2>&1 || true
  db2 connect reset > /dev/null 2>&1 || true
  db2 force application all > /dev/null 2>&1 || true
  db2 deactivate database $DB_NAME > /dev/null 2>&1 || true
  mkdir -p /database/data/backups
  db2 backup database $DB_NAME to /database/data/backups compress
  db2 unquiesce database > /dev/null 2>&1 || true
  db2 activate database $DB_NAME > /dev/null 2>&1 || true
"

# Zaxira nusxasini konteynerdan tashqariga chiqaramiz: `db2data` volume
# ning o'zi yo'qolsa ichidagi zaxira ham yo'qoladi - ya'ni u zaxira emas.
echo "--> Nusxani tashqariga ko'chirish..."
LATEST="$(docker exec "$DB_CONTAINER" sh -c 'ls -1t /database/data/backups | head -1')"
docker cp "$DB_CONTAINER:/database/data/backups/$LATEST" "$OUT_DIR/db2-$STAMP.bk"

# ---------------------------------------------------------------- tozalash
echo "--> $KEEP_DAYS kundan eski zaxiralar o'chirilmoqda..."
find "$OUT_DIR" -maxdepth 1 -name 'db2-*.bk' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
find "$OUT_DIR" -maxdepth 1 -name 'media-*.tar.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
# Konteyner ichidagilar ham - u yerda ular faqat oraliq nusxa.
docker exec "$DB_CONTAINER" sh -c \
  "find /database/data/backups -type f -mtime +2 -delete 2>/dev/null || true"

echo "==> Tayyor:"
ls -lh "$OUT_DIR" | tail -5

# ==================================================================
# TIKLASH
#
# ZAXIRA SINALMAGUNCHA ZAXIRA EMAS. Uni yiliga bir marta bo'lsa ham
# sinab ko'ring - eng yomon vaqti tiklash kerak bo'lgan kun.
#
#   1. Faylni konteynerga qaytaring:
#        docker cp backups/db2-<stamp>.bk teamflow_db2:/database/data/backups/
#
#   2. Bazani to'xtatib tiklang:
#        docker exec teamflow_db2 su - db2inst1 -c "
#          db2 force application all
#          db2 deactivate database TEAMFLOW
#          db2 restore database TEAMFLOW from /database/data/backups taken at <YYYYMMDDHHMMSS>
#          db2 activate database TEAMFLOW"
#
#      `<YYYYMMDDHHMMSS>` - fayl nomining ichidagi vaqt belgisi.
#
#   3. Media fayllarni qaytaring:
#        docker run --rm -v hjasdhkjahskdha_backend_media:/media \
#          -v "$(pwd)/backups":/in alpine \
#          tar xzf /in/media-<stamp>.tar.gz -C /media
#
#   4. Backendni ko'taring va tekshiring:
#        docker compose up -d backend
#        curl -s localhost:8010/api/health/
# ==================================================================
