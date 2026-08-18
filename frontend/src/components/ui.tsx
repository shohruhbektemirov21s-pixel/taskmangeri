import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { DiffPiece, Task, TextDiff, UserBrief } from "@/api/types";
import { confirmDialog } from "./Confirm";
import { IconCalendar, IconEye, IconEyeOff, IconFile } from "./icons";
import { toTask, useGo, type NavTarget } from "@/nav";

/* ---------------------------------------------------------------- Avatar */
export function Avatar({ user, size = "" }: { user?: UserBrief | null; size?: "sm" | "lg" | "xl" | "" }) {
  if (!user) return <span className={`avatar ${size}`} style={{ background: "#30363d" }}>?</span>;
  if (user.avatar) {
    return <img className={`avatar ${size}`} src={user.avatar} alt={user.full_name} title={user.full_name} />;
  }
  return (
    <span className={`avatar ${size}`} style={{ background: user.avatar_color }} title={user.full_name}>
      {user.initials}
    </span>
  );
}

/**
 * Rasmni to'liq holda ko'rsatuvchi oyna.
 *
 * Odam profilga kirgach rasmni ko'rmoqchi bo'lsa **bitta bosish yetadi** -
 * alohida sahifaga o'tish yoki yuklab olish shart emas. Esc yoki fon bosilsa
 * yopiladi; ochiq turganda sahifa orqada siljib ketmaydi.
 */
