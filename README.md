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
| **Boshliq** | Takliflar bo'yicha qaror qabul qiladi: tasdiqlaydi, rad etadi, izoh yozadi. Yopiq takliflarni ham ko'radi. Loyiha ishlariga aralashmaydi |

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

**Loyiha qidirish** (`/loyihalar`) nom va tavsifdan tashqari **hujjat nomi**
bo'yicha ham ishlaydi: odam loyihani ko'pincha undagi fayldan eslaydi —
«texnik topshiriq qaysi loyihada edi?». Qidiruv serverda, ya'ni hali
yuklanmagan loyihalar ham topiladi. Fayl nomi bog'liq jadvalda bo'lgani uchun
`Exists()` bilan qidiriladi — `.distinct()` Db2 da CLOB ustuni tufayli
yiqilardi (pastdagi «Ma'lumotlar bazasi» ga qarang).

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
xabar** (chat va shaxsiy), **qo'shilish so'rovi** (menejerga so'rov, so'ragan
odamga javobi) va **loyiha muddati** (1 hafta va 3 kun qolganda). Har bir jamoa harakati qo'ng'iroq chalsa, odam unga qarashni
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
| Media fayllar imzolangan, 6 soatlik manzil bilan uzatiladi | `core/media.py` → `serve_media` |
| Brauzerda kod ishga tushira oladigan fayl (`.html`, `.svg`, `.js`) yuklanmaydi | `core/uploads.py` |
| Xavfsiz deb belgilanmagan tur ochilmaydi, yuklab olinadi | `core/media.py` → `INLINE_SAFE` |
| Yaroqsiz identifikator 500 emas, 404 beradi | `core/queries.py` → `object_or_404` |
| DEBUG o'chirilganda zaif `SECRET_KEY` bilan ishga tushmaydi | `config/settings.py` |

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

Fayl manzili **imzolangan**: API uni berayotganda 6 soatlik imzo qo'shadi
(`/media/...?t=...`), `serve_media` esa imzosini tekshiradi. Sababi oddiy —
brauzer `<img src>` va yangi oynadagi havolaga `Authorization` headerini
qo'sha olmaydi, ya'ni odatdagi token tekshiruvi bu yerda ishlamaydi. Imzo
ichida faylning aynan o'zi yozilgan: bitta hujjatning manzili bilan
boshqasini ochib bo'lmaydi.

**O'qish loyihani ko'rish huquqi bilan bir xil:** ochiq loyihaning hujjatlarini
tizimdagi hamma ko'radi, yopiq loyihanikini esa faqat jamoa. Nima ustida
ishlanayotganini ko'rmasdan turib odam jamoaga qo'shilishga qaror qila olmaydi.
**Yozish esa jamoa ichida qoladi** — yuklashni faqat ishlayotgan a'zo qiladi.

**Hujjatni o'chirishni faqat loyihani boshqaruvchi qiladi** — menejer, loyiha
admini yoki tizim admini. Yuklagan odamning o'zi ham o'chira olmaydi: texnik
topshiriq va shartnomaga butun jamoaning ishi tayanadi, bitta odam ketayotganda
uni olib ketmasin.

### Hujjat tahriri va eski nusxalar

Ayni nomli hujjat qayta yuklansa ro'yxatda **yangi qator paydo bo'lmaydi** —
u shu hujjatning yangi nusxasi bo'ladi va versiyasi oshadi (`v2`, `v3`…).
Eskisi yo'qolmaydi: «Tahrir tarixi» ostidan ochiladi va yuklab olinadi —
kim yuklagan, kim almashtirgan, qachon (`projects.ProjectFileVersion`).

Fayl **baytlari ko'chirilmaydi**: eski nusxaga faylning mavjud saqlash yo'li
beriladi, ya'ni diskda nusxa ko'paymaydi va eski havola ishlayveradi.

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

## Taqvim

`/taqvim` — **shu oyda nima ishda turgani**. Loyiha bitta sanada emas, butun
davri bo'yicha tasma bo'lib cho'ziladi: boshlanishdan muddatgacha. Har kunning
ustida o'sha kuni nechta loyiha ishda ekani turadi — oyning qaysi yeri tig'iz,
qaysi yeri bo'sh ekani bir qarashda ko'rinadi.

**Vazifalar ham shu yerda**, lekin ajratib: yupqaroq tasma, ustida ijrochisining
ismi. Ya'ni «kimga qanday ish berilgani» taqvimdan o'qiladi. Tugmasi bilan
o'chirib qo'yish mumkin.

Kunning ustidagi raqam — **o'sha kuni nechta loyiha boshlangani**. Ataylab
faqat boshlanish kunida: uzoq loyihada har bir katakda «1» turib qolsa, u
ma'no bermay shunchaki shovqin bo'lardi — davomiylikni tasmaning o'zi
ko'rsatib turibdi.

Kunni bosgansa pastda o'sha kunda ishda turgan loyihalar va vazifalar ro'yxati
chiqadi. Oy va tanlangan kun manzilda turadi (`?oy=2026-08&kun=2026-08-14`) —
sahifa yangilansa ham joyida qoladi.

Sana qo'yilmagan hollar yashirilmaydi:

- **boshlanish yo'q** — loyiha ochilgan kun olinadi (u har doim bor);
- **loyiha muddati yo'q** — tasma ochiq qoladi, «tugadi» deyilmaydi;
- **vazifa muddati yo'q** — taqvimda umuman turmaydi: qo'yadigan joyi yo'q,
  oy oxirigacha cho'zish esa yolg'on bo'lardi.

Ko'rish doirasi tarix sahifasidagi bilan bir xil: admin hammasini, qolganlar
a'zo bo'lgan va ochiq loyihalarni ko'radi (`GET /api/projects/calendar/?month=`).

---

## Muddat eslatmalari

Muddat o'tib ketgandan keyin «kechikdingiz» deyish kech. Shuning uchun
eslatma **oldin** keladi — loyiha tugashiga **1 hafta** va **3 kun** qolganda:

```
srf tugashiga 1 hafta qoldi     Muddat: 2027-04-09
srf tugashiga 3 kun qoldi       Muddat: 2027-04-09
```

Ikki bosqich ataylab: birinchisi rejani qayta ko'rish uchun, ikkinchisi
«endi haqiqatan shoshiling» uchun. Xabar menejerga ham, jamoaga ham boradi —
muddatni faqat menejer bilib turishi ishni tezlashtirmaydi.

Takrorlanmasligini `projects.ProjectDeadlineNotice` ta'minlaydi: bosqich va
muddat bo'yicha yagona yozuv. Muddat surilsa eslatma yangi sana uchun
qaytadan yuboriladi — bu to'g'ri, chunki bu boshqa muddat.

Tekshiruv **kuniga bir marta**, panel ochilganda o'zi ishga tushadi (qulf
Redis keshida, ya'ni bir nechta backend jarayoni bo'lsa ham xabar bitta) —
alohida rejalashtiruvchi (cron, Celery beat) qo'shish shart emas. Qo'lda
yoki aniq rejaga qo'yish uchun buyruq ham bor:

