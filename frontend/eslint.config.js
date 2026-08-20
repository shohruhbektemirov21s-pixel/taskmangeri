/**
 * ESLint - `tsc` ko'rmaydigan xatolar uchun.
 *
 * NEGA KERAK BO'LDI. Kodda olti joyda shunday izoh turardi:
 *
 *     // eslint-disable-next-line react-hooks/exhaustive-deps
 *
 * ESLint esa loyihada UMUMAN o'rnatilmagan edi - ya'ni bu izohlar hech
 * nimani o'chirmasdi, chunki o'chiradigan narsaning o'zi yo'q edi. Har
 * biri ostida haqiqiy va ataylab qilingan qisqartma yotibdi (sabablari
 * o'sha joyda izohlangan), lekin ularni tekshiradigan hech kim yo'q edi:
 * yangi effektga bog'liqlik qo'shish esdan chiqsa, `tsc` jim qolardi.
 *
 * `react-hooks` - React loyihasidagi eng qimmat qoida to'plami. Effekt
 * bog'liqliklari va shartli hook chaqiruvlari aynan shu yerda tutiladi
 * va ular ishlab chiqishda emas, foydalanuvchida - eski ma'lumot yoki
 * "hook order changed" ko'rinishida chiqadi.
 *
 * QAT'IYLIK DARAJASI ataylab past: bu allaqachon yozilgan 16 ming qatorga
 * keyin qo'shilgan tekshiruv. Faqat HAQIQIY xato beradigan qoidalar
 * `error`, uslub masalalari esa umuman yoqilmagan - `tsc` bilan
 * takrorlanadigan tekshiruvlar ham o'chirilgan.
 */
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // ------------------------------------------------ ASOSIY MAQSAD
      ...reactHooks.configs.recommended.rules,
      // Bog'liqlik ro'yxati - OGOHLANTIRISH, xato emas. Loyihada oltita
      // joyda u ataylab qisqartirilgan va har birining sababi izohda
      // yozilgan. `error` qilib qo'ysak CI qizarardi-yu, to'g'ri javob
      // "izohni o'chirish" bo'lmasdi.
      "react-hooks/exhaustive-deps": "warn",
      // Bu esa QAT'IY: shartli yoki sikl ichidagi hook chaqiruvi React ni
      // buzadi va xatosi butunlay boshqa joyda chiqadi.
      "react-hooks/rules-of-hooks": "error",

      // Vite ning issiq almashinuvi (HMR) faqat komponent eksport
      // qilinadigan modulda ishlaydi. Ogohlantirish: `ui.tsx` da
      // komponent ham, yordamchi funksiya ham bor - bu bilib qilingan.
      "react-refresh/only-export-components": "off",

      // ------------------------------------- `tsc` bilan TAKRORLANADI
      // TypeScript bularni o'zi va aniqroq tekshiradi.
      "no-undef": "off",
      "no-unused-vars": "off",

      // ----------------------------------------- LOYIHAGA MOSLASHTIRISH
      // `any` kodda 36 marta uchraydi - ko'pi `api.get<any>` da, ya'ni
      // server javobining shakli hali tiplanmagan joyda. Bu qarz, lekin
      // uni bir kunda yopib bo'lmaydi: hozircha ogohlantirish.
      "@typescript-eslint/no-explicit-any": "warn",
      // Ishlatilmagan o'zgaruvchi - xato, lekin `_` bilan boshlanadigani
      // ataylab tashlab ketilgan deb qabul qilinadi.
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
      }],
      // Bo'sh `catch {}` - loyihada ataylab ishlatiladi (`localStorage`
      // shaxsiy rejimda taqiqlangan bo'lishi mumkin) va har birida izoh bor.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  // Testlarda `describe`/`it`/`expect` global (vitest `globals: true`).
  {
    files: ["**/*.test.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
