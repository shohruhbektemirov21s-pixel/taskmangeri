---
name: ui-check
description: TeamFlow UI'sini brauzerda ochib o'z ko'zi bilan tekshiradi — sahifa surati, konsol xatolari, tarmoq so'rovlari va kamchiliklar ro'yxati. "Sahifani tekshir", "nima buzuq", "UI'ni ko'rib chiq", "mobil ko'rinishni tekshir" kabi so'rovlarda ishlat. Foydalanuvchidan skrinshot so'rash o'rniga shuni ishlat.
---

# UI tekshiruvi

Foydalanuvchi ilgari har safar o'zi skrinshot olib, fayl yo'lini qo'yib berardi. Endi bu shart emas — sahifani o'zing ochasan va o'zing ko'rasan.

## 1. Ilova ishlayotganini tasdiqla

```bash
cd /d/hjasdhkjahskdha
docker compose ps --format "{{.Name}}\t{{.State}}\t{{.Ports}}"
```

`teamflow_frontend` va `teamflow_backend` ishlamasa — `docker compose up -d` va Db2 sog'lom bo'lguncha kut.

## 2. Sahifani och

Playwright MCP bilan `http://localhost:5183` ni och. Kirish talab qilinsa, `backend/.env` dagi `ADMIN_EMAIL` bilan kir — parolni fayldan o'qi, javobga yozma.

## 3. Uch qatlamni birga tekshir

| Nima | Vosita | Nimani qidirasan |
|---|---|---|
| Ko'rinish | `browser_take_screenshot` | Joylashuv buzilishi, kesilgan matn, inglizcha qolib ketgan yozuvlar |
| Xatolar | `browser_console_messages` | React warning, 401/500, `undefined` xatolari |
| Ma'lumot manbai | `browser_network_requests` | Har bir ro'yxat haqiqatan `/api/...` dan kelayaptimi |

**Eng muhimi uchinchisi.** Foydalanuvchi qayta-qayta "ma'lumotlar backend va databasedan olinyaptimi?" deb so'ragan. Agar sahifada ma'lumot ko'rinsa-yu, unga mos API so'rovi bo'lmasa — bu komponentga qotirib qo'yilgan soxta ma'lumot. Buni **kamchilik sifatida yoz**.

## 4. Mobil ko'rinish

Foydalanuvchi mobil moslashuvni alohida so'ragan. `browser_resize` bilan 390×844 ga o'tkaz va yana suratga ol. Gorizontal skroll paydo bo'lsa yoki elementlar bir-birining ustiga chiqsa — kamchilik.

## 5. Natijani jadval qilib ber

Foydalanuvchi kamchiliklarni jadval ko'rinishida so'raydi:

| # | Sahifa | Kamchilik | Jiddiylik | Sabab |
|---|---|---|---|---|
| 1 | Vazifalar | Ro'yxat bo'sh, `/api/tasks/` 500 qaytaryapti | Yuqori | Server xatosi |

Jiddiylik: **Yuqori** (ishlamaydi), **O'rta** (noqulay), **Past** (ko'rinish).

Har bir qatorda dalil bo'lsin — konsol xatosi, HTTP status yoki suratdagi aniq joy. "Chiroyli emas" degan bahoni yozma.

## Tugatgach

Kamchiliklarni ro'yxatlagach **o'zing tuzatishga kirishma** — avval ro'yxatni ko'rsat va foydalanuvchi qaysi birini tuzatishni aytsin. U ko'pincha "hammasini tuzat" deydi, lekin qaror uniki.
