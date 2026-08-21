#!/bin/bash
# Db2 ni KATTA MA'LUMOTGA moslash.
#
# Bu skript IBM obrazining ilgagidan ishlaydi: instans birinchi marta
# yaratilganda `/var/db2_setup/lib/setup_db2_instance.sh` `/var/custom/`
# ichidagi hamma skriptni yuguradi. Ya'ni TOZA o'rnatishda o'zi qo'llanadi.
#
# Mavjud bazaga qo'lda qo'llash uchun:
#   docker exec teamflow_db2 bash /var/custom/10-teamflow-tuning.sh
#   docker compose restart db2
set -u

DB="${DBNAME:-TEAMFLOW}"
run() { su - db2inst1 -c "db2 -v $1"; }

echo "==> Db2 sozlanmoqda: $DB"

# ---------------------------------------------------------------- JURNAL
# ENG MUHIM SOZLAMA. Standarti 13+12 ta fayl x 1024 x 4KB = ~100 MB va
# bu KAM: bitta yirik tranzaksiya (ommaviy yuklash, katta loyihani
# o'chirish, migratsiya) shu chegaraga urilib
#
#   SQL0964C  The transaction log for the database is full
#
# bilan yiqiladi va butun amal orqaga qaytadi. 40 000 ta vazifa yuklashda
# aynan shu sodir bo'lgan.
#
# Endi: 32 MB x (16 doimiy + 48 qo'shimcha) = ~2 GB gacha. Doimiylari
# diskda oldindan band qilinadi (512 MB), qo'shimchalari esa faqat
# kerak bo'lganda olinadi va tranzaksiya tugagach qaytariladi.
run "UPDATE DB CFG FOR $DB USING LOGFILSIZ 8192 IMMEDIATE"
run "UPDATE DB CFG FOR $DB USING LOGPRIMARY 16"
run "UPDATE DB CFG FOR $DB USING LOGSECOND 48 IMMEDIATE"

# ---------------------------------------------------------------- XOTIRA
# Db2 konteynerda ham XOST xotirasiga qarab o'ziga chegara qo'yadi:
# `INSTANCE_MEMORY = AUTOMATIC(1652007)` ya'ni ~6.3 GB. Xostda 7.6 GB
# bo'lsa va yonida boshqa konteynerlar tursa, ma'lumot o'sgan sari Db2
# o'sha 6.3 GB ga intiladi va OOM qotili birinchi bo'lib uni o'ldiradi.
#
# Chegarani O'ZIMIZ qo'yamiz - 2.5 GB (655360 x 4KB). U docker-compose
# dagi `mem_limit: 3g` dan PAST: Db2 cgroup chegarasiga yetmasdan
# oldin o'zini tiyadi, ya'ni sekinlashadi, lekin o'ldirilmaydi.
run "UPDATE DBM CFG USING INSTANCE_MEMORY 655360"

# O'z-o'zini sozlash YOQIQ qoladi - yuqoridagi chegara ichida bufer
# hovuzini ish yukiga qarab o'zi taqsimlaydi.
run "UPDATE DB CFG FOR $DB USING SELF_TUNING_MEM ON"

# ---------------------------------------------------------------- PARVARISH
# Jadval va indekslar vaqt o'tib parchalanadi: o'chirilgan qatorlardan
# qolgan bo'shliq sabab bir xil so'rov sekinlashib boraveradi. Standartda
# avtomatik qayta tartiblash O'CHIQ.
run "UPDATE DB CFG FOR $DB USING AUTO_REORG ON"
run "UPDATE DB CFG FOR $DB USING AUTO_RUNSTATS ON AUTO_STMT_STATS ON"

# ---------------------------------------------------------------- QO'LLASH
# LOGFILSIZ va LOGPRIMARY faqat baza qaytadan faollashganda kuchga
# kiradi - `IMMEDIATE` ularga tegmaydi.
su - db2inst1 -c "db2 force application all" || true
sleep 3
su - db2inst1 -c "db2 deactivate database $DB" || true
su - db2inst1 -c "db2 activate database $DB" || true

echo "==> Db2 tayyor."
