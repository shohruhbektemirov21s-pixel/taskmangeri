---
name: db-check
description: TeamFlow bazasidagi ma'lumotni Django ORM orqali tekshiradi (Db2, Docker ichida). "Bazada nima bor", "ma'lumot saqlanyaptimi", "demo ma'lumotlarni o'chir", "ustun turi qanday" kabi so'rovlarda ishlat. psql yoki to'g'ridan-to'g'ri SQL ishlatma.
---

# Baza tekshiruvi

Loyiha **IBM Db2** ishlatadi va u Docker ichida. `psql` bu yerda ishlamaydi. Bazaga yagona ishonchli yo'l — konteyner ichidagi Django ORM.

## Asosiy shakl

```bash
docker exec teamflow_backend python manage.py shell -c "
from apps.tasks.models import Task
print(Task.objects.count())
"
```

Ko'p qatorli skript kerak bo'lsa, faylni uzatib yubor:

```bash
cd /d/hjasdhkjahskdha
docker compose exec -T backend python manage.py shell < skript.py
```

## Model xaritasi

| App | Asosiy modellar |
|---|---|
| `accounts` | `User` (email orqali kirish, `AUTH_USER_MODEL`) |
| `workspaces` | Ish maydoni va a'zolik |
| `projects` | Loyihalar, muddatlar (`deadlines.py`) |
| `tasks` | Vazifalar |
| `chat` | Xabarlar |
| `notifications` | Bildirishnomalar |
| `activity` | Harakatlar tarixi |

Model nomiga ishonchsiz bo'lsang, avval o'qi:

```bash
grep -n "^class " backend/apps/tasks/models.py
```

## Ko'p so'raladigan tekshiruvlar

**Ma'lumot haqiqatan bazadanmi** — sahifadagi sonni ORM sonini bilan solishtir:

```bash
docker exec teamflow_backend python manage.py shell -c "
from apps.tasks.models import Task
from apps.workspaces.models import Workspace
for w in Workspace.objects.all():
    print(w.id, w.name, Task.objects.filter(project__workspace=w).count())
"
```

**Bo'sh jadvallarni topish** — qaysi model umuman to'ldirilmagan:

```bash
docker exec teamflow_backend python manage.py shell -c "
from django.apps import apps
for m in apps.get_models():
    try: print(m._meta.label, m.objects.count())
    except Exception as e: print(m._meta.label, 'XATO', e)
"
```

**Ustun turi / migratsiya holati:**

```bash
docker compose exec -T backend python manage.py showmigrations
docker compose exec -T backend python manage.py makemigrations --check --dry-run
```

## O'chirishdan oldin

Foydalanuvchi "demo/test ma'lumotlarni o'chir" deb so'raydi. O'chirishdan **oldin**:

1. Nima o'chishini sanab ko'rsat (`.count()` bilan) va tasdiq so'ra.
2. Faqat aniq belgilangan yozuvlarni o'chir — butun jadvalni tozalama.
3. O'chirgach yana sanab, natijani ayt.

`User` yozuvlarini o'chirishda ehtiyot bo'l — `ADMIN_EMAIL` hisobi qolishi kerak, aks holda tizimga kira olmaysan.

## Db2 nuance

Vaqt maydonlarida g'alati xato ko'rsang (`SQL0180N`), sabab `apps/core/db2/` adapteri bo'lishi mumkin — u mintaqali vaqtni UTC ga keltirib beradi. Adapterni o'chirma; xatoni shu kontekstda tekshir.
