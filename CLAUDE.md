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

### Db2 sozlamasi — `docker/db2/10-teamflow-tuning.sh`

Standart Db2 katta ma'lumotga **tayyor emas**, ikkita joyda:

- **Tranzaksiya jurnali** standartda ~100 MB (`13+12` ta fayl × 1024 × 4KB).
  Bitta yirik amal shunga urilib `SQL0964C The transaction log for the
  database is full` bilan yiqiladi va butun amal orqaga qaytadi —
  40 000 ta vazifa yuklashda aynan shu bo'lgan. Endi 32 MB × (16+48) ≈ 2 GB.
- **`INSTANCE_MEMORY = AUTOMATIC`** konteynerda ham XOST xotirasidan
  hisoblanadi (~6.3 GB). Yonida boshqa konteynerlar tursa OOM qotili
  birinchi bo'lib Db2 ni o'ldiradi. Endi qat'iy 2.5 GB, `mem_limit: 3g`
  dan past: Db2 cgroup chegarasiga yetmasdan o'zini tiyadi.

Skript `/var/custom` ga ulanadi va instans **birinchi marta** yaratilganda
o'zi yuguradi. Mavjud bazaga qo'lda:

```bash
docker exec teamflow_db2 bash /var/custom/10-teamflow-tuning.sh
```

`AUTO_REORG` ham yoqilgan — usiz jadval va indekslar vaqt o'tib
parchalanadi va bir xil so'rov sekinlashib boraveradi.

