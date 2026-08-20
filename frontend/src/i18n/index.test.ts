/**
 * Interfeys matnlari — kalit topilmasa sahifa BUZILMASIN.
 *
 * Lug'at backenddan keladi va yangi kalit ba'zan kodda paydo bo'lib,
 * bazaga hali tushmagan bo'ladi. O'shanda `tx()` bo'sh satr qaytarsa
 * tugmalar nomsiz qolardi va nima bosayotganini bilib bo'lmasdi.
 * Shuning uchun qaytadigan qiymat - kalitning O'ZI: ekranda g'alati
 * ko'rinadi, lekin nima yetishmayotgani darrov ma'lum bo'ladi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const CACHE_KEY = "tf_ui_texts";

async function freshTx(dict: Record<string, string>) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(dict));
  // Lug'at modul darajasida saqlanadi - har test uchun modulni qaytadan
  // yuklaymiz, aks holda oldingi testning lug'ati qolib ketardi.
  vi.resetModules();
  return await import("./index");
}

describe("tx — kalit bo'yicha matn", () => {
  beforeEach(() => localStorage.clear());

  it("lug'atdagi matnni qaytaradi", async () => {
    const { tx } = await freshTx({ "common.saqlash": "Saqlash" });
    expect(tx("common.saqlash")).toBe("Saqlash");
  });

  it("o'rin egalarini almashtiradi", async () => {
    const { tx } = await freshTx({ "ui.kun_oldin": "{n} kun qoldi" });
    expect(tx("ui.kun_oldin", { n: 3 })).toBe("3 kun qoldi");
  });

  it("bir nechta o'rin egasi va takrorlanganini ham almashtiradi", async () => {
    const { tx } = await freshTx({ "x.y": "{ism} — {ism} ({son})" });
    expect(tx("x.y", { ism: "Ali", son: 2 })).toBe("Ali — Ali (2)");
  });

  it("qiymati berilmagan o'rin egasi joyida qoladi", async () => {
    // Bo'sh satr qo'yilsa gap ma'nosini yo'qotardi; qavs qolgani esa
    // «bu yerda qiymat kutilgan» degan aniq belgidir.
    const { tx } = await freshTx({ "x.y": "{a} va {b}" });
    expect(tx("x.y", { a: "bir" })).toBe("bir va {b}");
  });

  it("topilmagan kalit o'rniga kalitning o'zini beradi", async () => {
    const { tx } = await freshTx({ "bor.kalit": "Bor" });
    expect(tx("yoq.kalit")).toBe("yoq.kalit");
  });

  it("keshdagi nusxa bilan darrov tayyor bo'ladi", async () => {
    // Sovuq ishga tushish: birinchi chizishda tarmoqni kutmasdan matn
    // ko'rinishi kerak, aks holda sahifa bir kadr kalitlar bilan chiqardi.
    const { textsReady } = await freshTx({ "a.b": "c" });
    expect(textsReady()).toBe(true);
  });

  it("kesh buzilgan bo'lsa yiqilmaydi", async () => {
    localStorage.setItem(CACHE_KEY, "{bu json emas");
    vi.resetModules();
    const { tx, textsReady } = await import("./index");
    expect(textsReady()).toBe(false);
    expect(tx("har.qanday")).toBe("har.qanday");
  });
});
