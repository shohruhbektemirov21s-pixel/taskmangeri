/**
 * Kesh qatlami: bir xil so'rov IKKI MARTA ketmasin.
 *
 * NEGA TEST KERAK. Buzilganda ekranda hech narsa ko'rinmaydi - faqat
 * tarmoqda ortiqcha so'rov paydo bo'ladi. Aynan shu holat bo'lgan edi:
 * `useFetch` da kesh yo'q edi va har mount yangi so'rov yuborardi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FRESH_MS, clearCache, keyOf, peek, put, share } from "./cache";

describe("kesh - kalit va yosh", () => {
  beforeEach(() => clearCache());

  it("kalit manzil va parametrlarni birga hisobga oladi", () => {
    expect(keyOf("/tasks/", { project: 1 })).toBe(keyOf("/tasks/", { project: 1 }));
    expect(keyOf("/tasks/", { project: 1 })).not.toBe(keyOf("/tasks/", { project: 2 }));
    expect(keyOf("/tasks/")).not.toBe(keyOf("/projects/"));
  });

  it("yangi yozuv YANGI hisoblanadi", () => {
    put("k", { a: 1 });
    const hit = peek("k");
    expect(hit?.value).toEqual({ a: 1 });
    expect(hit?.fresh).toBe(true);
  });

  it("muddat o'tgach yozuv ESKI bo'ladi, lekin yo'qolmaydi", () => {
    vi.useFakeTimers();
    try {
      put("k", "qiymat");
      vi.advanceTimersByTime(FRESH_MS + 1000);
      const hit = peek("k");
      // Ekran bo'sh qolmasligi uchun eski qiymat baribir beriladi.
      expect(hit?.value).toBe("qiymat");
      expect(hit?.fresh).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bo'sh kalit `null` qaytaradi", () => {
    expect(peek("yo'q")).toBeNull();
  });
});

describe("kesh - uchib turgan so'rovlar birlashadi", () => {
  beforeEach(() => clearCache());

  it("bir vaqtda kelgan uchta so'rov BITTA tarmoq chaqiruviga aylanadi", async () => {
    let resolve!: (v: string) => void;
    const run = vi.fn(() => new Promise<string>((r) => { resolve = r; }));

    const a = share("k", run);
    const b = share("k", run);
    const c = share("k", run);
    expect(run).toHaveBeenCalledTimes(1);

    resolve("javob");
    await expect(Promise.all([a, b, c])).resolves.toEqual(["javob", "javob", "javob"]);
  });

  it("natija keshga tushadi - keyingi chaqiruv kutmaydi", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    await share("k", run);
    expect(peek("k")?.value).toEqual({ ok: true });
  });

  it("so'rov tugagach navbat bo'shaydi - keyingisi YANGI chaqiruv", async () => {
    const run = vi.fn().mockResolvedValue(1);
    await share("k", run);
    await share("k", run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("xato keshga yozilmaydi", async () => {
    const run = vi.fn().mockRejectedValue(new Error("tarmoq"));
    await expect(share("k", run)).rejects.toThrow("tarmoq");
    expect(peek("k")).toBeNull();
  });

  it("`clearCache` hammasini tozalaydi", () => {
    put("a", 1);
    put("b", 2);
    clearCache();
    expect(peek("a")).toBeNull();
    expect(peek("b")).toBeNull();
  });
});