> Konteyner jurnallari `max-size: 10m, max-file: 3` bilan cheklangan
> (`x-logging` langari). Usiz `json-file` cheksiz o'sadi va diskni
> to'ldirib qo'yadi — shundan keyin Db2 yozolmay qoladi.

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
docker compose exec -T frontend npm run typecheck              # tsc --noEmit
docker compose exec -T frontend npm run lint                   # eslint (react-hooks!)
docker compose exec -T frontend npm test                       # vitest
docker compose exec -T frontend npm run build                  # tsc -b && vite build
```

> `manage.py test` `EOFError` bersa — kod aybdor emas: Db2 da eski sinov
> bazasi qolib ketgan. Boshqa nom ber:
> `docker compose exec -T -e DB2_TEST_DB=TFTEST7 backend python manage.py test --noinput`

## Muhit o'zgaruvchilari

Backend `./backend/.env` faylini `env_file` orqali oladi. U yerda `DB2_*`, `REDIS_URL`, `SECRET_KEY`, `ADMIN_*`, `CORS_ALLOWED_ORIGINS` bor.

> Ildizdagi `.env` Db2 konteyneri uchun `DB2_DB` va `DB2_PASSWORD` ni beradi (docker-compose.yml o'qiydi) — qiymatlari `backend/.env` dagi bilan mos bo'lishi shart.

## Backend tuzilishi va konvensiyalar

`backend/apps/` ichida: `accounts`, `activity`, `chat`, `core`, `notifications`, `panel`, `projects`, `suggestions`, `tasks`, `telegram`, `uitexts`, `workspaces`.

### Qatlam tartibi — buzma

```
panel  →  projects · tasks · activity · accounts · workspaces  →  core
```

- **`apps/core` da domen importi BO'LMASIN.** U eng pastki qatlam: Db2
  adapteri, `JSONTextField`, yumshoq o'chirish, `related_count`, fayl
  uzatish, o'qish shlyuzi, tezlik cheklovlari (`throttles.py`) va sof
  kalendar hisobi (`periods.py`). Unga `projects`, `tasks` va boshqalarni
  import qilsang halqa qaytadi va uni sindirish uchun yana funksiya
  ichiga yashiringan importlar kerak bo'ladi.
- **Bir amalning ikkita eshigi bo'lsa, cheklov ham ikkovida bo'lsin.**
  A'zo qo'shish `/api/team/add/` da ham, `/api/projects/<id>/members/add/`
  da ham bor va ikkovi bitta servisni chaqiradi (`add_to_project`).
  `AddMemberThrottle` shu sabab `apps/core/throttles.py` da: u panelda
  turganida `projects` uni import qila olmasdi (panel ustki qatlam) va
  40/soat qoidasi ikkinchi manzil orqali chetlab o'tilardi.
- **`apps/panel` ga hech kim bog'lanmasin.** U eng ustki qavat: bir necha
  domen ustidan o'qiydigan ko'rinishlar (bosh panel, «Mening ishim», jamoa
  yuklamasi, ochiq qidiruv). Modeli yo'q.
- **Katta o'qish hisobotlari view'dan tashqarida.** `ProjectViewSet` da
  faqat marshrut qoladi, hisob esa alohida modulda: taqvim —
  `apps/projects/calendar_view.py`, muddat bashorati —
  `apps/projects/forecast.py`. Ikkovi ham sof o'qish va klassni yuzlab
  qatorga uzaytirardi.
- Loyiha ruxsatlari `apps/projects/permissions.py` da — `ProjectAccess`,
  `visible_projects_q`, `task_scope_q`, `managed_projects_q`.

### Global rollar: ko'rish va boshqarish — ikki xil savol

`permissions.py` da **uchta** yordamchi bor va ularni **aralashtirma**:

| Yordamchi | Kim | Nima uchun ishlatiladi |
| --- | --- | --- |
| `sees_all_projects` | admin, boshliq, global menejer | faqat KO'RINISH shartlari |
| `manages_all_projects` | admin, boshliq, global menejer | LOYIHA boshqaruvi |
| `runs_everything` | admin, boshliq | loyihadan TASHQARI (ish maydoni) |

- **Boshliq (`BOSS`)** — loyihalarda admin bilan teng: hamma loyihani
  ko'radi va hamma amalni bajaradi. Lekin `django-admin/` va foydalanuvchi
  rollari unga ochilmaydi — u yer `is_platform_admin` da qoladi.
- **Global menejer (`MANAGER`)** — har bir loyihada loyiha menejeri bilan
  **teng**: sozlama, a'zolik, vazifa yaratish/o'chirish, tekshirib
  tasdiqlash va loyihani o'chirish. A'zolik yozuvi shart emas.
- **Ish maydoni bundan tashqarida.** Maydonni qayta nomlash, o'chirish va
  `join_code` ni ko'rish `runs_everything` da qoladi — global menejerga
  ochilmaydi. Sababi oddiy: loyiha menejerining o'zida ham bunday huquq
  yo'q, ya'ni «loyiha menejeri bilan teng» degani buzilardi.
- **Menejerga hech kim tegmaydi** (`can_change_member`) — boshliq ham.
  Qoida rolga emas, menejerlikning o'ziga bog'langan.

`manages_all_projects` uch joyda bir vaqtda ishlatiladi va ular
**ajralmasin**: `ProjectAccess.can_manage`, `managed_projects_q` va
paneldagi qamrov (`apps/panel/api.py`). Ajralib qolsa odam loyihani ochib
amal bajara oladi-yu, panelda va tekshiruv navbatida «0» ko'radi.

Ko'rish shartiga rol qo'shsang, `visible_projects_q` bilan
`ProjectAccess.can_view` ni **birga** yangila: ajralib qolsa loyiha
ro'yxatda ko'rinib, ochilganda 403 beradi.

Shartni `if not user.is_platform_admin:` bilan **takrorlama** —
`visible_projects_q` hamma loyihani ko'radiganlar uchun bo'sh `Q()`
qaytaradi, ya'ni uni shartsiz qo'llash yetadi. Takror qoldirilgan joyda
ro'yxatlar bir-biridan uzoqlashadi: bittasiga yangi rol qo'shiladi,
ikkinchisida esdan chiqadi.

> `Q() | Q(...)` ga ehtiyot bo'l: Django bo'sh tomonni tashlab, shartni
> o'ng tomonga **qisqartiradi**. Shuning uchun «hammasini ko'radi»
> tekshiruvi OR dan oldin, alohida `if` bilan qilinadi
> (`ProjectViewSet.get_queryset`, `scope="visible"`).

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
- **Umumiy komponentlar uch faylga bo'lingan.** `components/ui.tsx` —
  ko'rinish (avatar, karta, nishon, `Pager`, `ErrorMsg`); `components/dates.tsx` —
  sana hisobi va maydonlari (`TZ`, `fmtDate`, `DateField`); `components/diff.tsx` —
  yonma-yon solishtirish. Eski import yo'li ishlayveradi (`ui.tsx` qayta
  eksport qiladi), lekin YANGI kod to'g'ridan-to'g'ri `@/components/dates`
  va `@/components/diff` dan olsin — aks holda hammasi yana umumiy
  bog'lamga qaytadi.
- **Ro'yxat so'raganda `page_size` ga shift qo'yma.** Server chegarasi 200
  (`config/pagination.py`); unga tiralgan ro'yxat JIMGINA qirqiladi. `Pager`
  komponenti va `pagesOf` / `totalOf` yordamchilari (`api/client.ts`) shu
  uchun bor. Jami sonni `count` dan ol, ekrandagi qatorlar sonidan emas.
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
  `django-admin/` da ham. Bu BILDIRISHNOMAGA ham tegishli: `actor`
  foydalanuvchini to'liq ochadi (ismi, rasmi), shuning uchun anonim
  taklifda u bo'sh ketadi va matnda ham ism bo'lmaydi
  (`apps/suggestions/services.py`). Anonimlik taklif TURIGA bog'liq
  emas — yopiq taklif ham anonim bo'la oladi.
- **Kim ovoz bergani tashqariga chiqmaydi.** `SuggestionVote` da `user` bor
  (bir odam bir marta ovoz bersin), lekin API faqat sonlarni va so'ragan
  odamning o'z tanlovini beradi. `SuggestionVote` ataylab admin panelida
  ro'yxatdan o'tkazilmagan.
- **Yopiq taklifni faqat muallif va boshliq ko'radi** — filtr `get_queryset`
  da, frontendda emas.

Tahrirlash va o'chirish — muallifga; tasdiqlash, rad etish va izoh — faqat
boshliqqa. **Tizim admini ham, loyiha menejeri ham qila olmaydi** —
menejerga hamma loyiha ochilgani bu huquqni bermaydi. Boshliq hisobi
`backend/.env` dagi `BOSS_*` dan `manage.py bootstrap_boss` orqali
yaratiladi.

Sahifadagi bo'limlar: «Barcha takliflar» (hammaga), «Tasdiqlangan» va
«Rad etilgan» (faqat boshliqqa), «Mening takliflarim» — oxirgi. Ular
serverdagi mavjud filtrlarga tayanadi (`?status=`, `?mine=1`); bo'limni
yashirish qulaylik uchun, chegara esa `get_queryset` da.

Ovoz sonlari `Count()` bilan emas, `related_count` (ichki so'rov) bilan
olinadi: Db2 `GROUP BY` ichida CLOB ustunini (`Suggestion.body`) qo'llamaydi.

**Bildirishnoma ikki nuqtada** (`apps/suggestions/services.py`): yangi
taklif — boshliqqa, qaror va izoh — muallifga. Ovoz berilgani qo'ng'iroqqa
TUSHMAYDI: u javob talab qilmaydi va boshliqning qo'ng'irog'ini kunda
o'nlab marta chalardi. Sahifa WebSocket orqali o'zi yangilanadi
(`Suggestions.tsx` dagi `useLive`) — ochiq turgan odam qayta yuklamaydi.

## Ish tartibi

1. O'zgartirishdan oldin tegishli fayllarni o'qi — taxmin qilma.
2. Backend o'zgarsa: `makemigrations` → `migrate` → `manage.py test`.
3. Frontend o'zgarsa: `npm run typecheck`, `npm run lint` va `npm test` toza
   bo'lishi shart. Lint da OGOHLANTIRISH bor (bugun 43 ta — eski `any` lar),
   lekin CI `--max-warnings 43` bilan yuguradi: YANGISI qo'shilsa qizaradi.
   Sonni oshirma — qarzni kamaytir va chegarani tushir.
4. UI o'zgarsa: Playwright MCP bilan `http://localhost:5183` ni ochib **ko'z bilan tekshir** — skrinshotni foydalanuvchidan so'rama.
5. Bo'sh holat (empty state) matnlarini unutma — ular o'zbekcha va foydalanuvchiga tushunarli bo'lsin.