```bash
docker compose exec backend python manage.py send_deadline_reminders
docker compose exec backend python manage.py send_deadline_reminders --dry-run --date 2027-04-02
```

Mantiq bitta joyda — `backend/apps/projects/deadlines.py`.

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

## Takliflar

`/takliflar` — jamoa nima o'zgarishini so'raydi, **boshliq** qaror qiladi.

**Ikki xil taklif.** *Ochiq* — hamma ko'radi va ovoz beradi. *Yopiq* — faqat
muallif va boshliq ko'radi: jamoa oldida aytilmaydigan gap uchun (shikoyat,
maosh, shaxsiy holat). Sahifada ular alohida bo'limlarda turadi.

**Anonim taklif.** Ochiq taklifni nomi bilan ham, anonim ham yuborsa bo'ladi.
Anonim tanlansa muallif **hech kimga** — boshliqqa ham — ko'rsatilmaydi,
`django-admin/` da ham. Yopiq taklif anonim bo'lmaydi: uni baribir faqat
boshliq o'qiydi va kimga javob berishni bilishi kerak.

**Uchta tugma:** «Qo'shilaman», «Qo'shilmayman», «Betarafman». Qayta bosilsa
ovoz almashadi, o'sha tugma qayta bosilsa olib tashlanadi. **Kim ovoz
bergani hech qayerda ko'rinmaydi** — na API javobida, na admin panelida:
tashqariga faqat sonlar va so'ragan odamning o'z tanlovi chiqadi.

