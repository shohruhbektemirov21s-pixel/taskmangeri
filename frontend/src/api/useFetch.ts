/**
 * Bitta GET so'rovni sahifaga bog'lab beradigan hook.
 *
 * Ikki muammoni birdaniga yopadi.
 *
 * XATOLIK. Ilgari sahifalar `api.get(...).then(setData)` deb yozardi,
 * `.catch` esa yo'q edi. Server xato bersa va'da rad etilardi, holat esa
 * `null` bo'lib qolardi - sahifa abadiy «Yuklanmoqda» da muzlab turardi va
 * odam sababini bilmasdi. Bu yerda xato ushlanadi va matn bo'lib qaytadi.
 *
 * POYGA. Filtrni yoki loyihani tez almashtirsangiz ikkita so'rov yo'lda
 * bo'ladi. Ular qaytish tartibi kafolatlanmagan: kechikkan ESKI javob
 * yangisining ustiga tushib, ekranda noto'g'ri ma'lumot qolardi. Endi eski
 * so'rov `AbortController` bilan bekor qilinadi, ustiga `alive` bayrog'i
 * ham bor - komponent yo'q bo'lgach holat umuman yozilmaydi.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "./client";

type Params = Record<string, string | number | boolean | undefined | null>;

interface Result<T> {
  data: T | null;
  error: string | null;
  /** Yuklanmoqda: ma'lumot ham, xato ham hali yo'q. */
  loading: boolean;
  /** So'rovni qaytadan yuborish - masalan yozuv qo'shilgandan keyin. */
  reload: () => void;
}

export function useFetch<T>(path: string | null, params?: Params): Result<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Parametrlar obyekti har renderda yangi bo'ladi, shuning uchun uni
  // bog'liqlik ro'yxatiga o'z holicha qo'yib bo'lmaydi - cheksiz sikl
  // bo'lardi. Matnga aylantirib solishtiramiz.
  const key = JSON.stringify(params ?? null);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!path) return;
    const ctl = new AbortController();
    let alive = true;

    // Manzil o'zgarganda eski ma'lumot tozalanadi - u boshqa narsaga tegishli.
    // Faqat filtr o'zgargan bo'lsa esa ekranda qoladi: aks holda har filtr
    // almashganda jadval ham, filtr paneli ham yo'qolib, sahifa sakrardi.
    if (lastPath.current !== path) {
      lastPath.current = path;
      setData(null);
    }
    setError(null);

    api.get<T>(path, params, ctl.signal)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => {
        // Bekor qilingan so'rov xato emas - shunchaki kerak bo'lmay qoldi.
        if (!alive || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof ApiError ? e.message : "Ma'lumotni yuklab bo'lmadi.");
      });

    return () => { alive = false; ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: data === null && error === null, reload };
}
