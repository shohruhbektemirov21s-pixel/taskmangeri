/**
 * O'qish natijalarining umumiy keshi.
 *
 * MUAMMO. `useFetch` da kesh yo'q edi: har bir mount yangi so'rov
 * yuborardi. Oqibati ikkita edi.
 *
 *   * IKKI KOMPONENT bir xil ma'lumotni so'rasa - ikkita so'rov. Loyiha
 *     sahifasida a'zolar ro'yxati uch joyda kerak bo'ladi.
 *   * SAHIFAGA QAYTGANDA hammasi noldan boshlanardi: orqaga bosgan odam
 *     bir soniya oldin ko'rgan ro'yxatini yana kutib turardi.
 *
 * YECHIM ikki qismli.
 *
 *   1. UCHIB TURGAN so'rovlar birlashtiriladi. Bir xil manzil va bir xil
 *      parametrlar bilan kelgan ikkinchi so'rov yangisini ochmaydi -
 *      birinchisining va'dasiga qo'shiladi.
 *   2. KESHDAGI javob DARROV beriladi, keyin fon rejimida yangilanadi
 *      (stale-while-revalidate). Ekran bo'sh qolmaydi, ma'lumot esa eskirib
 *      qolmaydi.
 *
 * NEGA MUDDAT QISQA. Bu kesh «tezkor xotira», ishonchli manba emas:
 * ma'lumot baribir har safar qayta so'raladi, kesh faqat KUTISHNI
 * yo'qotadi. Uzoq muddat esa eski ma'lumotni ekranda ushlab turishga
 * aylanardi - ayniqsa doska va tekshiruv navbatida, u yerda holat tez
 * o'zgaradi.
 *
 * YOZISHDAN KEYIN. Har qanday yozish (`POST`/`PATCH`/`DELETE`) keshni
 * butunlay tozalaydi (`api/client.ts`): qaysi manzil qaysi javobga
 * ta'sir qilishini aniq bilish mumkin emas - vazifa yaratilishi panelga
 * ham, doskaga ham, loyiha sanoqlariga ham tegadi. Tozalash arzon, noto'g'ri
 * ma'lumot esa qimmat.
 */

/** Keshdagi javob shuncha millisekunddan keyin eskirgan hisoblanadi. */
export const FRESH_MS = 10_000;

/** Umuman tashlab yuboriladigan yosh - xotira cheksiz o'smasin. */
const MAX_AGE_MS = 5 * 60_000;

interface Entry {
  at: number;
  value: unknown;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export function keyOf(path: string, params?: unknown): string {
  return path + "|" + JSON.stringify(params ?? null);
}

/** Keshdagi javob (yoshi bilan) yoki `null`. */
export function peek(key: string): { value: unknown; fresh: boolean } | null {
  const hit = store.get(key);
  if (!hit) return null;
  const age = Date.now() - hit.at;
  if (age > MAX_AGE_MS) {
    store.delete(key);
    return null;
  }
  return { value: hit.value, fresh: age < FRESH_MS };
}

export function put(key: string, value: unknown): void {
  store.set(key, { at: Date.now(), value });
}

/**
 * So'rovni bajaradi - AGAR aynan shunisi allaqachon yo'lda bo'lmasa.
 *
 * Bekor qilish (`AbortSignal`) ataylab UZATILMAYDI: va'da bir nechta
 * chaqiruvchiga tegishli va biri bekor qilsa qolganlari javobsiz
 * qolardi. Chaqiruvchi o'zi kutishni to'xtatadi (`alive` bayrog'i),
 * so'rov esa oxirigacha boradi va natijasi keshga tushadi - ya'ni
 * keyingi chaqiruvchi uni kutmasdan oladi.
 */
export function share<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const promise = run()
    .then((value) => {
      put(key, value);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Keshni butunlay tozalaydi - har qanday yozishdan keyin. */
export function clearCache(): void {
  store.clear();
}
