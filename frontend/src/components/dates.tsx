/**
 * Sana va vaqt — hisob ham, kiritish maydonlari ham.
 *
 * NEGA ALOHIDA FAYL. Bular `components/ui.tsx` ichida turardi va u modul
 * deyarli har bir sahifadan import qilinadi - ya'ni butun sana mantiqi
 * umumiy bog'lamga tushardi. Ustiga ular UI emas, SOF HISOB: mintaqa
 * siljishi, formatlash va teskari o'girish. Testi ham allaqachon alohida
 * faylda edi (`components/dates.test.ts`) va u shu nomdagi modulni
 * kutayotgandek turardi.
 *
 * Ichida ikki qatlam bor va ular bir-biriga bog'liq, shuning uchun birga
 * qoldi: sof funksiyalar (`fmtDate`, `toDateTimeInput`, ...) va o'sha
 * funksiyalarga tayanadigan maydonlar (`DateField`, `DateTimeField`).
 */
import { useEffect, useRef, useState } from "react";

import { IconCalendar } from "./icons";
import { tx } from "@/i18n";

/**
 * Sayt vaqti — TOSHKENT.
 *
 * Brauzer mintaqasiga tayanib bo'lmaydi: chet eldan kirgan odamga muddat
 * boshqa soatda ko'rinsa, jamoa bir-birini tushunmay qoladi. Server ham
 * `TIME_ZONE=Asia/Tashkent` da ishlaydi, shuning uchun ikkovi bir xil
 * gapiradi. Sana ko'rsatish ham, maydonga qo'yish ham shu mintaqada.
 */
export const TZ = "Asia/Tashkent";

/** Bir lahzada Toshkent siljishi (daqiqada). Intl orqali — qo'lda +5 yozilsa,
    mintaqa qoidasi o'zgargan kuni jim ravishda noto'g'ri bo'lib qolardi. */
function tzOffsetMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (asUTC - (date.getTime() - date.getMilliseconds())) / 60000;
}

/**
 * Toshkent bo'yicha sana/soat bo'laklari.
 *
 * `toLocaleDateString("uz-UZ")` ishlatilmaydi: u brauzer ICU ma'lumotiga
 * qarab "2026-02-21" (yil oldinda) beradi va Chrome versiyasiga qarab
 * o'zgarib turadi. Bo'laklarni o'zimiz yig'sak natija hamma yerda bir xil:
 * KUN.OY.YIL va 24 soatlik vaqt.
 */
function tzParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  // en-GB yarim tunni ba'zan "24" deb beradi — 00 ga keltiramiz.
  p.hour = String(+p.hour % 24).padStart(2, "0");
  return p;
}

export function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const p = tzParts(d);
  return `${p.day}.${p.month}.${p.year}`;
}

/** Toshkent bo'yicha bugungi sana: "2026-08-14". */
export function todayInTz() {
  return toDateTimeInput(new Date().toISOString()).slice(0, 10);
}

/**
 * ISO vaqtni `<input type="datetime-local">` tushunadigan formatga o'giradi:
 * "2026-08-13T21:00". Maydon mintaqasiz qiymat kutadi, biz esa uni ataylab
 * TOSHKENT vaqtida to'ldiramiz — ekranda ko'ringan soat bilan bir xil bo'lsin.
 */