**Tartib.** Ro'yxat `qo'shilaman − qo'shilmayman` bo'yicha saralanadi, ya'ni
jamoa eng ko'p kutayotgan o'zgarish birinchi o'rinda turadi.

**Fayl.** Taklifga hujjat yoki rasm biriktiriladi (25 MB gacha, `.html`/`.svg`
kabi turlar qabul qilinmaydi). Kartada fayl nomi yonida **kim yuklagani**
yoziladi; anonim taklifda u ham yashiriladi.

**Kim nima qila oladi.** Tahrirlash va o'chirish — faqat taklif bergan
odamga. Tasdiqlash, rad etish va izoh — faqat boshliqqa (tizim admini ham
qila olmaydi). Rad etish sababsiz qolmaydi: izoh majburiy. Matn tahrirlansa
qaror bekor bo'ladi va taklif yana navbatga tushadi — boshliq boshqa narsani
tasdiqlagan bo'lardi.

**Boshliq hisobi** `backend/.env` dan yaratiladi (`BOSS_EMAIL`,
`BOSS_PASSWORD`, `BOSS_NAME`) — entrypoint har ishga tushishda
`manage.py bootstrap_boss` ni chaqiradi. Mavjud hisobga tegilmaydi, faqat
roli tekshiriladi.

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
| `GET /api/projects/calendar/?month=` | Oylik taqvim: loyiha va vazifa tasmalari, kunlik sanoq |
| `GET /api/projects/:id/forecast/` | Kim qachon tugatadi (odam kesimi, vazifa sanalari bilan) |
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
| `GET/POST /api/suggestions/` | Takliflar (filtr: `scope=OPEN\|CLOSED`, `status`, `mine=1`) |
| `PATCH/DELETE /api/suggestions/:id/` | Tahrirlash va o'chirish — faqat muallifga |
| `POST /api/suggestions/:id/vote/` | «Qo'shilaman / qo'shilmayman / betarafman» |
| `POST /api/suggestions/:id/decide/` | Tasdiqlash, rad etish, izoh — **faqat boshliq** |
| `GET/POST /api/suggestions/:id/files/` · `DELETE …/:fid/` | Taklif fayllari |
| `GET /api/suggestions/counts/` | Ochiq, yopiq va navbatdagilar soni |
| `GET /api/activity/` | Tarix (filtr: project, actor, category, days, search) |
| `GET /api/activity/by-project/?q=` | Umumiy tarix loyihalar kesimida (yozuv soni bilan) |
| `GET /api/activity/developer-report/` | Dasturchi hisoboti |
| `GET /api/activity/onboarding/` | Loyihaga kirish to'plami |
| `GET /api/dashboard/` · `my-work/` · `meta/` | Panel, mening ishim, ma'lumotnomalar |
| `manage.py send_deadline_reminders` | Muddat eslatmalari (buyruq; panel ham kuniga bir marta chaqiradi) |

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
│       ├── suggestions/        # takliflar: ovoz, anonimlik, boshliq qarori
│       ├── uitexts/            # interfeys matnlari (sayt so'zlari bazada)
│       └── core/               # ruxsatlar, dashboard, meta
└── frontend/
    ├── Dockerfile
    └── src/
        ├── main.tsx            # avval matnlarni yuklaydi, keyin bootstrap
        ├── bootstrap.tsx       # React daraxti (provayderlar + App)
        ├── api/                # HTTP mijoz va TypeScript turlari
        ├── auth/               # AuthContext (JWT)
        ├── i18n/               # tx() — matnlarni backenddan oladi
        ├── realtime/           # WebSocket mijozi va bildirishnoma konteksti
        ├── components/         # Layout, ui, Timeline
        ├── pages/              # sahifalar
        │   └── project/        # loyiha bo'limlari (doska, jamoa, tarix, brif...)
        └── styles/app.css      # "Liquid glass" dark dizayn tizimi