export function PhotoView({
  src, alt, title, subtitle, onClose,
}: {
  src: string;
  alt?: string;
  /** Pastda chapda: nima ochilgani ("Profil rasmi") */
  title?: string;
  /** Uning ostida: kimniki */
  subtitle?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="photo-view" onClick={onClose} role="dialog" aria-modal="true"
         aria-label={alt || "Rasm"}>
      <div className="photo-bar" onClick={(e) => e.stopPropagation()}>
        <div className="photo-meta">
          {title && <strong>{title}</strong>}
          {subtitle && <span>{subtitle}</span>}
        </div>
        <span className="spacer" />
        <a className="photo-btn" href={src} download target="_blank" rel="noreferrer"
           title="Yuklab olish" aria-label="Yuklab olish">↓</a>
        <button className="photo-btn" type="button" onClick={onClose}
                title="Yopish (Esc)" aria-label="Yopish">×</button>
      </div>
      {/* Rasmning o'ziga bosilganda yopilmasin - odam kattalashtirib qarayotgan bo'lishi mumkin */}
      <img src={src} alt={alt || ""} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/** Rasmi bor avatarni bosib to'liq ko'rish uchun o'ram. */
export function AvatarViewable({ user, size = "" }: { user?: UserBrief | null; size?: "sm" | "lg" | "xl" | "" }) {
  const [open, setOpen] = useState(false);
  if (!user?.avatar) return <Avatar user={user} size={size} />;
  return (
    <>
      <button type="button" className="avatar-btn" onClick={() => setOpen(true)}
              title="Rasmni to'liq ko'rish">
        <Avatar user={user} size={size} />
      </button>
      {open && (
        <PhotoView src={user.avatar} alt={user.full_name}
                   title="Profil rasmi" subtitle={user.full_name}
                   onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function AvatarStack({ users }: { users: UserBrief[] }) {
  if (!users.length) return <span className="muted">—</span>;
  return (
    <span className="avatar-stack">
      {users.slice(0, 5).map((u) => (
        <Avatar key={u.id} user={u} size="sm" />
      ))}
      {users.length > 5 && <span className="avatar sm" style={{ background: "#30363d" }}>+{users.length - 5}</span>}
    </span>
  );
}

/* ---------------------------------------------------------------- Nishonlar */
export function StatusBadge({ task }: { task: Pick<Task, "status" | "status_display"> }) {
  return <span className={`badge st-${task.status}`}>{task.status_display}</span>;
}

export function Priority({ task }: { task: Pick<Task, "priority" | "priority_label"> }) {
  return <span className={`pri pri-${task.priority}`}>{task.priority_label}</span>;
}

export function SpecialtyTag({ user, compact = false }: { user?: UserBrief | null; compact?: boolean }) {
  if (!user?.specialty) return null;
  // `compact` da faqat belgi ko'rsatilardi ({ }, </>, = >). Belgilar o'qilmasdi
  // va ro'yxatlarni chalkashtirardi - endi qisqa ko'rinishda hech narsa
  // chizilmaydi, to'liq ko'rinishda esa yo'nalish nomi yoziladi.
  if (compact) return null;
  return (
    <span className="badge" style={{ color: user.specialty_color, borderColor: user.specialty_color + "66" }}>
      {user.specialty_display}
    </span>
  );
}

export function SpecialtyChip({
  value,
  label,
  color,
  icon,
}: {
  value?: string;
  label: string;
  color?: string;
  icon?: string;
}) {
  return (
    <span className="badge" key={value} style={{ color: color || undefined, borderColor: (color || "#30363d") + "66" }}>
      {icon && <span className="mono">{icon}</span>}
      {label}
    </span>
  );
}

/* ---------------------------------------------------------------- Holatlar */
export function Loading({ text }: { text?: string }) {
  return (
    <div className="center">
      <div className="spinner" />
      {text && <p className="muted">{text}</p>}
    </div>
  );
}

export function Empty({ icon, title, text, children }: { icon?: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="ico">{icon}</div>}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function ErrorMsg({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div className="msg msg-error">{error}</div>;
}

export function OkMsg({ text }: { text?: string | null }) {
  if (!text) return null;
  return <div className="msg msg-success">{text}</div>;
}

/* ---------------------------------------------------------------- Karta / Panel */
export function Card({
  id,
  title,
  action,
  children,
  badge,
  padded = true,
}: {
  /** Sahifa ichidan shu kartaga olib tushish uchun (`scrollIntoView`). */
  id?: string;
  title?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div className="card" id={id}>
      {title && (
        <div className="card-head">
          <h3>{title}</h3>
          {badge}
          <span className="spacer" />
          {action}
        </div>
      )}
      {padded ? <div className="card-body">{children}</div> : children}
    </div>
  );
}

/**
 * Raqamli ko'rsatkich.
 *
 * `to` berilsa karta bosiladigan bo'ladi: raqamni ko'rgan odam "buni qayerdan
 * ko'raman?" deb qidirib o'tirmaydi, ustiga bosaveradi. Ro'yxat SHU sahifada
 * turgan bo'lsa `onClick` beriladi - katak boshqa manzilga olib ketmaydi,
 * o'sha kartaga olib tushadi.
 *
 * `to` ham, `onClick` ham berilmasa - oddiy `div`. Bu MUHIM: `.stat:hover`
 * hamma katakni ko'taradi, ya'ni bosilmaydigani ham "bosilaman" deb turadi.
 * Shuning uchun raqam ortida ko'rsatadigan narsa bo'lsa, ikkovidan biri
 * albatta berilsin.
 */
export function Stat({ value, label, tone = "", to, onClick, title }: {
  value: ReactNode; label: string; tone?: string;
  /**
   * Oddiy manzil (`/mening-ishim`) yoki `src/nav` dagi maqsad. Ikkinchisi
   * identifikatorni ham olib yuradi - u manzilda emas, sahifa holatida
   * uzatiladi.
   */
  to?: string | NavTarget;
  onClick?: () => void; title?: string;
}) {
  const body = (
    <>
      <div className="v">{value}</div>
      <div className="k">{label}</div>
    </>
  );
  if (to) {
    const target = typeof to === "string" ? { to, state: undefined } : to;
    return (
      <Link className={`stat ${tone} clickable`} to={target.to} state={target.state}
            title={title || label}>
        {body}
      </Link>
    );
  }
  // Havola emas, TUGMA: sahifa almashmaydi, lekin klaviaturadan ham
  // bosiladi va o'quvchi dasturga "bu bosiladi" deb yetkaziladi.
  if (onClick) {
    return (
      <button type="button" className={`stat ${tone} clickable`}
              onClick={onClick} title={title || label}>
        {body}
      </button>
    );
  }
  return <div className={`stat ${tone}`}>{body}</div>;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* ---------------------------------------------------------------- Vazifa kartasi */
/**
 * Qator chekkasidagi «⋯» menyusi.
 *
 * Ro'yxatda har bir yozuv uchun tahrirlash/o'chirish kabi amallar kerak,
 * lekin ular doim ko'rinib tursa ro'yxat shovqinga to'ladi.
 */
export function RowMenu({ children, label = "Amallar" }: {
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="row-menu" ref={box}>
      <button type="button" className="btn btn-sm btn-ghost" title={label}
              aria-haspopup="menu" aria-expanded={open}
              onClick={() => setOpen((v) => !v)}>
        ⋯
      </button>
      {open && (
        <div className="row-menu-list" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * O'chirishdan oldingi yagona savol.
 *
 * Avval bu yerda nomni yozdirib tasdiqlash bor edi - amal qaytmasligi uchun.
 * Amalda u ortiqcha to'siq bo'ldi: bitta aniq savol yetadi.
 */
export function confirmDelete(name: string, warning?: string) {
  return confirmDialog({
    title: `«${name}» o'chirilsinmi?`,
    warning,
    body: "Loyiha vazifalari, fayllari va tarixi bilan butunlay o'chadi. Buni qaytarib bo'lmaydi.",
    confirmText: "O'chirish",
    danger: true,
  });
}

export function TaskCard({ task, draggable = false, onDragStart, onMove }: {
  task: Task;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  /**
   * Kartani boshqa ustunga ko'chirish. Berilsa kartaning ostida tanlash
   * maydoni paydo bo'ladi.
   *
   * Sudrab ko'chirish (HTML5 drag&drop) faqat sichqoncha bilan ishlaydi:
   * sensorli ekran `dragstart` ni umuman tug'dirmaydi, klaviatura ham. Ya'ni
   * telefondan kirgan odam va Tab bilan yuradigan odam doskada hech narsani
   * ko'chira olmasdi. Native `<select>` ikkovida ham ishlaydi va o'z-o'zidan
   * qulay: brauzer uni har platformada odatdagidek chizadi.
   *
   * Ro'yxat serverdan keladi (`allowed_transitions`) - qaysi holatga o'tish
   * mumkinligi qoidasi backendda, bitta joyda qoladi.
   */
  onMove?: (task: Task, status: string) => void;
}) {
  const moveId = useId();
  const moves = task.allowed_transitions || [];

  const card = (
    <Link
      {...toTask(task.id)}
      className={`tcard ${task.is_overdue ? "overdue" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="row">
        <span className="code">{task.code}</span>
        <span className="spacer" />
        <Priority task={task} />
      </div>
      <div className="title">{task.title}</div>
      <div className="foot">
        <span className="badge">{task.type_display}</span>
        {task.specialty_label && <span className="badge badge-brand">{task.specialty_label}</span>}
        {/* Biriktirilgan fayl bor-yo'qligi kartaning o'zida ko'rinsin - odam
            vazifani ochmasdan turib biladi. */}
        {!!task.attachment_count && (
          <span className="badge" title={`${task.attachment_count} ta fayl biriktirilgan`}>
            <IconFile size={11} /> {task.attachment_count}
          </span>
        )}
        {task.due_date && (
          <span className={`badge ${task.is_overdue ? "badge-danger" : ""}`}>{fmtDateTime(task.due_date)}</span>
        )}
        <span className="spacer" />
        <AvatarStack users={task.assignees} />
      </div>
    </Link>
  );

  if (!onMove || !moves.length) return card;

  return (
    <div className="tcard-wrap">
      {card}
      <div className="tcard-move">
        {/* Yorliq ko'rinmaydi, lekin ekran o'qigichga kerak: "Ko'chirish"
            degan maydon qaysi vazifaga tegishli ekani aytilsin. */}
        <label className="sr-only" htmlFor={moveId}>
          {task.code} - boshqa ustunga ko'chirish
        </label>
        <select
          id={moveId}
          value=""
          onChange={(e) => { if (e.target.value) onMove(task, e.target.value); }}
        >
          <option value="">Ko'chirish...</option>
          {moves.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Ustun sarlavhasidagi holat nuqtasining rangi.
 *
 * Bitta joyda turadi: doska ham (`pages/project/Board.tsx`), «Mening ishim»
 * ham shu ro'yxatdan oladi - aks holda bir xil holat ikki sahifada ikki xil
 * rangda ko'rinardi. Qiymatlar CSS o'zgaruvchisi: rejim almashganda rang
 * o'zi moslashadi.
 */
export const STATUS_DOT: Record<string, string> = {
  TODO: "var(--accent)",
  IN_PROGRESS: "var(--attention)",
  CHANGES_REQUESTED: "var(--danger)",
  IN_REVIEW: "var(--done)",
  DONE: "var(--success)",
};

export function TaskRow({ task, showProject = false }: { task: Task; showProject?: boolean }) {
  const go = useGo();
  return (
    /* Qatorning istalgan yeriga bosilsa vazifa ochiladi - sarlavhani
       aniq nishonga olish shart emas. */
    <tr className="clickable" onClick={() => go(toTask(task.id))}>
      <td className="nowrap mono muted">{task.code}</td>
      <td>
        <Link {...toTask(task.id)} style={{ color: "var(--text)", fontWeight: 500 }}
              onClick={(e) => e.stopPropagation()}>
          {task.title}
        </Link>
        {!!task.attachment_count && (
          <>
            {" "}
            <span className="muted nowrap" title={`${task.attachment_count} ta fayl`}>
              <IconFile size={11} /> {task.attachment_count}
            </span>
          </>
        )}
        {showProject && (
          <>
            <br />
            <small className="muted">{task.project_name}</small>
          </>
        )}
      </td>
      <td><StatusBadge task={task} /></td>
      <td><Priority task={task} /></td>
      <td><AvatarStack users={task.assignees} /></td>
      <td className="nowrap">
        {task.due_date ? (
          <span className={task.is_overdue ? "badge badge-danger" : "muted"}>{fmtDateTime(task.due_date)}</span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- Sana yordamchilari */
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
  if (diff < 60) return "hozir";
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} kun oldin`;
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
        placeholder={withTime ? "kk.oo.yyyy soat:daq" : "kk.oo.yyyy"}
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
        aria-label="Taqvimdan tanlash"
        title="Taqvimdan tanlash"
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

/* ---------------------------------------------------------------- Solishtirish */
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
export function DiffView({ diff, oldLabel = "Eski", newLabel = "Yangi" }: {
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
          <div className="diff-body diff-old">{side(diff.old, "bo'sh edi")}</div>
        </div>
        <div className="diff-col">
          <div className="diff-head">{newLabel}</div>
          <div className="diff-body diff-new">{side(diff.new, "bo'sh qoldirildi")}</div>
        </div>
      </div>
      {!diff.has_changes && (
        <p className="muted diff-note">Matn o'zgarmagan.</p>
      )}
      {diff.truncated && (
        <p className="muted diff-note">
          Matn juda uzun - o'zgargan joylari alohida ajratilmadi.
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
export function safePath(url?: string | null, fallback = "/bildirishnomalar") {
  const value = (url || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

/**
 * Parol maydoni - yonida ko'zcha bilan.
 *
 * Parolni ko'rsatib tekshirish imkoni bo'lmasa, odam xato yozganini bilmay
 * qayta-qayta urinadi. Ko'zcha bosilganda matn ochiladi, ikonka esa
 * chizilgan ko'zga almashadi - holat ko'rinib tursin.
 */
export function PasswordInput({
  value, onChange, placeholder, required, autoFocus, autoComplete, name, id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  name?: string;
  id?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        className="pw-input"
        value={value}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShown((v) => !v)}
        title={shown ? "Parolni yashirish" : "Parolni ko'rsatish"}
        aria-label={shown ? "Parolni yashirish" : "Parolni ko'rsatish"}
        aria-pressed={shown}
        tabIndex={-1}
      >
        {shown ? <IconEyeOff size={16} /> : <IconEye size={16} />}
      </button>
    </div>
  );
}
