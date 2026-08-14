# TeamFlow

Jamoa, loyiha va vazifalarni boshqarish platformasi — ClickUp uslubidagi vazifa boshqaruvi
va GitHub uslubidagi ish maydonlari (workspaces) birlashtirilgan.

**Arxitektura:** backend va frontend to'liq ajratilgan.

| Qism | Texnologiya | Manzil |
|------|-------------|--------|
| Backend | Python 3.12 · Django 5.2 · Django REST Framework · JWT | http://localhost:8010/api |
| Frontend | Node 22 · React 19 · TypeScript · Vite 7 | http://localhost:5183 |
| Ma'lumotlar bazasi | IBM Db2 12.1 | localhost:50000 |
| Real-time | Django Channels · Redis 7 · WebSocket | ws://localhost:5183/ws/ |
| Konteynerlar | Docker Compose (4 servis) | — |

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
| **Admin** (tizim) | Hamma loyihada hamma narsa. **Lekin loyiha menejerini chiqara olmaydi** |
| **Loyiha menejeri** | O'z loyihasida hamma narsa: vazifa berish va o'chirish, tekshirish, hujjat, a'zo qo'shish, rol berish, a'zoni tizim admini qilib tayinlash |
| **Loyiha admini** | Menejer bilan deyarli teng: vazifa berish/o'chirish, tekshirish, hujjat, a'zo qo'shish va chiqarish. **Menejerga tegmaydi** — uni chiqara ham, rolini o'zgartira ham olmaydi |
| **Dasturchi / QA** | O'ziga biriktirilgan vazifalarni bajaradi, ishni topshiradi, fayl yuklaydi, izoh va ish jurnali qoldiradi |
| **Kuzatuvchi** | Faqat o'qiydi |

**Menejer himoyalangan.** Uni na loyiha admini, na tizim admini chiqara oladi —
loyiha boshqaruvsiz qolib ketmasin. Menejer faqat o'zi chiqadi yoki boshqa
menejer almashtiradi. Istisno: loyiha menejersiz qolgan bo'lsa, tizim admini
yangi menejer tayinlay oladi (aks holda loyiha muzlab qolardi).

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

## Loyiha yaratish

Forma imkon qadar qisqa: **ish maydoni · nom · tavsif · muddat**.
Qolganini tizim o'zi to'ldiradi:

- **kalit** loyiha nomidan yasaladi (`Tolov tizimi v2` -> `TTV`) va ish maydoni ichida
  takrorlanmaydi (`backend/apps/projects/models.py` -> `generate_key`);
- **rang** palitradan avtomatik tanlanadi — bitta ish maydonidagi loyihalar
  ro'yxatda bir-biridan ajralib tursin (`pick_color`).

Ikkalasi ham API da `read_only` — tashqaridan o'zgartirib bo'lmaydi.
Ish maydoni rangi ham xuddi shunday avtomatik (`backend/apps/workspaces/models.py`).

---

## Jamoaga a'zo qo'shish

Uch yo'nalish bor:

- **Menejer qo'shadi** — odamni tanlaydi, u **darrov** a'zo bo'ladi (tasdiq so'ralmaydi);
- **So'rov** (`JoinRequest`) — foydalanuvchi o'zi so'raydi, menejer qabul qiladi;
- **Kod bilan** — foydalanuvchi qo'shilish kodini kiritib o'zi kiradi.

Qo'shish oqimi: menejer loyiha yoki ish maydoni sahifasidagi **«A'zo qo'shish»** da
odamni **email yoki ism bo'yicha qidirib topadi** (uzun ochiluvchi ro'yxat emas —
jamoa kattalashganda ishlamay qoladi), rol beradi va bosadi. A'zolik shu zahoti
paydo bo'ladi.

Qoida bitta joyda — `apps/core/team.py` → `add_to_project`. Ikkala endpoint ham
(`POST /api/team/add/` va `POST /api/projects/:id/members/add/`) shunga tayanadi,
shuning uchun ular hech qachon bir-biridan farq qilib ketmaydi.

Loyihaga qo'shilgan odam avtomatik ravishda loyiha ish maydoniga ham
qo'shiladi — aks holda u o'z loyihasini ko'ra olmasdi.

---

## Bildirishnoma va suhbat (real-time)

Ikkalasi ham WebSocket orqali ishlaydi — sahifani yangilash shart emas.

**Bildirishnomalar** (`apps/notifications`) — yuqoridagi qo'ng'iroqda o'qilmagan
soni bilan, `/bildirishnomalar` da to'liq ro'yxat.

