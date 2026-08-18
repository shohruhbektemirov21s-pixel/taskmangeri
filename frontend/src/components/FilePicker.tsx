/**
 * Yaratishdan OLDIN fayl tanlash.
 *
 * Loyiha fayli ham, vazifa fayli ham serverda mavjud yozuvga biriktiriladi -
 * ya'ni id kerak. Yangi loyiha yoki vazifa esa hali yaratilmagan. Shuning uchun
 * bu komponent fayllarni faqat brauzerda ushlab turadi; ular forma saqlangach,
 * yangi id ma'lum bo'lgandan keyin yuklanadi (`uploadFiles`).
 *
 * Yuklashdan oldin ro'yxatni ko'rish va keraksizini olib tashlash mumkin -
 * xato faylni yuborib qo'yib, keyin uni o'chirib yurishdan ko'ra shu qulay.
 */
import { useId, useRef, useState } from "react";
import { api } from "@/api/client";
import { DateTimeField, fromDateTimeInput } from "./ui";
import { IconClose, IconFile } from "./icons";

/** Ikkala endpoint ham 25 MB gacha qabul qiladi (serverda ham tekshiriladi). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** "2026-02-21T14:30" -> "21.02.2026 14:30" (ekranda ko'rsatish uchun). */
function isoToUz(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!m) return value;
  const day = `${m[3]}.${m[2]}.${m[1]}`;
  return m[4] ? `${day} ${m[4]}:${m[5]}` : day;
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Tanlangan fayllarni yaratilgan yozuvga yuklaydi.
 * Xato bo'lsa `ApiError` uloqtiradi - chaqiruvchi qaror qabul qiladi.
 *
 * `api.post` orqali ketadi, xom `fetch` bilan emas: aks holda 401 da token
 * yangilanmaydi. Access token 12 soat yashaydi - ertalab ochilgan tabda
 * kechqurun fayl yuklamoqchi bo'lgan odam qolgan hamma narsa ishlab
 * turgani holda "yuklab bo'lmadi" olardi. `FormData` ni mijozning o'zi
 * taniydi va `Content-Type` ni brauzerga qoldiradi (chegara kerak).
 */
export async function uploadFiles(path: string, files: File[], description = "",
                                  dates: string[] = []) {
  if (!files.length) return;
  const body = new FormData();
  files.forEach((f) => body.append("file", f));
  if (description.trim()) body.append("description", description.trim());
  // Hujjat sanasi fayllar bilan BIR TARTIBDA ketadi: server i-chi sanani
  // i-chi faylga beradi. Sanasi yozilmagan fayl uchun ham bo'sh qiymat
  // qo'yiladi - aks holda tartib siljib, sana boshqa faylga tushib qolardi.
  // Maydondagi qiymat ("2026-02-21T14:30") TOSHKENT vaqti deb o'qiladi va
  // mintaqali ISO ga o'giriladi - «Fayllar» bo'limidagi yuklash bilan bir xil
  // yo'l. Aks holda soatni server o'z sozlamasiga qarab taxmin qilardi.
  if (dates.some((d) => d)) {
    files.forEach((_, i) => body.append("doc_date", fromDateTimeInput(dates[i] || "") || ""));
  }

  await api.post(path, body);
}

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  hint?: string;
  /** Fayllarga umumiy izoh yozish maydoni kerakmi */
  withDescription?: boolean;
  description?: string;
  onDescription?: (value: string) => void;
  /**
   * «Hujjat sanasi» maydonlari chiqsinmi.
   *
   * Ikki qavat: izoh yonidagi UMUMIY sana butun to'plamga tegishli, har bir
   * faylning o'z maydoni esa faqat o'sha faylni ajratib qo'yish uchun.
   * Fayl sanasi bo'sh bo'lsa umumiy sana ishlatiladi.
   */
  withDates?: boolean;
  /** Umumiy sana - izoh bilan yonma-yon turadi. */
  date?: string;
  onDate?: (value: string) => void;
  /** Fayl sanalari `files` bilan bir tartibda: `dates[i]` - `files[i]` niki. */
  dates?: string[];
  onDates?: (dates: string[]) => void;
  /**
   * Hujjat sanasi uchun ruxsat etilgan oraliq - loyihaning boshlanish va
   * tugash sanasi. Taqvim shu oraliqdan tashqarisini bermaydi; serverda
   * ham xuddi shu qoida tekshiriladi (`ProjectViewSet._check_doc_date`).
   */
  minDate?: string;
  maxDate?: string;
}

