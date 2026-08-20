/**
 * Tasdiqlash oynasi - `window.confirm` o'rniga.
 *
 * Brauzerning o'z oynasi uch narsani buzardi: u ilova uslubidan butunlay
 * chetda turadi (qora rejimda ham oq bo'z quti), matnni formatlab bo'lmaydi
 * (nima o'chishini ajratib ko'rsatish kerak) va brauzer uni "sayt yana
 * so'ramasin" degan katakcha bilan butunlay o'chirib qo'yishi mumkin -
 * o'shanda o'chirish tugmasi jimgina ishlamay qo'yardi.
 *
 * Chaqirish joyi o'zgarmaydi, faqat `await` qo'shiladi:
 *
 *     if (!(await confirmDialog({ title: "...", danger: true }))) return;
 *
 * Buning uchun oyna bir marta `main.tsx` da o'rnatiladi (`<ConfirmHost />`),
 * chaqiruv esa modul darajasidagi obunachi orqali unga yetadi - ya'ni oddiy
 * funksiyadan ham, hook bo'lmagan joydan ham chaqirish mumkin.
 */
import { useEffect, useRef, useState } from "react";
import { tx } from "@/i18n";

interface ConfirmOptions {
  title: string;
  /** Sarlavha ostidagi tushuntirish - nima yo'qolishi aniq yozilsin. */
  body?: string;
  /**
   * Qizil ogohlantirish - tushuntirishdan OLDIN, ajratilgan holda chiqadi.
   * Bu yerda odam bir qarashda ko'rishi kerak bo'lgan narsa turadi:
   * masalan "3 ta jarayondagi ish yo'qoladi".
   */
  warning?: string;
  /** Tasdiqlash tugmasidagi yozuv. */
  confirmText?: string;
  cancelText?: string;
  /** Qaytarib bo'lmaydigan amal - tugma qizil bo'ladi. */
  danger?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((p: Pending) => void) | null = null;

/**
 * Tasdiqlash so'raydi. `true` - odam rozi bo'ldi.
 *
 * Oyna o'rnatilmagan bo'lsa (masalan test muhitida) `window.confirm` ga
 * qaytamiz - amal jimgina bajarilib ketmasin.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (!show) {
    return Promise.resolve(window.confirm(
      `${opts.title}\n\n${opts.warning || ""}\n${opts.body || ""}`.trim()));
  }
  return new Promise<boolean>((resolve) => show!({ ...opts, resolve }));
}

export default function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = setPending;
    return () => { show = null; };
  }, []);

  // Ochilganda fokus tasdiqlash tugmasiga tushadi: klaviatura bilan
  // ishlayotgan odam Tab bosib qidirmasin. Esc - bekor qilish, orqadagi
  // sahifa esa siljimaydi.
  useEffect(() => {
    if (!pending) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pending.resolve(false);
        setPending(null);
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [pending]);

  if (!pending) return null;

  const done = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };

  return (
    <div className="modal-scrim" onClick={() => done(false)}>
      <div className="modal-box" role="alertdialog" aria-modal="true"
           aria-labelledby="confirm-title"
           onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-title">{pending.title}</h3>
        {pending.warning && (
          <div className="callout danger" style={{ marginBottom: 10 }}>{pending.warning}</div>
        )}
        {pending.body && <p className="muted">{pending.body}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => done(false)}>
            {pending.cancelText || tx("common.bekor_qilish")}
          </button>
          <button ref={confirmBtn} type="button"
                  className={`btn ${pending.danger ? "btn-danger" : "btn-primary"}`}
                  onClick={() => done(true)}>
            {pending.confirmText || tx("confirm.davom_etish")}
          </button>
        </div>
      </div>
    </div>
  );
}
