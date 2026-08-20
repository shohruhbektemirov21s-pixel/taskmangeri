/**
 * HTTP mijozning eng nozik uch joyi.
 *
 * Bularning hech biri `tsc` bilan ushlanmaydi - tiplar to'g'ri qolib,
 * xulq-atvor buziladi. Uchovi ham ilgari haqiqiy nosozlik bo'lgan:
 * 500 javobidagi HTML sahifa ekranga chiqib ketardi, sahifalangan javobdan
 * ro'yxat olinmasdi va bir vaqtda kelgan ikkita 401 ikkita `refresh`
 * so'roviga aylanardi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, listOf, tokens } from "./client";

describe("ApiError — server javobini o'qiladigan matnga aylantiradi", () => {
  it("DRF ning `detail` maydonini oladi", () => {
    expect(new ApiError(403, { detail: "Ruxsat yo'q." }).message).toBe("Ruxsat yo'q.");
  });

  it("maydon xatolarini nomi bilan birlashtiradi", () => {
    const err = new ApiError(400, { due_date: ["Sana noto'g'ri."] });
    expect(err.message).toContain("due_date");
    expect(err.message).toContain("Sana noto'g'ri.");
    expect(err.fields.due_date).toBe("Sana noto'g'ri.");
  });

  it("`non_field_errors` nomsiz chiqadi", () => {
    expect(new ApiError(400, { non_field_errors: ["Umumiy xato"] }).message).toBe("Umumiy xato");
  });

  it("500 dagi HTML sahifani ekranga chiqarmaydi", async () => {
    // Django DEBUG rejimida bir necha o'n kilobaytlik traceback sahifasini
    // yuboradi. Uni o'z holicha ko'rsatish sahifani buzadi va ichki
    // ma'lumotni ochib qo'yadi - shuning uchun faqat sarlavha olinadi.
    //
    // Xabar matni lug'atdan keladi (`tx`), shuning uchun modulni lug'at
    // qo'yilgandan KEYIN yuklaymiz - u modul darajasida o'qiladi.
    localStorage.setItem("tf_ui_texts", JSON.stringify({
      "api_client.serverda_xatolik": "Serverda xatolik: {sarlavha}",
    }));
    vi.resetModules();
    const { ApiError: Err } = await import("./client");

    const html = "<!doctype html><html><head><title>AttributeError at /api/tasks/</title>"
      + "</head><body>" + "x".repeat(5000) + "</body></html>";
    const msg = new Err(500, html).message;
    expect(msg.length).toBeLessThan(200);
    expect(msg).toBe("Serverda xatolik: AttributeError at /api/tasks/");
  });

  it("oddiy matnli javobni o'zgartirmaydi", () => {
    expect(new ApiError(502, "Bad Gateway").message).toBe("Bad Gateway");
  });
});

describe("listOf — sahifalangan javobdan ro'yxat", () => {
  it("`results` ichidan oladi", () => {
    expect(listOf<number>({ count: 2, results: [1, 2] })).toEqual([1, 2]);
  });

  it("oddiy massivni o'z holicha qaytaradi", () => {
    expect(listOf<number>([3, 4])).toEqual([3, 4]);
  });

  it("kutilmagan shaklda bo'sh ro'yxat beradi - sahifa yiqilmasin", () => {
    expect(listOf(null)).toEqual([]);
    expect(listOf({ detail: "xato" })).toEqual([]);
  });
});

describe("tokens — localStorage ustidagi qatlam", () => {
  beforeEach(() => localStorage.clear());

  it("access va refresh ni saqlaydi va tozalaydi", () => {
    tokens.set("a1", "r1");
    expect(tokens.access).toBe("a1");
    expect(tokens.refresh).toBe("r1");
    tokens.clear();
    expect(tokens.access).toBeNull();
    expect(tokens.refresh).toBeNull();
  });

  it("refresh berilmasa eskisi joyida qoladi", () => {
    // `POST /auth/refresh/` ba'zan faqat yangi `access` qaytaradi -
    // o'shanda eski `refresh` o'chib ketmasligi kerak, aks holda odam
    // keyingi 401 da tizimdan chiqib qolardi.
    tokens.set("a1", "r1");
    tokens.set("a2");
    expect(tokens.access).toBe("a2");
    expect(tokens.refresh).toBe("r1");
  });
});

describe("401 - token yangilash BIR MARTA yuboriladi", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("bir vaqtda kelgan ikkita 401 bitta refresh so'rovi bo'ladi", async () => {
    // Sahifa ochilganda bir necha so'rov birga ketadi. Token muddati
    // tugagan bo'lsa hammasi 401 oladi va har biri o'z `refresh` ini
    // yuborsa, server `ROTATE_REFRESH_TOKENS` bilan birinchisidan keyin
    // qolganini bekor qiladi - odam tizimdan chiqib ketardi.
    tokens.set("eski-access", "eski-refresh");

    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh/")) {
        refreshCalls += 1;
        // Yangilash biroz cho'ziladi - ikkinchi so'rov shu paytda keladi.
        await new Promise((r) => setTimeout(r, 10));
        return new Response(JSON.stringify({ access: "yangi", refresh: "yangi-r" }),
                            { status: 200, headers: { "Content-Type": "application/json" } });
      }
      // Birinchi urinishda 401, yangilangandan keyin 200.
      if (tokens.access === "yangi") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ detail: "muddati tugagan" }), { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("./client");
    await Promise.all([api.get("/tasks/"), api.get("/projects/")]);

    expect(refreshCalls).toBe(1);
    expect(tokens.access).toBe("yangi");
  });
});
