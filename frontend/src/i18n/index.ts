/**
 * Interfeys so'zlari — backenddan.
 *
 * NEGA. Sayt matnlari ilgari komponentlar ichida qattiq yozilgan edi: bitta
 * so'zni tuzatish uchun kodni o'zgartirib, qayta yig'ish kerak bo'lardi. Endi
 * ular Db2 da (`apps.uitexts.UiText`) turadi, `django-admin/` dan tahrirlanadi
 * va bu yerga `GET /api/ui-texts/` orqali keladi.
 *
 * QANDAY ISHLAYDI. Lug'at modul darajasida saqlanadi, shuning uchun `t()` ni
 * komponentdan ham, oddiy funksiyadan ham (masalan `api/client.ts`) chaqirish
 * mumkin — hook shart emas. Ilova ko'tarilishidan oldin `TextsGate` lug'atni
 * yuklab oladi, ya'ni birinchi chizishdayoq matn joyida bo'ladi.
 *
 * SOVUQ ISHGA TUSHISH. Birinchi ochilishda tarmoqni kutmaslik uchun oxirgi
 * nusxa `localStorage` da saqlanadi: keyingi safar sahifa darrov to'liq matn
 * bilan chiziladi, yangi matn esa fon rejimida kelib almashadi.
 */

type Dict = Record<string, string>;

const CACHE_KEY = "tf_ui_texts";
const BASE = import.meta.env.VITE_API_URL || "/api";

/** Oxirgi muvaffaqiyatli javob — sahifa yangilanganda darrov ishlatiladi. */
function warmStart(): Dict {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Dict) : {};
  } catch {
    return {};
  }
}

let dict: Dict = warmStart();
let loaded = Object.keys(dict).length > 0;

/** Lug'at (kesh yoki tarmoqdan) tayyor bo'lsa — rost. */
export function textsReady(): boolean {
  return loaded;
}

/**
 * Kalit bo'yicha matn.
 *
 * O'rin egalari jingalak qavsda: `tx("task.left", { n: 3 })` →
 * "3 kun qoldi" (bazadagi matn: "{n} kun qoldi").
 *
 * Kalit topilmasa kalitning o'zi qaytadi — sahifa buzilmaydi va yetishmayotgan
 * yozuv ko'rinib turadi (konsolda ham ogohlantirish chiqadi).
 */
export function tx(key: string, vars?: Record<string, string | number>): string {
  let out = dict[key];
  if (out === undefined) {
    if (import.meta.env.DEV) console.warn(`[matn] kalit topilmadi: ${key}`);
    out = key;
  }
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (whole, name) =>
    name in vars ? String(vars[name]) : whole);
}

/**
 * Matnlarni backenddan oladi.
 *
 * Xatolik yutiladi: tarmoq yo'q bo'lsa eski kesh bilan ishlayveramiz —
 * sayt so'zsiz qolgandan ko'ra eski so'z bilan turgani yaxshi.
 */
export async function loadTexts(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/ui-texts/`, { headers: { Accept: "application/json" } });
    if (!res.ok) return loaded;
    const data = (await res.json()) as { items?: Dict };
    if (data.items && typeof data.items === "object") {
      dict = data.items;
      loaded = true;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(dict));
      } catch {
        // Kvota to'lgan bo'lishi mumkin — kesh shart emas, davom etamiz.
      }
    }
    return loaded;
  } catch {
    return loaded;
  }
}