Ro'yxat **ataylab qisqa** — qo'ng'iroqqa faqat javob talab qiladigan narsa tushadi:
**o'z vazifang** (biriktirildi, tekshiruvga tushdi, natija, izoh), **senga yozilgan
xabar** (chat va shaxsiy) va **qo'shilish so'rovi** (menejerga so'rov, so'ragan
odamga javobi). Har bir jamoa harakati qo'ng'iroq chalsa, odam unga qarashni
butunlay to'xtatadi. Qolgani tarixda (`activity.Activity`) yoziladi va o'chmaydi.

Chat xabarlari **bitta yozuvga yig'iladi** — 50 ta xabar 50 ta qo'ng'iroq
bo'lib ketmaydi.

**Suhbat** (`apps/chat`) uch ko'rinishda:

- **loyiha suhbati** — loyihadagi «Suhbat» bo'limi;
- **ish maydoni suhbati** — `/ish-maydoni/:slug/chat`;
- **shaxsiy yozishma** — `/xabarlar`: odamni **email yoki ism bo'yicha qidirib**
  topib, to'g'ridan-to'g'ri yoziladi. Chapda ochiq suhbatlar ro'yxati.

Tarix REST orqali yuklanadi, yangi xabarlar WebSocket orqali darrov chiqadi.
Loyiha va maydon suhbatiga yozish huquqi faqat jamoa a'zolarida; shaxsiy
yozishmani faqat o'sha ikki kishi ko'radi.

| Kanal | Manzil |
|-------|--------|
| Shaxsiy (bildirishnoma) | `ws://…/ws/notifications/?token=<access>` |
| Loyiha suhbati | `ws://…/ws/chat/project/<id>/?token=<access>` |
| Ish maydoni suhbati | `ws://…/ws/chat/workspace/<id>/?token=<access>` |
| Shaxsiy yozishma | `ws://…/ws/chat/direct/<user_id>/?token=<access>` |

Brauzer WebSocket ochayotganda header qo'sha olmaydi, shuning uchun JWT so'rov
satrida yuboriladi (`backend/config/ws_auth.py`). Ulanish uzilsa mijoz o'zi
qayta ulanadi.

---

## Ochiq qism — ro'yxatdan o'tmasdan

Bosh sahifadagi qidiruv **ishlaydi va hisob talab qilmaydi**: platformada nima
borligini ko'rmasdan turib odam ro'yxatdan o'tmaydi.

- `/qidiruv` — ochiq loyihalar ro'yxati, nom/tavsif/kalit bo'yicha qidiruv va
  mutaxassislik filtri;
- `/ochiq-loyiha/:id` — loyihaning ochiq ko'rinishi: tavsif, bajarilgani,
  jamoa tarkibi, qanday mutaxassis kerakligi va **bo'sh o'rinlar**;
- `/` bosilganda qidiruv maydoni fokuslanadi.

**Chegara qat'iy.** Ochiq API (`/api/public/…`) faqat `is_public=True`
loyihalarni beradi va faqat xavfsiz maydonlarni: qo'shilish kodi, a'zolar
ro'yxati, emaillar, vazifalar matni, fayllar va tarix **chiqmaydi**.
Menejerning faqat ismi ko'rinadi. Yopiq loyiha so'ralsa — `404`.
So'rovlar soni cheklangan (`search` scope) — ma'lumotni qirqib olishning oldini oladi.

---

## Kim nimani ko'radi

Profil sahifasida boshqa odamning **loyihalari, vazifalari, sarflagan soati va
nima qilgani** ko'rinadi (`GET /api/users/:id/work/`). Lekin ro'yxat **so'rovchining
huquqi bilan cheklanadi**: begonaning yopiq loyihasi nomi ham, o'sha loyihadagi
vazifasi ham chiqmaydi — faqat ochiq loyihalar va so'rovchi ham a'zo bo'lgan
loyihalar. Cheklov bo'lgani javobda `limited: true` bilan aytiladi.

---

## Xavfsizlik

