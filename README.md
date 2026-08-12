# TeamFlow

Jamoa, loyiha va vazifalarni boshqarish platformasi — ClickUp uslubidagi vazifa boshqaruvi
va GitHub uslubidagi ish maydonlari (workspaces) birlashtirilgan.

**Arxitektura:** backend va frontend to'liq ajratilgan.

| Qism | Texnologiya | Manzil |
|------|-------------|--------|
| Backend | Python 3.12 · Django 5.2 · Django REST Framework · JWT | http://localhost:8010/api |
| Frontend | Node 22 · React 19 · TypeScript · Vite 7 | http://localhost:5183 |
| Ma'lumotlar bazasi | PostgreSQL 16 | localhost:5443 |
| Konteynerlar | Docker Compose (3 servis) | — |

---

## Ishga tushirish

```bash
cp backend/.env.example backend/.env      # sozlamalar
docker compose up --build
```

Tayyor bo'lgach:

- Interfeys — http://localhost:5183
- API — http://localhost:8010/api/health/
- Django admin — http://localhost:8010/django-admin/

Birinchi admin `.env` asosida avtomatik yaratiladi:

```
admin@teamflow.uz / admin12345
```

---

## Rollar va ruxsatlar

| Rol | Imkoniyatlari |
|-----|---------------|
| **Admin** (tizim) | Hamma loyihani ko'radi, vazifalarni tekshiradi, yo'nalish beradi, foydalanuvchi rollarini boshqaradi |
| **Loyiha menejeri** | O'z loyihasini boshqaradi, qo'shilish so'rovlarini qabul qiladi, vazifa taqsimlaydi va tekshiradi |
| **Dasturchi / QA** | O'ziga biriktirilgan vazifalarni bajaradi, holatni suradi, izoh va ish jurnali qoldiradi |
| **Kuzatuvchi** | Faqat o'qiydi |

Ruxsatlar bitta joyda — `backend/apps/core/permissions.py` (`ProjectAccess`).

---

## Mutaxassisliklar

Ro'yxatdan o'tish sodda: **F.I.Sh · Email · Mutaxassislik · Parol**.
Daraja va tajriba keyinchalik profilda to'ldiriladi.

Mutaxassislik tanlash **majburiy**. 11 ta yo'nalish:
Backend, Frontend, Fullstack, Mobil, DevOps, QA, UI/UX dizayner, Data/ML,
Biznes tahlilchi, Xavfsizlik, Loyiha menejeri.

Tanlov butun tizimga ta'sir qiladi:

- profil ko'nikmalari avtomatik to'ldiriladi;
- loyihalar ro'yxatida **sizga mos** loyihalar birinchi ko'rsatiladi (`?matching=1`);
- menejer vazifa berayotganda mos mutaxassislar tavsiya qilinadi va yuklamasi ko'rinadi;
- vazifaga `required_specialty` qo'yilsa, mos kelmaydigan ijrochilar ogohlantiriladi;
- ko'plab vazifa berishda ishlar faqat mos mutaxassislar orasida taqsimlanadi;
- har bir yo'nalish uchun **sifat ro'yxati** (checklist) ko'rsatiladi.

Katalog: `backend/apps/accounts/specialties.py`.

---

## Vazifa hayoti

```
BACKLOG → TODO → JARAYONDA → TEKSHIRUVDA → BAJARILDI
                     ↑            ↓
              TUZATISH KERAK ←────┘        (+ TO'XTAB QOLGAN, BEKOR QILINGAN)
```

- Dasturchi o'zini `BAJARILDI` holatiga **o'tkaza olmaydi** — faqat tekshiruvchi.
- Tekshiruvda qaytarish **izohsiz mumkin emas** (server 400 qaytaradi).
- Har bir tekshiruv aylanasi (`review_round`) tarixda saqlanadi.

---

## Loyiha tarixi

Har bir harakat `Activity` jadvaliga yoziladi va **hech qachon o'chirilmaydi**:

- **Tarix** (`/loyiha/:id/tarix`) — kim/qachon/nima qilgani, filtr bilan;
- **Dasturchi hisoboti** (`/loyiha/:id/dasturchi/:userId`) — bajargan ishlari, sarflagan soati,
  qaytarilgan tasklari, ish jurnali yozuvlari;
- **Loyihaga kirish** (`/loyiha/:id/kirish`) — yangi dasturchi 10 daqiqada kontekstga kirishi uchun:
  brif, kim nima qilgan, muhim qarorlar, takrorlanmasligi kerak bo'lgan xatolar;
- **Brif** (`/loyiha/:id/brif`) — maqsad, texnologiyalar, arxitektura, ishga tushirish,
  kelishuvlar, tayyorlik mezoni, "ehtiyot bo'ling", kim nima bo'yicha javob beradi;
