/**
 * Bitta GET so'rovni sahifaga bog'lab beradigan hook.
 *
 * Uch muammoni birdaniga yopadi.
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
 *
 * HAR HARFDA SO'ROV. Qidiruv maydoni bevosita parametrga ulanganda har
 * bosilgan tugma bitta so'rov tug'dirardi - "arxitektura" so'zini yozguncha
 * 12 ta. `debounceMs` bilan so'rov yozish to'xtaganda ketadi.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "./client";
import { tx } from "@/i18n";

type Params = Record<string, string | number | boolean | undefined | null>;

interface Options {
  /**
   * So'rovni shuncha millisekundga kechiktirish. Qidiruv maydoniga ulangan
   * so'rovlar uchun 250-300 ms qulay: odam yozayotganda so'rov ketmaydi,
   * to'xtagach esa sezilarli kutish bo'lmaydi.
   */
  debounceMs?: number;
}

interface Result<T> {
  data: T | null;
  error: string | null;
  /**
   * Birinchi yuklanish: ma'lumot hali yo'q va so'rov yo'lda.
   *
   * Filtr almashganda `false` bo'ladi - ekrandagi ro'yxat joyida qoladi va
   * sahifa "sakramaydi". Ilgari bu `data === null && error === null` deb
   * hisoblanardi: server qonuniy ravishda `null` qaytarsa sahifa abadiy
   * yuklanayotgandek ko'rinardi.
   */
  loading: boolean;
  /** So'rov yo'ldami - filtr almashganda ham `true`. Nozik ko'rsatkich uchun. */
  pending: boolean;
  /** So'rovni qaytadan yuborish - masalan yozuv qo'shilgandan keyin. */
  reload: () => void;
}

export function useFetch<T>(path: string | null, params?: Params, opts: Options = {}): Result<T> {
  const { debounceMs = 0 } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(Boolean(path));
  const [tick, setTick] = useState(0);

  // Parametrlar obyekti har renderda yangi bo'ladi, shuning uchun uni
  // bog'liqlik ro'yxatiga o'z holicha qo'yib bo'lmaydi - cheksiz sikl
  // bo'lardi. Matnga aylantirib solishtiramiz.
  const key = JSON.stringify(params ?? null);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!path) {
      setPending(false);
      return;
    }
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
    setPending(true);

    const run = () => {
      api.get<T>(path, params, ctl.signal)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setPending(false);
        })
        .catch((e) => {
          // Bekor qilingan so'rov xato emas - shunchaki kerak bo'lmay qoldi.
          // Bunda `pending` ni ham o'chirmaymiz: o'rniga yangi so'rov ketgan.
          if (!alive || (e instanceof DOMException && e.name === "AbortError")) return;
          setError(e instanceof ApiError ? e.message : tx("api_use_fetch.malumotni_yuklab_bolmadi"));
          setPending(false);
        });
    };

    let timer: number | undefined;
    if (debounceMs > 0) timer = window.setTimeout(run, debounceMs);
    else run();

    return () => {
      alive = false;
      window.clearTimeout(timer);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, tick, debounceMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: pending && data === null, pending, reload };
}
