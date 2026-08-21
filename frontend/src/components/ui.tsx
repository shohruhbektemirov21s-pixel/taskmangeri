import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Access, Task, UserBrief } from "@/api/types";
import { confirmDialog } from "./Confirm";
import { IconEye, IconEyeOff, IconFile } from "./icons";
// Sana funksiyalari endi o'z modulida - `TaskCard` va `TaskRow` muddatni
// shu yerdan oladi (pastda ular qayta ham eksport qilinadi).
import { fmtDateTime } from "./dates";
import { toTask, useGo, type NavTarget } from "@/nav";
import { tx } from "@/i18n";

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
         aria-label={alt || tx("ui.rasm")}>
      <div className="photo-bar" onClick={(e) => e.stopPropagation()}>
        <div className="photo-meta">
          {title && <strong>{title}</strong>}
          {subtitle && <span>{subtitle}</span>}
        </div>
        <span className="spacer" />
        <a className="photo-btn" href={src} download target="_blank" rel="noreferrer"
           title={tx("ui.yuklab_olish")} aria-label={tx("ui.yuklab_olish")}>↓</a>
        <button className="photo-btn" type="button" onClick={onClose}
                title={tx("ui.yopish_esc")} aria-label={tx("common.yopish")}>×</button>
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
              title={tx("ui.rasmni_toliq_korish")}>
        <Avatar user={user} size={size} />
      </button>
      {open && (
        <PhotoView src={user.avatar} alt={user.full_name}
                   title={tx("ui.profil_rasmi")} subtitle={user.full_name}
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
/**
 * Yuklanish ko'rsatkichi.
 *
 * `role="status"` - ekran o'quvchi «yuklanmoqda» ni aytib o'tsin. Aylanma
 * belgining o'zi ko'rmaydigan odam uchun hech narsa demaydi: usiz sahifa
 * jimgina bo'sh turardi va odam nima kutayotganini bilmasdi.
 */
export function Loading({ text }: { text?: string }) {
  return (
    <div className="center" role="status">
      {/* Aylanma - bezak, e'lon qilinadigani matn. */}
      <div className="spinner" aria-hidden="true" />
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

/**
 * Xato va muvaffaqiyat xabarlari - BUTUN ILOVADA shu ikkovi.
 *
 * NEGA `role` SHART. Xabar sahifaning o'rtasida paydo bo'ladi, ya'ni
 * ko'rmaydigan odam uchun hech narsa o'zgarmaydi: forma yuborildi, hech
 * qanday tovush yo'q, natija noma'lum. `role="alert"` xabarni darrov
 * e'lon qiladi (u o'zi `aria-live="assertive"` degani), `role="status"`
 * esa muloyimroq - odam yozayotgan ishini bo'lmaydi.
 *
 * Ikkovi bitta darvoza bo'lgani uchun bu ikki qator butun ilovani qoplaydi:
 * xato qayerda chiqishidan qat'i nazar eshitiladi.
 */
export function ErrorMsg({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div className="msg msg-error" role="alert">{error}</div>;
}

export function OkMsg({ text }: { text?: string | null }) {
  if (!text) return null;
  return <div className="msg msg-success" role="status">{text}</div>;
}

/* ---------------------------------------------------------------- Karta / Panel */
export function Card({
  id,
  title,
  action,
  children,
  badge,
  padded = true,
  collapsible = false,
  defaultOpen = true,
}: {
  /** Sahifa ichidan shu kartaga olib tushish uchun (`scrollIntoView`). */
  id?: string;
  title?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  /**
   * Sarlavha bosilganda karta yig'iladi.
   *
   * Uzun ro'yxatlar uchun: profildagi «Nima qilgan» yigirmadan ortiq
   * yozuvni ochib tashlaydi va sahifaning qolgani ancha pastga tushib
   * ketadi. Sanoq nishonda ko'rinib turgani uchun yig'ilgan holatda ham
   * "ichida nima bor" ma'lum bo'ladi.
   */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;

  return (
    <div className="card" id={id}>
      {title && (
        <div className="card-head">
          {collapsible ? (
            // Butun sarlavha nishon: kichik uchburchakni aniq bosish shart
            // emas. `action` esa tashqarida qoladi - u o'z ishini qiladi.
            <button type="button" className="card-toggle" aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}>
              <span className="card-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
              <h3>{title}</h3>
              {badge}
            </button>
          ) : (
            <>
              <h3>{title}</h3>
              {badge}
            </>
          )}
          <span className="spacer" />
          {action}
        </div>
      )}
      {shown && (padded ? <div className="card-body">{children}</div> : children)}
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

/**
 * Sahifa raqamlari - «‹ 1 2 3 … 9 10 ›».
 *
 * NEGA KERAK. Uzun ro'yxat ilgari jimgina qirqilar va ostida «450 tadan
 * 100 tasi ko'rsatildi» degan yozuv turardi. Qolganiga yetadigan yo'l
 * yo'q edi - bu javob emas, maslahat edi.
 *
 * IKKI XIL ISHLATILADI. Panel ro'yxatida sahifa SERVERDAN so'raladi
 * (`/dashboard/tasks/?page=`), profil kartasida esa allaqachon yuklangan
 * ro'yxat brauzerda bo'linadi. Komponentga farqi yo'q: u faqat raqamlarni
 * chizadi va bosilganini aytadi.
 *
 * NEGA HAMMA RAQAM EMAS. Ellik sahifa bo'lsa ellikta tugma qatorni
 * buzardi. Shuning uchun ATROFDAGILAR ko'rsatiladi: birinchi, oxirgi va
 * joriyning ikki yon qo'shnisi; uzilish joyiga «…» qo'yiladi. Bu Google
 * ham, GitHub ham ishlatadigan naqsh - odam tanish narsani o'ylab
 * o'tirmaydi.
 */
export function Pager({ page, pages, onPick }: {
  page: number; pages: number; onPick: (n: number) => void;
}) {
  // Qaysi raqamlar chiziladi: chekkalar + joriyning atrofi.
  const near = new Set<number>([1, pages, page, page - 1, page + 1]);
  // Boshida yoki oxirida turganda qator qisqarib qolmasin - to'ldiramiz.
  if (page <= 3) [2, 3, 4].forEach((n) => near.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => near.add(n));
  const shown = [...near].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  const items: (number | "gap")[] = [];
  shown.forEach((n, i) => {
    // Ketma-ketlik uzilgan joyda - uch nuqta.
    if (i > 0 && n - shown[i - 1] > 1) items.push("gap");
    items.push(n);
  });

  return (
    <nav className="pager" aria-label={tx("ui.sahifalar")}>
      <button type="button" className="pager-step" disabled={page <= 1}
              onClick={() => onPick(page - 1)} aria-label={tx("ui.oldingi_sahifa")}>‹</button>
      {items.map((it, i) => (
        it === "gap"
          ? <span key={`gap${i}`} className="pager-gap">…</span>
          : <button key={it} type="button"
                    className={`pager-num ${it === page ? "on" : ""}`}
                    aria-current={it === page ? "page" : undefined}
                    onClick={() => onPick(it)}>{it}</button>
      ))}
      <button type="button" className="pager-step" disabled={page >= pages}
              onClick={() => onPick(page + 1)} aria-label={tx("ui.keyingi_sahifa")}>›</button>
    </nav>
  );
}

/* ---------------------------------------------------------------- Vazifa kartasi */
/**
 * Qator chekkasidagi «⋯» menyusi.
 *
 * Ro'yxatda har bir yozuv uchun tahrirlash/o'chirish kabi amallar kerak,
 * lekin ular doim ko'rinib tursa ro'yxat shovqinga to'ladi.
 */
export function RowMenu({ children, label = tx("common.amallar") }: {
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
    title: tx("ui.ochirilsinmi", { nom: name }),
    warning,
    body: tx("ui.loyiha_butunlay_ochadi"),
    confirmText: tx("common.ochirish"),
    danger: true,
  });
}

export function TaskCard({
  task, draggable = false, dragging = false, onDragStart, onDragEnd, onMove,
}: {
  task: Task;
  draggable?: boolean;
  /** Ayni damda sudralayaptimi - karta xiralashadi (`.tcard.dragging`).
      Belgisiz odam kartani ushlaganini ko'rmasdi: u joyida turaverardi. */
  dragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  /** Sudrash tugadi - tashlangan joyidan qat'i nazar. Doska shu yerda
      belgini tozalaydi: aks holda ustun yonib qolardi. */
  onDragEnd?: (e: React.DragEvent) => void;
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
      className={`tcard ${task.is_overdue ? "overdue" : ""} ${dragging ? "dragging" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="row">
        <span className="code">{task.code}</span>
        <span className="spacer" />
        <Priority task={task} />
      </div>
      <div className="title" title={task.title}>{task.title}</div>
      <div className="foot">
        <span className="badge">{task.type_display}</span>
        {task.specialty_label && <span className="badge badge-brand">{task.specialty_label}</span>}
        {/* Biriktirilgan fayl bor-yo'qligi kartaning o'zida ko'rinsin - odam
            vazifani ochmasdan turib biladi. */}
        {!!task.attachment_count && (
          <span className="badge" title={tx("ui.fayl_biriktirilgan", { n: task.attachment_count })}>
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
          {task.code} {tx("ui.boshqa_ustunga_kochirish")}
        </label>
        <select
          id={moveId}
          value=""
          onChange={(e) => { if (e.target.value) onMove(task, e.target.value); }}
        >
          <option value="">{tx("ui.kochirish")}</option>
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
/**
 * «Ro'yxat qirqilgan» izohi — doska va vazifalar ro'yxati tepasida.
 *
 * Server ro'yxatni rolga qarab qirqadi (`apps/core/permissions.py`
 * `task_scope_q`): IJROCHI (dasturchi, QA) faqat o'ziga biriktirilgan ishni
 * ko'radi, menejer/loyiha admini/kuzatuvchi esa hammasini. Bu izohsiz
 * dasturchi 74 ta vazifadan uchtasini ko'rib "ro'yxat buzilibdi" deb
 * o'ylaydi.
 *
 * Cheklov YO'Q bo'lganda hech narsa chizilmaydi: menejerga "siz hammasini
 * ko'ryapsiz" deb aytishning keragi yo'q, u shundoq ham ko'rib turibdi.
 */
export function TaskScopeNote({ access }: { access?: Access | null }) {
  if (!access?.is_developer) return null;
  return (
    <p className="scope-note">
      {tx("ui.faqat_sizga_biriktirilgan_ishlar_qolganini")}
    </p>
  );
}

/**
 * «Davr» tanlagichining variantlari - «Vazifalar» va «Vazifalarim»
 * sahifalarida bir xil.
 *
 * Kalitlar serverdagi `DUE_RANGES` bilan bir xil va oraliqni ham server
 * hisoblaydi (`due_span`): «shu hafta» dushanbadan yakshanbagacha, «shu
 * oy» oy boshidan oxirigacha - ya'ni KALENDAR davri, «oxirgi 7 kun» emas.
 */
export const DUE_PERIODS = [
  { value: "today", label: tx("common.bugun") },
  { value: "week", label: tx("ui.shu_hafta") },
  { value: "month", label: tx("ui.shu_oy") },
  { value: "year", label: tx("ui.shu_yil") },
] as const;

export const STATUS_DOT: Record<string, string> = {
  TODO: "var(--accent)",
  IN_PROGRESS: "var(--attention)",
  CHANGES_REQUESTED: "var(--danger)",
  IN_REVIEW: "var(--done)",
  DONE: "var(--success)",
};

/**
 * Loyiha ichidagi vazifalar jadvalining bitta qatori.
 *
 * `showProject` parametri OLIB TASHLANDI: u loyiha nomini sarlavha ostiga
 * qo'shardi, lekin hech qayerdan uzatilmasdi - qator faqat loyihaning O'Z
 * ro'yxatida ishlatiladi, u yerda esa loyiha allaqachon ma'lum. Bir necha
 * loyiha ustidagi ro'yxatlar (bosh panel, profil) o'z jadvalini chizadi.
 */
export function TaskRow({ task }: { task: Task }) {
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
            <span className="muted nowrap" title={tx("ui.nechta_fayl", { n: task.attachment_count })}>
              <IconFile size={11} /> {task.attachment_count}
            </span>
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
        title={shown ? tx("ui.parolni_yashirish") : tx("ui.parolni_korsatish")}
        aria-label={shown ? tx("ui.parolni_yashirish") : tx("ui.parolni_korsatish")}
        aria-pressed={shown}
        tabIndex={-1}
      >
        {shown ? <IconEyeOff size={16} /> : <IconEye size={16} />}
      </button>
    </div>
  );
}

/* ------------------------------------------------- Ko'chirilgan bo'limlar

   Sana va solishtirish o'z fayllariga chiqdi (`dates.tsx`, `diff.tsx`) -
   sabab o'sha fayllarning boshida yozilgan. Bu yerdan qayta eksport
   qilinadi: ellikdan ortiq sahifa ularni `@/components/ui` dan import
   qiladi va hammasini bir vaqtda qayta yozish o'zgarishni tekshirib
   bo'lmaydigan darajada kattalashtirardi. Yangi kod to'g'ridan-to'g'ri
   `@/components/dates` va `@/components/diff` dan olsin. */
export {
  TZ, fmtDate, fmtDateTime, timeAgo, todayInTz,
  toDateTimeInput, fromDateTimeInput, DateField, DateTimeField,
} from "./dates";
export { DiffView, FieldDiff } from "./diff";
