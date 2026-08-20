# Ikki bosqichli obraz: `dev` - ishlab chiqish uchun, `prod` - serverga.
#
# NEGA IKKITA. Ilgari bitta bosqich bor edi va u `npm run dev` ni ishga
# tushirardi - ya'ni Vite ning ISHLAB CHIQISH serveri. U qulay (kod
# o'zgarishi darrov ko'rinadi), lekin serverga chiqarish uchun mo'ljallanmagan:
# fayllar siqilmaydi va minifikatsiya qilinmaydi, manba xaritalari ochiq
# qoladi, HMR uchun soket ochiq turadi va Vite ning o'zi buni ogohlantirib
# yozadi. Loyihada esa produksiya yig'ilmasiga umuman yo'l yo'q edi.
#
# Endi maqsad tanlanadi:
#   docker compose up                      -> `dev` (docker-compose.yml da yozilgan)
#   docker build --target prod ./frontend  -> yig'ilgan statik fayllar

# ---------------------------------------------------------------- asos
# Bog'liqliklar ikkala bosqichga ham kerak - bir marta o'rnatiladi.
FROM node:22-alpine AS deps

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

WORKDIR /app

# `package-lock.json` bilan birga ko'chiriladi: `npm ci` aynan undagi
# versiyalarni o'rnatadi, ya'ni bugungi va ertangi yig'ilma bir xil bo'ladi.
# `npm install` esa har safar yangi mos versiyani izlaydi va obraz sizsiz
# o'zgarib turardi.
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------- dev
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------- yig'ish
FROM deps AS build
COPY . .
# `tsc -b && vite build` - tiplar tekshiriladi, keyin yig'iladi.
# Xato bo'lsa obraz umuman qurilmaydi.
RUN npm run build

# ---------------------------------------------------------------- prod
# Statik fayllarni Node emas, nginx uzatadi - u shu ish uchun.
FROM nginx:1.27-alpine AS prod

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
