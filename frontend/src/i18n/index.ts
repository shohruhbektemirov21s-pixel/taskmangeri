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

/** Serverdagi lug'atning oxirgi ko'rilgan belgisi (`ETag`). */
let stamp = "";

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
    stamp = res.headers.get("ETag") || "";
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

/* ------------------------------------------------------- ishlab chiqishda */
/**
 * Matn bazada o'zgarsa sahifa O'ZI yangilanadi — faqat `DEV` da.
 *
 * NEGA KERAK. Lug'at ilova ko'tarilganda bir marta olinadi va xotirada
 * qoladi. Ya'ni yangi kalit qo'shilganda yoki `django-admin/` dan so'z
 * tuzatilganda ochiq turgan sahifa buni umuman sezmasdi: kod HMR bilan
 * darrov yangilanardi-yu, matn eskiligicha turardi va odam sahifani qo'lda
 * yangilashga majbur bo'lardi.
 *
 * NEGA QAYTA CHIZISH EMAS, SAHIFANI YANGILASH. `tx()` faqat komponent
 * ichida emas, MODUL darajasidagi jadvallarda ham chaqiriladi (doska ustun
 * nomlari, davr nomlari). Ular modul birinchi import qilinganda bir marta
 * hisoblanadi, ya'ni lug'atni almashtirish ularga yetib bormaydi -
 * ekranning bir qismi yangi, bir qismi eski matnda qolardi. `main.tsx`
 * dagi tartib ham shu sababdan. Sahifani yangilash - rostini ko'rsatadigan
 * yagona yo'l.
 *
 * ARZON: javob `Cache-Control: no-cache` va `ETag` bilan keladi, ya'ni
 * o'zgarmagan bo'lsa server bo'sh 304 qaytaradi. Fon rejimidagi ilova
 * umuman so'ramaydi.
 */
if (import.meta.env.DEV) {
  const CHECK_MS = 4000;
  setInterval(() => {
    if (document.hidden || !stamp) return;
    void fetch(`${BASE}/ui-texts/`, { headers: { Accept: "application/json" } })
      .then((res) => {
        const fresh = res.headers.get("ETag") || "";
        if (fresh && fresh !== stamp) location.reload();
      })
      .catch(() => {
        // Server ko'tarilayotgan bo'lishi mumkin - keyingi urinishda ko'ramiz.
      });
  }, CHECK_MS);
}
