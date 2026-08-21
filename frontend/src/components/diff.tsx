/**
 * Ikki matnni yonma-yon solishtirish.
 *
 * `components/ui.tsx` dan ajratildi: uni faqat tahrir tarixi ko'rsatadigan
 * ikki joy ishlatadi (`TaskDetail`, `project/History`), umumiy modulda esa
 * u har bir sahifaning bog'lamiga tushardi.
 */
import { Fragment } from "react";

import type { DiffPiece, TextDiff } from "@/api/types";
import { tx } from "@/i18n";

/**
 * Ikki matnni YONMA-YON ko'rsatadi: chapda eski, o'ngda yangi, o'zgargan
 * bo'laklar ajratilgan holda.
 *
 * Ilgari tahrir tarixi eski va yangi matnni ustma-ust qo'yardi - uzun
 * matnda nima o'zgarganini odam o'zi qidirib topishi kerak edi.
 *
 * Bo'laklarni SERVER tayyorlaydi (`apps/core/textdiff.py`): qoida bitta
 * joyda turadi va brauzer uzun matnni qayta ishlab o'tirmaydi.
 *
 * Tor ekranda ustunlar pastma-past tushadi - CSS `diff-grid` da.
 */
export function DiffView({ diff, oldLabel = tx("ui.eski"), newLabel = tx("ui.yangi") }: {
  diff?: TextDiff | null;
  oldLabel?: string;
  newLabel?: string;
}) {
  if (!diff) return null;

  const side = (pieces: DiffPiece[], empty: string) => (
    pieces.length
      ? pieces.map((p, i) => (
          p.changed
            ? <mark className="diff-mark" key={i}>{p.text}</mark>
            : <span key={i}>{p.text}</span>
        ))
      : <span className="muted">{empty}</span>
  );

  return (
    <div className="diff">
      <div className="diff-grid">
        <div className="diff-col">
          <div className="diff-head">{oldLabel}</div>
          <div className="diff-body diff-old">{side(diff.old, tx("ui.bosh_edi"))}</div>
        </div>
        <div className="diff-col">
          <div className="diff-head">{newLabel}</div>
          <div className="diff-body diff-new">{side(diff.new, tx("ui.bosh_qoldirildi"))}</div>
        </div>
      </div>
      {!diff.has_changes && (
        <p className="muted diff-note">{tx("ui.matn_ozgarmagan")}</p>
      )}
      {diff.truncated && (
        <p className="muted diff-note">
          {tx("ui.matn_juda_uzun_ozgargan_joylari")}
        </p>
      )}
    </div>
  );
}

/**
 * Maydonlar bo'yicha solishtirish - fayl nomi, hajmi, izohi kabi.
 *
 * Hujjatning ichini solishtirib bo'lmaydi (`.docx`, `.pdf` - ikkilik fayl),
 * lekin nima o'zgargani baribir ko'rinishi kerak: nomi, hajmi, izohi.
 */
export function FieldDiff({ rows }: { rows: { label: string; old: string; new: string; changed: boolean }[] }) {
  if (!rows.length) return null;
  return (
    <div className="diff">
      <div className="diff-grid diff-fields">
        {rows.map((r) => (
          <Fragment key={r.label}>
            <div className={`diff-field ${r.changed ? "is-changed" : ""}`}>
              <small className="muted">{r.label}</small>
              <div>{r.old || <span className="muted">—</span>}</div>
            </div>
            <div className={`diff-field ${r.changed ? "is-changed" : ""}`}>
              <small className="muted">{r.label}</small>
              <div>{r.new || <span className="muted">—</span>}</div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * Bildirishnomadagi havolani xavfsiz yo'lga aylantiradi.
 *
 * URL serverda yaratiladi, lekin baribir tekshiramiz: faqat ilova ichidagi
 * yo'l ("/..."), protokolli yoki "//" bilan boshlanadigan tashqi manzil emas.
 * Shu bilan ochiq yo'naltirish (open redirect) yo'li yopiladi.
 */