| Chora | Qayerda |
|-------|---------|
| WebSocket Origin tekshiruvi — begona saytdan ulanib bo'lmaydi | `config/asgi.py` |
| WebSocket JWT autentifikatsiyasi, yaroqsiz token → `4401` | `config/ws_auth.py` |
| Kirish va ro'yxatdan o'tishga cheklov (20/min) — parol topishga qarshi | `accounts/api.py` |
| Chat (90/min) va a'zo qo'shish (40/soat) cheklovlari | `chat/api.py`, `core/team.py` |
| Cheklov hisoblagichi Redis da — jarayonlar orasida umumiy | `settings.CACHES` |
| Shaxsiy yozishmani faqat ikki tomon o'qiydi | `chat/api.py` → `get_queryset` |
| Xabarni faqat muallifi (yoki admin) o'chiradi | `chat/api.py` |
| Boshqa odamning ishi so'rovchi huquqi bilan cheklanadi | `accounts/api.py` → `work` |
| Bildirishnoma havolasi faqat ilova ichiga olib boradi | `components/ui.tsx` → `safePath` |
| Ochiq API faqat `is_public` loyiha va xavfsiz maydonlar | `core/public.py` |
| Rollar va ro'yxatlar frontendda qattiq yozilmagan — `/api/meta/` dan | `core/api.py` |
| Menejerni hech kim chiqara olmaydi (tizim admini ham) | `core/permissions.py` → `can_change_member` |
| Menejer rolini faqat menejer beradi | `core/permissions.py` → `can_grant_role` |
| Loyiha hujjatlarini yuklash va o'chirish — faqat jamoa (o'qish ko'rish huquqi bilan) | `projects/api.py` → `files` |
| Topshiriqni faqat muallif yoki menejer tahrirlaydi, tarix o'chmaydi | `tasks/api.py` |

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
- **Umumiy tarix** (`/tarix`) — hamma loyiha bo'ylab, lekin aralash lenta emas:
  avval **loyihalar ro'yxati** chiqadi (har birida yozuvlar soni va so'nggi
  harakat), loyihani bosgansa ichidagi yozuvlar ochiladi. Qidiruv ikki
  darajada — loyihani topish va yozuv matni ichidan izlash
  (`GET /api/activity/by-project/`);
- **Dasturchi hisoboti** (`/loyiha/:id/dasturchi/:userId`) — bajargan ishlari, sarflagan soati,
  qaytarilgan tasklari, ish jurnali yozuvlari;
- **Loyihaga kirish** (`/loyiha/:id/kirish`) — yangi dasturchi 10 daqiqada kontekstga kirishi uchun:
  brif, kim nima qilgan, muhim qarorlar, takrorlanmasligi kerak bo'lgan xatolar;
- **Brif** (`/loyiha/:id/brif`) — maqsad, texnologiyalar, arxitektura, ishga tushirish,
  kelishuvlar, tayyorlik mezoni, "ehtiyot bo'ling", kim nima bo'yicha javob beradi;
- **Topshiriq eslatmasi** — dasturchi loyihadan chiqishda keyingi odam uchun izoh qoldiradi.

---

## Fayllar

Ikki darajada, ikkalasi ham 25 MB gacha, sudrab tashlash yoki tanlash bilan,
rasmlar oldindan ko'rinadi, har bir amal tarixga yoziladi:

- **vazifa fayllari** — skrinshot, log, patch: aniq bir ishga bog'langan;
- **loyiha hujjatlari** (`/loyiha/:id/fayllar`) — texnik topshiriq, dizayn,
  shartnoma: butun loyihaga tegishli, yangi kelgan odam darrov topadi.

**O'qish loyihani ko'rish huquqi bilan bir xil:** ochiq loyihaning hujjatlarini
tizimdagi hamma ko'radi, yopiq loyihanikini esa faqat jamoa. Nima ustida
ishlanayotganini ko'rmasdan turib odam jamoaga qo'shilishga qaror qila olmaydi.
**Yozish esa jamoa ichida qoladi** — yuklashni faqat ishlayotgan a'zo qiladi.

**Hujjatni o'chirishni faqat loyihani boshqaruvchi qiladi** — menejer, loyiha
admini yoki tizim admini. Yuklagan odamning o'zi ham o'chira olmaydi: texnik
topshiriq va shartnomaga butun jamoaning ishi tayanadi, bitta odam ketayotganda
uni olib ketmasin.

---

## Ishni topshirish

Dasturchi vazifani yakunlagach **nima qilganini yozib topshiradi** va xohlasa
fayl biriktiradi (`/vazifa/:id` → «Topshirilgan ish»). Topshirilgan zahoti vazifa
**TEKSHIRUVGA** o'tadi va **menejer (yoki loyiha admini) tasdiqlamaguncha shunday
turadi** — dasturchi o'zini `BAJARILDI` qila olmaydi.

