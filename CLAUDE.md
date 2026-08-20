# TeamFlow

Vazifa boshqaruv tizimi. Repo: `shohruhbektemirov21s-pixel/taskmangeri`. Ildiz: `D:\hjasdhkjahskdha`.

## Muloqot va til

- Foydalanuvchi bilan **o'zbek tilida** yoz.
- **UI matnlari o'zbekcha bo'lishi shart.** Kod identifikatorlari, o'zgaruvchi nomlari, commit xabarlari va test nomlari inglizcha qoladi.
- **UI matnini kodga qattiq yozma** — u bazadan keladi, pastdagi «Interfeys matnlari» bo'limiga qara.
- `LANGUAGE_CODE = "uz"`, `TIME_ZONE = "Asia/Tashkent"`.

## Stack

**Backend** — Django 5.2.6, DRF 3.16.1, SimpleJWT 5.5.1, channels 4.2 (WebSocket), django-filter, Pillow, whitenoise.
**Ma'lumotlar bazasi** — IBM Db2 (`ibm_db_django` 1.6.0.0 ustida o'z adapterimiz bilan).
**Kanal qatlami** — Redis 7.
**Frontend** — React 19, Vite 7, TypeScript 5.8, react-router-dom 7. Boshqa UI kutubxonasi yo'q — CSS qo'lda yozilgan.

## Docker — hamma narsa konteynerda ishlaydi

| Servis | Konteyner | Port (host → ichki) |
| --- | --- | --- |
| db2 | `teamflow_db2` | 50000 → 50000 |
| redis | `teamflow_redis` | — |
| backend | `teamflow_backend` | **8010** → 8000 |
| frontend | `teamflow_frontend` | **5183** → 5173 |

Brauzerda ochiladigan manzillar: frontend `http://localhost:5183`, API `http://localhost:8010/api/`, Django admin `http://localhost:8010/django-admin/`.

Hostda `python` yoki `npm` ni to'g'ridan-to'g'ri ishlatma — konteyner ichida ishlat:

```bash
cd /d/hjasdhkjahskdha
docker compose up -d
docker compose exec -T backend python manage.py <buyruq>
docker compose exec -T frontend npm run <script>
```

`docker exec teamflow_backend ...` ham ishlaydi va tezroq — mavjud konteynerga bevosita kiradi.

> Db2 konteyneri og'ir: birinchi ishga tushishi bir necha daqiqa (healthcheck `start_period: 480s`). `depends_on` sog'lomlikni kutadi, shuning uchun `backend` darrov ko'tarilmasligi normal.

## Buyruqlar

```bash
# Backend
docker compose exec -T backend python manage.py makemigrations
docker compose exec -T backend python manage.py migrate
docker compose exec -T backend python manage.py test --noinput   # Django test runner (pytest YO'Q; --noinput shart - aks holda ibm_db_django interaktiv savol berib qotib qoladi)

# Bazani o'qish — SQL emas, ORM orqali
docker exec teamflow_backend python manage.py shell -c "
from apps.tasks.models import Task
print(Task.objects.count())
"

# Frontend
docker compose exec -T frontend npx tsc --noEmit               # lint = type-check
docker compose exec -T frontend npm run build                  # tsc -b && vite build
```

## Muhit o'zgaruvchilari

Backend `./backend/.env` faylini `env_file` orqali oladi. U yerda `DB2_*`, `REDIS_URL`, `SECRET_KEY`, `ADMIN_*`, `CORS_ALLOWED_ORIGINS` bor.