export function toDateTimeInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const { type, value: v } of parts) p[type] = v;
  const hh = String(+p.hour % 24).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${hh}:${p.minute}`;
}

/** Maydondagi qiymat TOSHKENT vaqti deb o'qiladi va ISO ga qaytariladi. */
export function fromDateTimeInput(value: string) {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [, y, mo, da, hh, mi] = m;
  const naive = Date.UTC(+y, +mo - 1, +da, +hh, +mi);
  // Siljish o'sha lahzaga bog'liq, shuning uchun bir marta qayta hisoblaymiz.
  let out = new Date(naive - tzOffsetMinutes(new Date(naive)) * 60000);
  out = new Date(naive - tzOffsetMinutes(out) * 60000);
  return out.toISOString();
}

export function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const p = tzParts(d);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

export function timeAgo(value?: string | null) {
  if (!value) return "";
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return tx("ui.hozir");
  if (diff < 3600) return tx("ui.daqiqa_oldin", { n: Math.floor(diff / 60) });
  if (diff < 86400) return tx("ui.soat_oldin", { n: Math.floor(diff / 3600) });
  if (diff < 2592000) return tx("ui.kun_oldin", { n: Math.floor(diff / 86400) });
  return fmtDate(value);
}

/* ------------------------------------------------- Sana kiritish maydonlari */
/**
 * NEGA XOM `<input type="date">` EMAS.
 *
 * Native sana maydoni BRAUZER tilida chiziladi, sahifa tilida emas: ruscha
 * yoki inglizcha Chrome da "08/18/2026" ko'rinadi va buni na `lang`, na CSS
 * o'zgartira oladi. Loyihaning qolgan hamma joyida sana "18.08.2026" —
 * bitta ekranda ikki xil format turardi.
 *
 * Shuning uchun ko'rinadigan maydon oddiy matn: raqam yozilgani sari nuqta
 * o'zi qo'yiladi. Taqvim yo'qolmaydi — yonidagi tugma yashirin native
 * maydonning `showPicker()` ini chaqiradi.
 *
 * Qiymat formati o'zgarmadi: sana uchun "YYYY-MM-DD", sana+soat uchun
 * "YYYY-MM-DDTHH:mm" — ya'ni chaqiruvchi kod ham, `fromDateTimeInput` ham
 * oldingidek ishlayveradi.
 */
function digits(v: string) {
  return v.replace(/\D/g, "");
}

/** "21022026" -> "21.02.2026" (yozilayotgan paytda ham to'g'ri ko'rinadi) */
function maskDate(raw: string) {
  const d = digits(raw).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/** "210220261430" -> "21.02.2026 14:30" */
function maskDateTime(raw: string) {
  const d = digits(raw).slice(0, 12);
  const date = maskDate(d.slice(0, 8));
  if (d.length <= 8) return date;
  if (d.length <= 10) return `${date} ${d.slice(8)}`;
  return `${date} ${d.slice(8, 10)}:${d.slice(10)}`;
}

function isRealDate(y: number, m: number, day: number) {
  if (m < 1 || m > 12 || day < 1 || y < 1000 || y > 9999) return false;
  return new Date(Date.UTC(y, m - 1, day)).getUTCDate() === day;
}

/** "21.02.2026" -> "2026-02-21"; to'liq yoki haqiqiy bo'lmasa "" */
function uzToIsoDate(text: string) {
  const d = digits(text);
  if (d.length !== 8) return "";
  const day = +d.slice(0, 2), mo = +d.slice(2, 4), y = +d.slice(4);
  if (!isRealDate(y, mo, day)) return "";
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}

/** "21.02.2026 14:30" -> "2026-02-21T14:30" */
function uzToIsoDateTime(text: string) {
  const d = digits(text);
  if (d.length !== 12) return "";
  const date = uzToIsoDate(d.slice(0, 8));
  if (!date) return "";
  const hh = +d.slice(8, 10), mi = +d.slice(10);
  if (hh > 23 || mi > 59) return "";
  return `${date}T${d.slice(8, 10)}:${d.slice(10)}`;
}

/** "2026-02-21" -> "21.02.2026" */
function isoDateToUz(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** "2026-02-21T14:30" -> "21.02.2026 14:30" */
function isoDateTimeToUz(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(v || "");
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : "";
}

interface DateFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Taqvim uchun chegara, ISO ko'rinishida. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

function BaseDateField({ withTime, id, value, onChange, min, max, required, disabled, style }:
                       DateFieldProps & { withTime: boolean }) {
  const toUz = withTime ? isoDateTimeToUz : isoDateToUz;
  const toIso = withTime ? uzToIsoDateTime : uzToIsoDate;
  const mask = withTime ? maskDateTime : maskDate;
  const native = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => toUz(value));

  // Qiymat tashqaridan o'zgarsa (forma tozalandi, taqvimdan tanlandi)
  // matnni yangilaymiz. Foydalanuvchi yozayotgan chala qiymatni buzmaslik
  // uchun faqat haqiqatan boshqa sanaga aylangandagina.
  useEffect(() => {
    if (toIso(text) !== value) setText(toUz(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function type(raw: string) {
    const shown = mask(raw);
    setText(shown);
    const iso = toIso(shown);
    // To'liq yozilgan bo'lsa - yuboramiz; maydon bo'shatilgan bo'lsa - tozalaymiz.
    // Chala qiymat esa hali "yozilyapti", holatga tegmaymiz.
    if (iso) onChange(iso);
    else if (!digits(shown)) onChange("");
  }

  return (
    <span className="dt-field" style={style}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        disabled={disabled}
        placeholder={withTime ? tx("ui.kk_oo_yyyy_soat_daq") : "kk.oo.yyyy"}
        value={text}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setText(toUz(toIso(text)))}
      />
      {/* Taqvim: yashirin native maydon orqali. `showPicker()` ko'rinmaydigan
          (display:none) elementda ishlamaydi, shuning uchun u chizilgan-u,
          shaffof va o'lchamsiz. */}
      <input
        ref={native}
        className="dt-native"
        type={withTime ? "datetime-local" : "date"}
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="dt-pick"
        disabled={disabled}
        aria-label={tx("ui.taqvimdan_tanlash")}
        title={tx("ui.taqvimdan_tanlash")}
        onClick={() => {
          const el = native.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();      // eski brauzerlarda
          }
        }}
      >
        <IconCalendar />
      </button>
    </span>
  );
}

/** Sana maydoni. Qiymat "YYYY-MM-DD", ko'rinishi "21.02.2026". */
export function DateField(props: DateFieldProps) {
  return <BaseDateField {...props} withTime={false} />;
}

/** Sana + soat maydoni. Qiymat "YYYY-MM-DDTHH:mm", ko'rinishi "21.02.2026 14:30". */
export function DateTimeField(props: DateFieldProps) {
  return <BaseDateField {...props} withTime />;
}