export default function FilePicker({
  files, onChange, hint, withDescription, description = "", onDescription,
  withDates, date = "", onDate, dates = [], onDates, minDate, maxDate,
}: Props) {
  const fid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState<string[]>([]);

  // Chegara loyihaning KUNI bilan beriladi, maydon esa sana+soat kutadi -
  // kun boshi va kun oxirigacha kengaytiramiz. Aks holda taqvim boshlanish
  // kunining o'zini ham bermay qo'yardi (00:00 dan keyingi hamma soat
  // "chegaradan tashqarida" bo'lib qolardi).
  const minAt = minDate ? `${minDate}T00:00` : undefined;
  const maxAt = maxDate ? `${maxDate}T23:59` : undefined;

  function add(list: FileList | null) {
    if (!list || !list.length) return;
    const picked = Array.from(list);
    // Katta faylni shu yerdayoq to'samiz - server 400 qaytarguncha kutmaymiz.
    const big = picked.filter((f) => f.size > MAX_FILE_BYTES);
    const fine = picked.filter((f) => f.size <= MAX_FILE_BYTES);
    setTooBig(big.map((f) => f.name));

    // Bir xil fayl ikki marta tanlansa takrorlanmasin.
    const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
    const added = fine.filter((f) => !seen.has(`${f.name}:${f.size}`));
    onChange([...files, ...added]);
    // Sanalar ro'yxati fayllar bilan bir uzunlikda yursin - indeks siljisa
    // sana boshqa faylniki bo'lib qolardi.
    if (added.length) onDates?.([...dates, ...added.map(() => "")]);
    if (input.current) input.current.value = "";
  }

  /** Ro'yxatdan bitta faylni olib tashlash - sanasi ham u bilan ketadi. */
  function drop(index: number) {
    onChange(files.filter((_, n) => n !== index));
    onDates?.(dates.filter((_, n) => n !== index));
  }

  function setDate(index: number, value: string) {
    const next = files.map((_, n) => (n === index ? value : dates[n] || ""));
    onDates?.(next);
  }

  return (
    <>
      {withDescription && (
        <div className="row wrap">
          <div className="field" style={{ flex: 2, minWidth: 220 }}>
            <label htmlFor={`${fid}-0`}>Hujjat nomi</label>
            <input id={`${fid}-0`} type="text" value={description} placeholder="Masalan: texnik topshiriq v2"
                   onChange={(e) => onDescription?.(e.target.value)} />
          </div>
          {/* Umumiy hujjat sanasi - izoh bilan bir qatorda. Ilgari sana faqat
              fayl tanlangandan keyin chiqardi, ya'ni bo'sh formada uni
              yozadigan joy ko'rinmasdi. */}
          {withDates && (
            <div className="field" style={{ flex: 1, minWidth: 170 }}>
              <label htmlFor={`${fid}-1`}>Hujjat sanasi va vaqti</label>
              <DateTimeField id={`${fid}-1`} value={date} onChange={(v) => onDate?.(v)}
                             min={minAt} max={maxAt} />
            </div>
          )}
        </div>
      )}

      <div
        /* Nom yozilmaguncha yopiq: hujjat nomsiz yuklanmaydi (serverda ham). */
        className={`dropzone${withDates && !description.trim() ? " disabled" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!(withDates && !description.trim())) add(e.dataTransfer.files);
        }}
        onClick={() => { if (!(withDates && !description.trim())) input.current?.click(); }}
      >
        {hint || (withDates && !description.trim()
          ? "Avval hujjat nomini yozing — keyin fayl tanlanadi"
          : "Faylni shu yerga tashlang yoki bosing (25 MB gacha)")}
      </div>
      <input ref={input} type="file" multiple style={{ display: "none" }}
             onChange={(e) => add(e.target.files)} />

      {!!tooBig.length && (
        <div className="msg msg-error" style={{ marginTop: 10 }}>
          25 MB dan katta bolgani uchun qoshilmadi: {tooBig.join(", ")}
        </div>
      )}

      {!!files.length && (
        <div className="stack" style={{ marginTop: 12 }}>
          {files.map((f, i) => (
            <div key={`${f.name}-${f.size}-${i}`}
                 style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div className="row">
                <span className="file-ico"><IconFile size={16} /></span>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>{f.name}</strong>
                  <br />
                  <small className="muted">{fileSize(f.size)}</small>
                </div>
                <span className="spacer" />
                <button type="button" className="btn btn-sm" title="Royxatdan olib tashlash"
                        onClick={() => drop(i)}>
                  <IconClose size={13} />
                </button>
              </div>

              {/* Hujjat sanasi - faylning O'ZIDAGI sana (shartnoma imzolangan
                  kun, topshiriq tasdiqlangan kun). Yuklangan vaqt serverda
                  o'zi yoziladi, bu esa qo'lda kiritiladi va ixtiyoriy. */}
              {withDates && (
                <div className="row wrap" style={{ marginTop: 7, gap: 8 }}>
                  <label htmlFor={`${fid}-d${i}`} className="muted"
                         style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                    Hujjat sanasi va vaqti
                  </label>
                  <div style={{ maxWidth: 230, flex: 1 }}>
                    <DateTimeField id={`${fid}-d${i}`} value={dates[i] || ""}
                                   onChange={(v) => setDate(i, v)}
                                   min={minAt} max={maxAt} />
                  </div>
                  {/* Bo'sh qolsa yuqoridagi umumiy sana ketadi - odam har
                      faylga bir xil sanani qayta yozib chiqmasin. */}
                  {!dates[i] && date && (
                    <small className="muted">umumiy sana: {isoToUz(date)}</small>
                  )}
                </div>
              )}
            </div>
          ))}
          <small className="muted">
            {files.length} ta fayl tanlandi — saqlangandan keyin yuklanadi.
          </small>
        </div>
      )}
    </>
  );
}