> Ildizdagi `.env` Db2 konteyneri uchun `DB2_DB` va `DB2_PASSWORD` ni beradi (docker-compose.yml o'qiydi) — qiymatlari `backend/.env` dagi bilan mos bo'lishi shart.

## Backend tuzilishi va konvensiyalar

`backend/apps/` ichida: `accounts`, `activity`, `chat`, `core`, `notifications`, `projects`, `suggestions`, `tasks`, `telegram`, `uitexts`, `workspaces`.

- **API view'lar `api.py` da yoziladi, `views.py` da emas.** Bu loyihaning konvensiyasi — buzma.
- Biznes-mantiq `services.py` ga chiqariladi (`activity`, `chat`, `notifications` da shunday).
- `AUTH_USER_MODEL = "accounts.User"`, autentifikatsiya email orqali (`apps/accounts/backends.py`).
- Marshrutlar: `/api/auth/` → accounts, qolgan hammasi `/api/` ostida app'larning `urls.py` sidan yig'iladi.
- WebSocket: `chat/consumers.py`, `notifications/consumers.py` + mos `routing.py`. `ASGI_APPLICATION = "config.asgi.application"`.

### Db2 adapteri — tegmang

`backend/apps/core/db2/` — `ibm_db_django` ustidagi yupqa tuzatish qatlami. `ENGINE = "apps.core.db2"`.

Sababi: `USE_TZ = True` bo'lgani uchun Django mintaqali (aware) vaqt beradi, `ibm_db_django` esa uni `TIMESTAMP('...+00:00')` ko'rinishida uzatadi va Db2 buni tushunmay `SQL0180N` bilan yiqiladi. Adapter vaqtni UTC ga keltirib, mintaqasiz qilib beradi.

Bu qatlamni olib tashlasang migratsiyalar birinchi yozuvdayoq buziladi.

## Frontend tuzilishi

`frontend/src/` ichida: `api/`, `auth/`, `components/`, `i18n/`, `nav/`, `pages/` (+ `pages/project/`), `realtime/`, `styles/`.

- Marshrutlash — `react-router-dom` v7.
- Real-time ulanishlar `realtime/` da.
- API chaqiruvlari `api/` orqali; komponent ichida `fetch` yozma.
- Vite proxy: `VITE_API_URL=/api`, `VITE_PROXY_TARGET=http://backend:8000`.
- Kirish nuqtasi ikkiga bo'lingan: `main.tsx` matnlarni yuklaydi, so'ng `bootstrap.tsx` ni **dinamik** import qiladi. Bu tartibni buzma — sababi quyida.

## Interfeys matnlari (sayt so'zlari)

Saytdagi hamma yozuv Db2 da, `apps.uitexts.UiText` jadvalida turadi va
`django-admin/` dan tahrirlanadi. Kodda faqat kalit qoladi:

```tsx
import { tx } from "@/i18n";

<h2>{tx("login.hisobingizga_kiring")}</h2>
<p>{tx("ui.kun_oldin", { n: 3 })}</p>     // matn: "{n} kun oldin"
```

| Qism | Joyi |
| --- | --- |
| Model va admin | `backend/apps/uitexts/` |
| Endpoint | `GET /api/ui-texts/` — **tokensiz**, ETag bilan (o'zgarmasa 304) |
| Repodagi nusxa | `backend/apps/uitexts/defaults.json` (`{kalit: {value, note}}`) |
| Urug'lantirish | `manage.py seed_ui_texts` (`--force` — repodagi holatga qaytaradi, `--prune` — ortiqchasini o'chiradi) |
| Frontend | `frontend/src/i18n/index.ts` — `tx(kalit, o'rinEgalari?)` |

**Yangi matn qo'shish:** `defaults.json` ga kalit yoz → `seed_ui_texts` → kodda
`tx("kalit")`. Entrypoint har ishga tushishda `seed_ui_texts` ni chaqiradi,
shuning uchun yangi kalitlar o'zi paydo bo'ladi; admin tahrirlagan matnga
tegilmaydi.

**Funksiya nomi `t` EMAS, `tx`** — loyihada `t` allaqachon vazifa (task)
o'zgaruvchisi sifatida 20 ta faylda ishlatilgan.

**Nega `main.tsx` alohida.** `tx()` faqat komponent ichida emas, modul
darajasidagi jadvallarda ham chaqiriladi (masalan `Dashboard.tsx` dagi davr
nomlari). Bunday chaqiruv modul birinchi import qilinganda bir marta
bajariladi. Agar lug'at o'sha paytda bo'sh bo'lsa, o'sha yozuvlar butun seans
davomida kalit ko'rinishida qolib ketadi. Shuning uchun `main.tsx` ilova
modullarini statik import QILMAYDI — avval lug'at keladi, keyin `bootstrap.tsx`.

## Takliflar (`apps/suggestions`)

Jamoa taklif beradi, **boshliq** (`GlobalRole.BOSS`) qaror qiladi. Uchta
qoida kodda ham, testda ham qulflangan — buzma:

- **Anonim taklifda muallif hech kimga ko'rsatilmaydi** — boshliqqa ham,
  `django-admin/` da ham.
- **Kim ovoz bergani tashqariga chiqmaydi.** `SuggestionVote` da `user` bor
  (bir odam bir marta ovoz bersin), lekin API faqat sonlarni va so'ragan
  odamning o'z tanlovini beradi. `SuggestionVote` ataylab admin panelida
  ro'yxatdan o'tkazilmagan.
- **Yopiq taklifni faqat muallif va boshliq ko'radi** — filtr `get_queryset`
  da, frontendda emas.

Tahrirlash va o'chirish — muallifga; tasdiqlash, rad etish va izoh — faqat
boshliqqa (tizim admini ham qila olmaydi). Boshliq hisobi `backend/.env`
dagi `BOSS_*` dan `manage.py bootstrap_boss` orqali yaratiladi.

Ovoz sonlari `Count()` bilan emas, `related_count` (ichki so'rov) bilan
olinadi: Db2 `GROUP BY` ichida CLOB ustunini (`Suggestion.body`) qo'llamaydi.

## Ish tartibi

1. O'zgartirishdan oldin tegishli fayllarni o'qi — taxmin qilma.
2. Backend o'zgarsa: `makemigrations` → `migrate` → `manage.py test`.
3. Frontend o'zgarsa: `npx tsc --noEmit` toza bo'lishi shart.
4. UI o'zgarsa: Playwright MCP bilan `http://localhost:5183` ni ochib **ko'z bilan tekshir** — skrinshotni foydalanuvchidan so'rama.
5. Bo'sh holat (empty state) matnlarini unutma — ular o'zbekcha va foydalanuvchiga tushunarli bo'lsin.

## Qat'iy taqiqlar

- **Soxta/mock ma'lumot qo'shma.** Ro'yxatlar backend'dan, backend esa Db2 dan olishi shart. Vaqtinchalik "namuna" massivlar qoldirilmasin.
- **Ko'rinadigan matnni JSX ga qattiq yozma** — `tx("kalit")` ishlat va kalitni `defaults.json` ga qo'sh. Yagona istisno: `main.tsx` dagi "aloqa yo'q" xabari (lug'atsiz chiqadi).
- `django-admin/` marshrutini o'zgartirma — foydalanuvchi undan foydalanadi.
- N+1 so'rov yaratma; `select_related` / `prefetch_related` ishlat.
- Migratsiya fayllarini qo'lda tahrirlama, `makemigrations` orqali yarat.
- Ruxsatlarni frontendda emas, serverda tekshir; frontend faqat ko'rinishni yashirsin.

## Git

Joriy branch: 'main'  mainga push qil, o'z branchingga commit qil va foydalanuvchidan tasdiq so'ra.

## esingdan chiqmasin

malumotlarni beckenddan ol db2dan ol
