import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Task, UserBrief } from "@/api/types";
import { IconEye, IconEyeOff } from "./icons";

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
  return (
    <span className="badge" style={{ color: user.specialty_color, borderColor: user.specialty_color + "66" }}>
      <span className="mono">{user.specialty_icon}</span>
      {!compact && user.specialty_display}
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

export function Stat({ value, label, tone = "" }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="v">{value}</div>
      <div className="k">{label}</div>
    </div>
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
        {task.due_date && (
          <span className={`badge ${task.is_overdue ? "badge-danger" : ""}`}>{fmtDate(task.due_date)}</span>
        )}
        <span className="spacer" />
        <AvatarStack users={task.assignees} />
      </div>
    </Link>
  );
}

export function TaskRow({ task, showProject = false }: { task: Task; showProject?: boolean }) {
  return (
    <tr>
      <td className="nowrap mono muted">{task.code}</td>
      <td>
        <Link to={`/vazifa/${task.id}`} style={{ color: "var(--text)", fontWeight: 500 }}>
          {task.title}
        </Link>
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
          <span className={task.is_overdue ? "badge badge-danger" : "muted"}>{fmtDate(task.due_date)}</span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- Sana yordamchilari */
export function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("uz-UZ", {
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
