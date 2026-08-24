/**
 * Kirish nuqtasining TARTIBI - avval so'zlar, keyin ilova.
 *
 * NEGA TEST KERAK. Bu shartnoma faqat izohda yashaydi va uni buzish juda
 * oson: `main.tsx` ga oddiy `import Something from "./pages/..."` qo'shish
 * yetadi. `tsc` ham, ESLint ham hech narsa demaydi.
 *
 * Oqibati esa jimgina va chalkash: `tx()` modul darajasidagi jadvallarda
 * ham chaqiriladi (doska ustunlari, davr nomlari) va ular modul birinchi
 * import qilinganda BIR MARTA hisoblanadi. Lug'at o'shanda bo'sh bo'lsa,
 * ekranning bir qismi butun seans davomida kalit ko'rinishida qoladi -
 * `suggestions.holat_pending` degan yozuvlar bilan.
 *
 * Shuning uchun test manba MATNINI o'qiydi: bu yerda tekshirilayotgan
 * narsa xatti-harakat emas, faylning SHAKLI.
 */
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// Vite ning `?raw` importi - faylning MATNI. Node API (`node:fs`) ham
// ishlardi, lekin u `@types/node` ni talab qiladi va `tsconfig` ning
// `lib` ro'yxati faqat brauzer uchun.
import source from "./main.tsx?raw";

/** Faylning statik importlari (`import ... from "..."`). */
function staticImports(text: string): string[] {
  const out: string[] = [];
  const re = /^\s*import\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

describe("main.tsx — lug'at ilovadan OLDIN yuklanadi", () => {
  it("faqat lug'at va uslublar statik import qilinadi", () => {
    const allowed = new Set(["./i18n", "./styles/app.css"]);
    const unexpected = staticImports(source).filter((p) => !allowed.has(p));

    expect(unexpected, [
      "main.tsx ga statik import qo'shilgan:", unexpected.join(", "),
      "\nBu modul o'sha zahoti baholanadi va undagi `tx()` chaqiruvlari",
      "lug'at hali bo'sh paytda bajariladi - matn kalit bo'lib qolib ketadi.",
      "\nIlovaga tegishli hamma narsa `bootstrap.tsx` orqali kirsin.",
    ].join(" ")).toEqual([]);
  });

  it("`bootstrap` DINAMIK import qilinadi", () => {
    // Statik bo'lsa yuqoridagi test ham qizarardi, lekin bu yerda
    // niyatni ochiq yozib qo'yamiz: dinamik import - shartnomaning o'zi.
    expect(source).toMatch(/import\(\s*["']\.\/bootstrap["']\s*\)/);
  });

  it("`bootstrap` faqat lug'at kelgandan KEYIN yuklanadi", () => {
    const load = source.indexOf("loadTexts()");
    const boot = source.indexOf('import("./bootstrap")');
    expect(load).toBeGreaterThanOrEqual(0);
    expect(boot).toBeGreaterThan(load);
  });

  it("lug'at kelmasa ilova umuman ko'tarilmaydi", () => {
    // «Aloqa yo'q» xabari - saytdagi yagona qattiq yozilgan matn
    // (CLAUDE.md dagi istisno). U borligi shuni bildiradi: xato yo'li
    // ilovani ko'tarishga urinmaydi.
    expect(source).toContain("showOffline");
    expect(source).toMatch(/else\s+showOffline\(\)/);
  });
});