- **Topshiriq eslatmasi** — dasturchi loyihadan chiqishda keyingi odam uchun izoh qoldiradi.

---

## Fayllar

Har bir vazifaga fayl biriktirish mumkin (skrinshot, hujjat, log, arxiv — 25 MB gacha):
sudrab tashlash yoki tanlash, rasmlar oldindan ko'rinadi, o'chirishni faqat yuklagan odam
yoki menejer qila oladi. Har bir amal tarixga yoziladi.

---

## API

Autentifikatsiya: `Authorization: Bearer <access>` (JWT, 12 soat; refresh 14 kun).

| Endpoint | Tavsif |
|----------|--------|
| `POST /api/auth/register/` | Ro'yxatdan o'tish (mutaxassislik majburiy) |
| `POST /api/auth/login/` · `refresh/` | Kirish va token yangilash |
| `GET /api/auth/specialties/` | Mutaxassisliklar katalogi (ochiq) |
| `GET/PATCH /api/auth/me/` | O'z profili |
| `GET /api/users/` · `PATCH /api/users/:id/role/` | Foydalanuvchilar (filtr: `specialty`, `seniority`, `role`) |
| `GET/POST /api/workspaces/` · `:slug/join/` | Ish maydonlari |
| `GET/POST /api/projects/` | Loyihalar (`scope=mine\|managed\|discover\|all`, `matching=1`) |
| `POST /api/projects/:id/join/` | Qo'shilish so'rovi |
| `GET /api/projects/:id/requests/` · `:rid/decide/` | So'rovlarni ko'rish va hal qilish |
| `GET/POST /api/projects/:id/members/…` | Jamoa (qo'shish, rol, chiqarish) |
| `GET/PATCH /api/projects/:id/brief/` | Loyiha brifi |
| `GET/POST /api/tasks/` | Vazifalar (filtr: status, assignee, priority, open, overdue) |
| `POST /api/tasks/bulk/` | Ko'plab vazifa yaratish va taqsimlash |
| `GET /api/tasks/board/?project=` | Kanban doska |
| `GET /api/tasks/suggest-assignees/` | Mutaxassislikka mos ijrochilar tavsiyasi |
| `POST /api/tasks/:id/status/` | Holatni o'zgartirish (ruxsat tekshiriladi) |
| `GET/POST /api/tasks/:id/attachments/` · `DELETE …/:aid/` | Fayllar |
| `POST /api/tasks/:id/comments/` · `worklogs/` | Izoh va ish jurnali |
| `GET /api/tasks/review-queue/` · `POST /api/tasks/:id/review/` | Tekshiruv |
| `GET /api/activity/` | Tarix (filtr: project, actor, category, days, search) |
| `GET /api/activity/developer-report/` | Dasturchi hisoboti |
| `GET /api/activity/onboarding/` | Loyihaga kirish to'plami |
| `GET /api/dashboard/` · `my-work/` · `meta/` | Panel, mening ishim, ma'lumotnomalar |

---

## Tuzilma

```
.
├── docker-compose.yml          # db + backend + frontend
├── backend/
│   ├── Dockerfile
│   ├── config/                 # settings, urls, wsgi
│   └── apps/
│       ├── accounts/           # foydalanuvchi, mutaxassisliklar, JWT
│       ├── workspaces/         # ish maydonlari
│       ├── projects/           # loyiha, a'zolik, so'rov, brif
│       ├── tasks/              # vazifa, biriktirish, izoh, tekshiruv, fayl
│       ├── activity/           # tarix, dasturchi hisoboti, onboarding
│       └── core/               # ruxsatlar, dashboard, meta
└── frontend/
    ├── Dockerfile
    └── src/
        ├── api/                # HTTP mijoz va TypeScript turlari
        ├── auth/               # AuthContext (JWT)
        ├── components/         # Layout, ui, Timeline
        ├── pages/              # sahifalar
        │   └── project/        # loyiha bo'limlari (doska, jamoa, tarix, brif...)
        └── styles/app.css      # GitHub Primer dark dizayn tizimi
```

---

## Foydali buyruqlar

DEBUG=1 bo'lganda backend `runserver` bilan ishlaydi — kod o'zgarishi darrov qo'llanadi.
DEBUG=0 da gunicorn ishga tushadi.

```bash
docker compose logs -f backend            # backend loglari
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose exec frontend npx tsc --noEmit    # TypeScript tekshiruvi
docker compose exec frontend npm run build       # prod build
docker compose down -v                    # hammasini o'chirish (baza bilan)
```

## Portlar

Standart portlar band bo'lgani uchun: **8010** (API), **5183** (interfeys), **5443** (Postgres).
O'zgartirish — `docker-compose.yml` va `backend/.env` dagi CORS/CSRF ro'yxatlari.