## Qat'iy taqiqlar

- **Soxta/mock ma'lumot qo'shma.** Ro'yxatlar backend'dan, backend esa Db2 dan olishi shart. Vaqtinchalik "namuna" massivlar qoldirilmasin.
- **Ko'rinadigan matnni JSX ga qattiq yozma** — `tx("kalit")` ishlat va kalitni `defaults.json` ga qo'sh. Yagona istisno: `main.tsx` dagi "aloqa yo'q" xabari (lug'atsiz chiqadi).
- **Loyihani tashqariga chiqaradigan bayroq — `is_listed`, `is_public` EMAS.**
  `is_public` «ish maydoni ichida ochiq» degani; `is_listed` esa loyihani
  bosh sahifadagi **tokensiz** qidiruvga chiqaradi (`apps/panel/public.py`)
  va standarti `False`. Ikkovini aralashtirsang loyiha nomi va tavsifi
  hech kim tanlamagan holda internetga chiqib ketadi.
- **`join_code` — parol bilan bir og'irlikda.** Kod bilan kelgan so'rov
  menejerning qarorisiz, DARROV tasdiqlanadi (`ProjectViewSet.join`,
  `WorkspaceViewSet.join`). Shuning uchun u javobga faqat `can_manage`
  bo'lganda qo'shiladi (`ProjectSerializer.get_join_code`) — model maydoni
  sifatida ochib qo'yma. Qo'shilish so'rovida **boshqaruv roli
  so'ralmaydi** (`JoinRequestSerializer.MANAGING_ROLES`): `MANAGER` ham,
  `ADMIN` ham. Boshqaruv faqat beriladi (`member_action`).
- **Tizim rolini loyiha ichidan berma.** `can_appoint_admin` nomi loyiha
  roliday tuyuladi, aslida odamning `global_role` ini `ADMIN` ga
  o'tkazadi — ya'ni butun platformani ochadi. U `is_platform_admin` da
  qoladi va `runs_everything` ga qo'shilmaydi; aks holda
  `/api/users/:id/role/` dagi `IsPlatformAdmin` qulfi ma'nosiz bo'ladi.
- **Tashqi tarmoqni so'rov ichida kutma.** Telegram va shunga o'xshash
  chaqiruvlar `apps/core/background.py` dagi `run_later` orqali ketadi.
  Testlarda u joyida bajariladi (`settings.BACKGROUND_TASKS`).
- `django-admin/` marshrutini o'zgartirma — foydalanuvchi undan foydalanadi.
- N+1 so'rov yaratma; `select_related` / `prefetch_related` ishlat.
- Migratsiya fayllarini qo'lda tahrirlama, `makemigrations` orqali yarat.
- Ruxsatlarni frontendda emas, serverda tekshir; frontend faqat ko'rinishni yashirsin.

## Git

Joriy branch: 'main'  mainga push qil, o'z branchingga commit qil va foydalanuvchidan tasdiq so'ra.

## esingdan chiqmasin

malumotlarni beckenddan ol db2dan ol
