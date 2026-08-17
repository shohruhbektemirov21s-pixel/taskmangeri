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
import { ApiError, tokens } from "@/api/client";
import { IconClose, IconFile } from "./icons";

/** Ikkala endpoint ham 25 MB gacha qabul qiladi (serverda ham tekshiriladi). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Tanlangan fayllarni yaratilgan yozuvga yuklaydi.
 * Xato bo'lsa `ApiError` uloqtiradi - chaqiruvchi qaror qabul qiladi.
 */
export async function uploadFiles(path: string, files: File[], description = "") {
  if (!files.length) return;
  const body = new FormData();
  files.forEach((f) => body.append("file", f));
  if (description.trim()) body.append("description", description.trim());

  const res = await fetch(`${import.meta.env.VITE_API_URL || "/api"}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokens.access}` },
    body,
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
}

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  hint?: string;
  /** Fayllarga umumiy izoh yozish maydoni kerakmi */
  withDescription?: boolean;
  description?: string;
  onDescription?: (value: string) => void;
}

export default function FilePicker({
  files, onChange, hint, withDescription, description = "", onDescription,
}: Props) {
  const fid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState<string[]>([]);

  function add(list: FileList | null) {
    if (!list || !list.length) return;
    const picked = Array.from(list);
    // Katta faylni shu yerdayoq to'samiz - server 400 qaytarguncha kutmaymiz.
    const big = picked.filter((f) => f.size > MAX_FILE_BYTES);
    const fine = picked.filter((f) => f.size <= MAX_FILE_BYTES);
    setTooBig(big.map((f) => f.name));

    // Bir xil fayl ikki marta tanlansa takrorlanmasin.
    const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
    onChange([...files, ...fine.filter((f) => !seen.has(`${f.name}:${f.size}`))]);
    if (input.current) input.current.value = "";
  }

  return (
    <>
      {withDescription && (
        <div className="field">
          <label htmlFor={`${fid}-0`}>Fayllarga izoh (ixtiyoriy)</label>
          <input id={`${fid}-0`} type="text" value={description} placeholder="Masalan: texnik topshiriq v2"
                 onChange={(e) => onDescription?.(e.target.value)} />
        </div>
      )}

      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
      >
        {hint || "Faylni shu yerga tashlang yoki bosing (25 MB gacha)"}
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
            <div className="row" key={`${f.name}-${f.size}-${i}`}
                 style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
              <span className="file-ico"><IconFile size={16} /></span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{f.name}</strong>
                <br />
                <small className="muted">{fileSize(f.size)}</small>
              </div>
              <span className="spacer" />
              <button type="button" className="btn btn-sm" title="Royxatdan olib tashlash"
                      onClick={() => onChange(files.filter((_, n) => n !== i))}>
                <IconClose size={13} />
              </button>
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