```

---

## Interfeys matnlari

Saytdagi hamma yozuv — tugma nomidan bo'sh holat xabarigacha — **bazada**
(`apps.uitexts.UiText`) turadi. Bir so'zni tuzatish uchun kodni o'zgartirib,
qayta yig'ish shart emas: `django-admin/` → «Interfeys matnlari» → tahrirlash
→ sahifani yangilash.

Kodda faqat kalit qoladi:

```tsx
import { tx } from "@/i18n";

<h2>{tx("login.hisobingizga_kiring")}</h2>
<p>{tx("ui.kun_oldin", { n: 3 })}</p>      // bazadagi matn: "{n} kun oldin"
```

Kalit `guruh.nom` ko'rinishida; guruh — sahifa yoki komponent nomi
(`login`, `dashboard`, `project_members`). Bir necha sahifada takrorlanadigan
so'zlar `common.*` guruhida.

| | |
|---|---|
| Endpoint | `GET /api/ui-texts/` — **tokensiz** (kirish sahifasi ham shundan oladi), ETag bilan: matn o'zgarmasa brauzer 304 oladi |
| Repodagi nusxa | `backend/apps/uitexts/defaults.json` |
| Urug'lantirish | `manage.py seed_ui_texts` — entrypoint har ishga tushishda chaqiradi |

`seed_ui_texts` faqat **yetishmayotgan** kalitni qo'shadi: admin tahrirlagan
matn konteyner qayta ko'tarilganda yo'qolmaydi. Repodagi holatga qaytarish
kerak bo'lsa — `--force`, ortiqcha kalitlarni tozalash uchun — `--prune`.

Frontend lug'atni ishga tushishda bir marta oladi va `localStorage` ga
saqlaydi: keyingi ochilishlarda sahifa darrov to'liq matn bilan chiziladi.

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

### Testlar

```bash
printf 'yes
' | docker compose exec -T backend python manage.py test tests
```

`yes` kerak: Db2 adapteri sinov bazasini yaratishdan oldin tasdiq so'raydi.
Baza nomi `TFTEST` — Db2 da nom 8 belgidan oshmaydi, adapter esa unga `t_`
qo'shadi, ya'ni `t_TEAMFLOW` yaroqsiz nom bo'lardi (`settings.DATABASES.TEST`).

Nimalar qulflangan: fayl ruxsatlari va yuklash qoidalari, yaroqsiz
identifikator uchun 404, tranzaksiya yaxlitligi, vazifa raqami, suhbat oqimi
va **so'rovlar soni** — `tests/test_queries.py` qatorlar ko'payganda so'rov
soni oshib ketmasligini tekshiradi, ya'ni N+1 qaytib kelsa test yiqiladi.

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

## Vaqt

Sayt **Toshkent vaqtida** ishlaydi — brauzer qaysi mintaqada bo'lishidan qat'i
nazar. Server `TIME_ZONE=Asia/Tashkent` va `USE_TZ=True` bilan ishlaydi
(bazada UTC, javobda mintaqali ISO), interfeys esa sanani ko'rsatishda ham,
`datetime-local` maydonini to'ldirishda ham `Asia/Tashkent` ga qadab qo'yilgan
(`components/ui.tsx` → `TZ`, `fmtDateTime`, `toDateTimeInput`).

Siljish qo'lda `+5` deb yozilmagan, `Intl` dan olinadi: mintaqa qoidasi
o'zgarsa kod jim ravishda noto'g'ri bo'lib qolmasin. Chet eldan kirgan odamga
muddat boshqa soatda ko'rinsa, jamoa bir-birini tushunmay qolardi.

---

## Portlar

Standart portlar band bo'lgani uchun: **8010** (API), **5183** (interfeys), **50000** (Db2).
O'zgartirish — `docker-compose.yml` va `backend/.env` dagi CORS/CSRF ro'yxatlari.
