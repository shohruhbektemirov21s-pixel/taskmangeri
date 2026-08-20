/**
 * Sana va vaqt — Toshkent mintaqasida.
 *
 * NEGA BU TESTLAR MUHIM. Server UTC da yozadi, ekranda esa Toshkent vaqti
 * turishi kerak (+5). Mintaqa hisobida bir soatlik xato hech qanday xato
 * xabari bermaydi: vazifa shunchaki boshqa kunda ko'rinadi. Eng yomoni -
 * kechqurun 21:00 da qo'yilgan muddat UTC da ertangi kunga o'tib ketishi
 * va taqvimda noto'g'ri katakda turishi.
 *
 * Ikkinchi qoida: kiritish va o'qish TESKARI amal bo'lishi shart. Odam
 * formaga "13.08.2026 21:00" deb yozsa, saqlab qayta ochganda ayni o'sha
 * qiymat turishi kerak - aks holda har tahrirda vaqt bir soatga siljib
 * borardi.
 */
import { describe, expect, it } from "vitest";

import {
  TZ, fmtDate, fmtDateTime, fromDateTimeInput, toDateTimeInput,
} from "./ui";

describe("mintaqa", () => {
  it("Toshkentga qadalgan", () => {
    expect(TZ).toBe("Asia/Tashkent");
  });
});

describe("fmtDate / fmtDateTime — ekranda ko'rinadigan ko'rinish", () => {
  it("KUN.OY.YIL formatida beradi", () => {
    // 2026-08-13T10:45Z -> Toshkentda 15:45, o'sha kun.
    expect(fmtDate("2026-08-13T10:45:00Z")).toBe("13.08.2026");
  });

  it("UTC da tunda bo'lgan lahza Toshkentda KEYINGI kun bo'ladi", () => {
    // 2026-08-13T20:30Z -> Toshkentda 14-avgust, 01:30.
    expect(fmtDate("2026-08-13T20:30:00Z")).toBe("14.08.2026");
    expect(fmtDateTime("2026-08-13T20:30:00Z")).toBe("14.08.2026 01:30");
  });

  it("yarim tunni 24 emas, 00 deb yozadi", () => {
    // 2026-08-13T19:00Z -> Toshkentda aynan 00:00.
    expect(fmtDateTime("2026-08-13T19:00:00Z")).toBe("14.08.2026 00:00");
  });

  it("bo'sh va yaroqsiz qiymatda tire beradi - «Invalid Date» chiqmasin", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("bu sana emas")).toBe("—");
    expect(fmtDateTime("bu sana emas")).toBe("—");
  });
});

describe("toDateTimeInput — maydonni Toshkent vaqti bilan to'ldiradi", () => {
  it("ISO ni maydon formatiga o'giradi", () => {
    expect(toDateTimeInput("2026-08-13T16:00:00Z")).toBe("2026-08-13T21:00");
  });

  it("bo'sh qiymatda bo'sh satr", () => {
    expect(toDateTimeInput(null)).toBe("");
    expect(toDateTimeInput("chalkash")).toBe("");
  });
});

describe("fromDateTimeInput — maydondagi qiymat Toshkent vaqti deb o'qiladi", () => {
  it("ISO ga qaytaradi", () => {
    expect(fromDateTimeInput("2026-08-13T21:00")).toBe("2026-08-13T16:00:00.000Z");
  });

  it("bo'sh qiymatda null", () => {
    expect(fromDateTimeInput("")).toBeNull();
  });

  it("teskari amal: yozib-o'qiganda qiymat siljimaydi", () => {
    // Bu eng muhim tekshiruv. Siljish bo'lsa har tahrirda muddat bir
    // soatga surilib borardi va buni faqat bir necha kundan keyin
    // sezish mumkin edi.
    for (const v of ["2026-01-01T00:00", "2026-08-13T21:00", "2026-12-31T23:59"]) {
      expect(toDateTimeInput(fromDateTimeInput(v))).toBe(v);
    }
  });
});
