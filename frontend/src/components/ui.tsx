import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Task, UserBrief } from "@/api/types";
import { IconEye, IconEyeOff, IconFile } from "./icons";

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
  title,
  action,
  children,
  badge,
  padded = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div className="card">
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
 * ko'raman?" deb qidirib o'tirmaydi, ustiga bosaveradi.
 */
export function Stat({ value, label, tone = "", to, title }: {
  value: ReactNode; label: string; tone?: string; to?: string; title?: string;
}) {
  const body = (
    <>
      <div className="v">{value}</div>
      <div className="k">{label}</div>
    </>
  );
  if (!to) return <div className={`stat ${tone}`}>{body}</div>;
  return (
    <Link className={`stat ${tone} clickable`} to={to} title={title || label}>
      {body}
    </Link>
  );
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
export function confirmDelete(name: string) {
  return window.confirm(
    `«${name}» vazifalari, fayllari va tarixi bilan butunlay ochiriladi. Davom etamizmi?`);
}

export function TaskCard({ task, draggable = false, onDragStart }: {
  task: Task;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <Link
      to={`/vazifa/${task.id}`}
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
}

export function TaskRow({ task, showProject = false }: { task: Task; showProject?: boolean }) {
  const nav = useNavigate();
  return (
    /* Qatorning istalgan yeriga bosilsa vazifa ochiladi - sarlavhani
       aniq nishonga olish shart emas. */
    <tr className="clickable" onClick={() => nav(`/vazifa/${task.id}`)}>
      <td className="nowrap mono muted">{task.code}</td>
      <td>
        <Link to={`/vazifa/${task.id}`} style={{ color: "var(--text)", fontWeight: 500 }}
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

export function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uz-UZ", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
  });
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
  return d.toLocaleString("uz-UZ", {
    timeZone: TZ,
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
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