Topshiriqni **tahrirlash va o'chirish** mumkin. Har bir tahrir
`SubmissionEdit` da saqlanadi va sahifada ko'rinadi: kim, qachon, qaysi matndan
qaysi matnga o'zgartirgani. Eski matn hech qachon yo'qolmaydi.

**Biriktirilgan fayllar ham yo'qolmaydi.** Tahrirda ular umuman tegilmaydi;
topshiriq o'chirilganda esa fayllar o'chmaydi — bog' uzilib, ular vazifaning
o'zida qoladi va «Fayllar» bo'limidan ochilaveradi. Skrinshot, log va patch —
qilingan ishning isboti, matn o'chgani bilan ular kerak bo'ladi.

---

## Muddatlar — kim qachon tugatadi

`/loyiha/:id/muddatlar` — **odam bo'yicha**: har bir xodim o'z ismi-familiyasi,
qavs ichida mutaxassisligi va loyihadagi roli bilan turadi
(`Shox · (Fullstack dasturchi) Loyiha admini`), ostida esa uning ochiq
vazifalari — har biri **o'z boshlanish va tugatish sanasi** bilan. Ya'ni
«kim nimani qachon tugatadi» degan savolga to'g'ridan-to'g'ri javob.

Mutaxassislik kesimi olib tashlandi: u yig'indi ko'rsatkich edi
(«frontend qachon tugaydi») va aynan shu savolga javob bermasdi.

Sahifada **taxmin yo'q** — faqat bazaga kiritilgan sanalar. Sana qo'yilmagan
vazifa «sana qo'yilmagan» deb turadi: o'ylab topilgan sana ekranda turgani
chalkashlikdan boshqa narsa emas. Muddati o'tgan qator qizil bilan belgilanadi.

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
| `GET/POST /api/projects/:id/members/…` | Jamoa (qo'shish, rol, chiqarish, `appoint_admin`) |
| `GET/POST /api/projects/:id/files/` · `DELETE …/:fid/` | Loyiha hujjatlari |
| `GET /api/projects/:id/forecast/` | Kim qachon tugatadi (odam va mutaxassislik kesimi) |
| `GET/PATCH /api/projects/:id/brief/` | Loyiha brifi |
| `GET/POST /api/tasks/` | Vazifalar (filtr: status, assignee, priority, open, overdue) |
| `POST /api/tasks/bulk/` | Ko'plab vazifa yaratish va taqsimlash |
| `GET /api/tasks/board/?project=` | Kanban doska |
| `GET /api/tasks/suggest-assignees/` | Mutaxassislikka mos ijrochilar tavsiyasi |
| `POST /api/tasks/:id/status/` | Holatni o'zgartirish (ruxsat tekshiriladi) |
| `GET/POST /api/tasks/:id/attachments/` · `DELETE …/:aid/` | Fayllar |
| `POST /api/tasks/:id/comments/` · `worklogs/` | Izoh va ish jurnali |
| `GET/POST /api/tasks/:id/submissions/` | Ish topshirig'i (matn + fayl) |
| `PATCH/DELETE /api/tasks/:id/submissions/:sid/` | Topshiriqni tahrirlash yoki o'chirish |
| `GET /api/tasks/review-queue/` · `POST /api/tasks/:id/review/` | Tekshiruv |
| `POST /api/team/add/` | Jamoaga a'zo qo'shish (loyiha yoki ish maydoni) |
| `GET /api/team/candidates/` | Qo'shish mumkin bo'lgan odamlar (qidiruv bilan) |
| `GET /api/notifications/` · `unread-count/` | Bildirishnomalar |
| `POST /api/notifications/:id/read/` · `read-all/` | O'qildi deb belgilash |
| `GET/POST /api/chat/messages/` | Suhbat tarixi va yangi xabar (`project` / `workspace` / `direct`) |
| `GET /api/chat/messages/people/?q=` | Odam qidirish — email yoki ism bo'yicha |
| `GET /api/chat/messages/conversations/` | Shaxsiy suhbatlar ro'yxati |
| `GET /api/users/:id/work/` | Foydalanuvchining loyihalari, vazifalari, tarixi |
| `GET /api/public/projects/?q=&specialty=` | **Hisobsiz** — ochiq loyihalar qidiruvi |
| `GET /api/public/projects/:id/` | **Hisobsiz** — ochiq loyihaning ko'rinishi |
| `GET /api/public/stats/` | **Hisobsiz** — umumiy raqamlar |
| `GET /api/activity/` | Tarix (filtr: project, actor, category, days, search) |
| `GET /api/activity/by-project/?q=` | Umumiy tarix loyihalar kesimida (yozuv soni bilan) |
| `GET /api/activity/developer-report/` | Dasturchi hisoboti |
| `GET /api/activity/onboarding/` | Loyihaga kirish to'plami |
| `GET /api/dashboard/` · `my-work/` · `meta/` | Panel, mening ishim, ma'lumotnomalar |

---

## Tuzilma

```
.
├── docker-compose.yml          # db + redis + backend + frontend
├── backend/
│   ├── Dockerfile
│   ├── config/                 # settings, urls, wsgi
│   └── apps/
│       ├── accounts/           # foydalanuvchi, mutaxassisliklar, JWT
│       ├── workspaces/         # ish maydonlari
│       ├── projects/           # loyiha, a'zolik, so'rov, brif
│       ├── tasks/              # vazifa, biriktirish, izoh, tekshiruv, fayl, ish topshirig'i
│       ├── activity/           # tarix, dasturchi hisoboti, onboarding
│       ├── notifications/      # bildirishnomalar + WebSocket kanali
│       ├── chat/               # loyiha va ish maydoni suhbati
│       └── core/               # ruxsatlar, dashboard, meta
└── frontend/
    ├── Dockerfile
    └── src/
        ├── api/                # HTTP mijoz va TypeScript turlari
        ├── auth/               # AuthContext (JWT)
        ├── realtime/           # WebSocket mijozi va bildirishnoma konteksti
        ├── components/         # Layout, ui, Timeline
        ├── pages/              # sahifalar
        │   └── project/        # loyiha bo'limlari (doska, jamoa, tarix, brif...)
        └── styles/app.css      # "Liquid glass" dark dizayn tizimi
```

---

## Foydali buyruqlar

DEBUG=1 bo'lganda backend `runserver` bilan ishlaydi — kod o'zgarishi darrov qo'llanadi.
DEBUG=0 da gunicorn ishga tushadi.

```bash
docker compose logs -f backend            # backend loglari
docker compose logs -f db2                # Db2 loglari (birinchi start uzoq)
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose exec frontend npx tsc --noEmit    # TypeScript tekshiruvi
docker compose exec frontend npm run build       # prod build
docker compose down -v                    # hammasini o'chirish (baza bilan)
```

## Ma'lumotlar bazasi

IBM Db2. Django uni `apps/core/db2/` orqali ishlatadi — bu `ibm_db_django`
ustidagi yupqa tuzatish qatlami: asl adapter mintaqali vaqtni Db2 tushunmaydigan
ko'rinishda uzatib, `SQL0180N` bilan yiqilardi.

Db2 ning ikki cheklovi kod uslubiga ta'sir qilgan:

- **JSON maydon yo'q.** `supports_json_field = False`, ya'ni `models.JSONField`
  ishlatilsa Django `fields.E180` beradi va migratsiya umuman ishlamaydi.
  Shuning uchun JSON `apps/core/fields.py` → `JSONTextField` orqali oddiy matn
  ustunida saqlanadi. Kod uchun farq yo'q: `obj.meta["kalit"]` oldingidek.
  Qidiriladigan yagona ro'yxat — loyihaning kerakli yo'nalishlari — alohida
  jadvalda (`projects.ProjectSpecialty`), ya'ni indeks ustidan qidiriladi.

- **CLOB ustuni `DISTINCT` va `GROUP BY` da ishlatilmaydi** (`SQL0134N`), matn
  maydonlari esa ko'p (`bio`, `description`). Shuning uchun:
  `.distinct()` o'rniga `Exists()`, `annotate(Count(...))` o'rniga `Subquery`
  (`apps/core/queries.py`). Ikkalasi ham har qanday bazada tezroq: takror
  qatorlar umuman paydo bo'lmaydi va tashqi so'rovga `GROUP BY` qo'shilmaydi.

Db2 konteyneri og'ir: ~7 GB obraz, `privileged` rejim va birinchi ishga tushishi
bir necha daqiqa (instans, baza va jurnal fayllari yaratiladi). `docker-compose`
dagi healthcheck shuni hisobga oladi — backend baza tayyor bo'lgach ko'tariladi.

---

## Portlar

Standart portlar band bo'lgani uchun: **8010** (API), **5183** (interfeys), **50000** (Db2).
O'zgartirish — `docker-compose.yml` va `backend/.env` dagi CORS/CSRF ro'yxatlari.
