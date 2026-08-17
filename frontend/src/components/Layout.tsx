import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, listOf } from "@/api/client";
import type { SidebarCounts, UserBrief } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { useRealtime } from "@/realtime/RealtimeContext";
import ErrorBoundary from "./ErrorBoundary";
import { Logo } from "./Logo";
import {
  IconBell, IconBoard, IconChat, IconClose, IconDashboard, IconHistory, IconInbox, IconLogout,
  IconCalendar, IconMenu, IconPlus, IconReview, IconSearch, IconTasks,
} from "./icons";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import { Avatar, SpecialtyTag } from "./ui";

export default function Layout() {
  const { user, logout } = useAuth();
  const { subscribe } = useRealtime();
  const nav = useNavigate();
  const loc = useLocation();
  const [counts, setCounts] = useState({ open: 0, reviews: 0, joins: 0 });
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  // Tepadagi qidiruv odamni ham topadi: ism, familiya yoki email bo'yicha.
  const [people, setPeople] = useState<UserBrief[]>([]);
  const [openHits, setOpenHits] = useState(false);
  // Telefonda yon panel chetdan chiqadigan tortma bo'ladi.
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    // Sahifadan sahifaga tez o'tilganda eski javob yangi sanoqni bosmasin.
    let alive = true;
    void (async () => {
      try {
        // Yengil endpoint: faqat uchta `COUNT`. Ilgari bu yerda `/dashboard/`
        // chaqirilardi - u o'nlab vazifa, loyiha va tasmani seriyalizatsiya
        // qiladi, ustiga muddat eslatmalarini tekshiradi. Uchta raqam uchun.
        const d = await api.get<SidebarCounts>("/counts/");
        if (alive) setCounts(d);
      } catch { /* jim */ }
    })();
    return () => { alive = false; };
  }, [tick]);

  // Sanoq navigatsiyada emas, HODISADA yangilanadi. Ilgari u har sahifa
  // almashganda qayta so'ralardi - ya'ni menyu bo'ylab yurgan odam o'nlab
  // ortiqcha so'rov yuborardi, holbuki raqamlar o'zgarmagan. WebSocket
  // baribir ulangan: vazifa yoki qo'shilish so'rovi o'zgarsa shu yerdan
  // xabar keladi.
  useEffect(() => subscribe((data) => {
    const joinRequest =
      data.event === "notification" && data.notification?.kind === "join.request";
    if (joinRequest || data.event === "task.update") setTick((n) => n + 1);
  }), [subscribe]);

  // Yozish to'xtagach odam qidiriladi - har harfda so'rov yubormaymiz.
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setPeople([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api.get<any>("/users/", { search: needle, page_size: 6 })
        .then((d) => setPeople(listOf<UserBrief>(d)))
        .catch(() => setPeople([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  // Sahifa almashsa qidiruv oynasi ham, tortma ham yopilsin.
  useEffect(() => { setOpenHits(false); setMenu(false); }, [loc.pathname]);

  // Tortma ochiq turganda: Esc yopadi va orqadagi sahifa siljimaydi.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menu]);

  const item = (to: string, icon: React.ReactNode, label: string, count?: number, hot = false) => (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} end>
      <span className="ico">{icon}</span>
      <span className="label">{label}</span>
      {!!count && <span className={`count ${hot ? "hot" : ""}`}>{count}</span>}
    </NavLink>
  );

  // Yuqori panel: yon panelning o'ng tomonida turadi, shuning uchun u
  // `.main` ustuni ichida chiziladi. Logotip esa yon panelning tepasida -
  // dizaynda shunday: chapda brend va navigatsiya, o'ngda qidiruv va
  // amallar. Ikkalasi bir marta yoziladi va shu yerda yig'iladi.
  const header = (
    <header className="gh-top">
      <button type="button" className="top-icon menu-btn" onClick={() => setMenu((v) => !v)}
              aria-label={menu ? "Menyuni yopish" : "Menyuni ochish"} aria-expanded={menu}>
        {menu ? <IconClose size={17} /> : <IconMenu size={17} />}
      </button>

      {/* Yuqori panelda navigatsiya havolalari yo'q: «Loyihalar» va
          «Mening ishim» yon panelda turadi va u har doim ko'rinadi
          (mobilda menyu tugmasi bilan). Bir xil havola ikki joyda
          turgani foyda bermaydi - odam qaysi biri "asosiy" ekanini
          o'ylab qoladi. */}

        <div className="top-search">
          <form
            className="gh-search"
            onSubmit={(e) => {
              e.preventDefault();
              setOpenHits(false);
              nav(`/tarix?q=${encodeURIComponent(q)}`);
            }}
          >
            <IconSearch size={14} />
            <input
              type="search"
              placeholder="Odam, tarix va loyihalardan qidirish"
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpenHits(true); }}
              onFocus={() => setOpenHits(true)}
              /* Havolaga bosilguncha ro'yxat yopilib qolmasin */
              onBlur={() => window.setTimeout(() => setOpenHits(false), 160)}
            />
          </form>

          {openHits && q.trim().length >= 2 && (
            /* Sichqoncha bosilganda maydon fokusni yo'qotmasin: aks holda blur
               ro'yxatni yopadi va havola bosilishga ulgurmaydi (mousedown bilan
               mouseup orasida 160 ms dan ko'p vaqt o'tsa - odatiy hol). */
            <div className="top-hits" onMouseDown={(e) => e.preventDefault()}>
              {people.length > 0 && <div className="top-hits-head">Odamlar</div>}
              {people.map((u) => (
                <Link key={u.id} className="top-hit" to={`/profil/${u.id}`}
                      onClick={() => { setOpenHits(false); setQ(""); }}>
                  <Avatar user={u} size="sm" />
                  <span className="top-hit-text">
                    <strong>{u.full_name}</strong>
                    <span className="muted mono">{u.email}</span>
                  </span>
                  <SpecialtyTag user={u} compact />
                </Link>
              ))}
              {!people.length && (
                <div className="muted" style={{ padding: "10px 12px", fontSize: 13 }}>
                  Bu ism bo'yicha odam topilmadi.
                </div>
              )}
              <button type="button" className="top-hit top-hit-all"
                      onClick={() => { setOpenHits(false); nav(`/tarix?q=${encodeURIComponent(q)}`); }}>
                «{q.trim()}» bo'yicha tarix va loyihalarni qidirish
              </button>
            </div>
          )}
        </div>

        {/* Qidiruv chapda, amallar o'ngda - orasi bo'sh qoladi */}
        <span className="spacer" />

        <ThemeToggle />
        <NotificationBell />
        <Link className="top-icon hide-sm" to="/xabarlar" title="Xabarlar">
          <IconChat size={17} />
        </Link>
        <Link className="top-icon hide-sm" to="/tekshiruv" title="Tekshiruv navbati">
          <IconInbox size={17} />
          {!!counts.reviews && <span className="dot">{counts.reviews}</span>}
        </Link>
        {/* Loyiha ochish - faqat menejer va admin */}
        {user?.can_create_project && (
          <Link className="top-icon hide-sm" to="/loyiha/yangi" title="Yangi loyiha">
            <IconPlus size={17} />
          </Link>
        )}
        <Link to="/profil" title={user?.full_name}>
          <Avatar user={user} />
        </Link>
    </header>
  );

  return (
    <>
      <div className="layout">
        {menu && <button type="button" className="scrim" aria-label="Menyuni yopish"
                         onClick={() => setMenu(false)} />}
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <Link to="/panel" className="logo-link">
            <Logo size={28} />
            <span>TeamFlow</span>
          </Link>

          <div className="nav-section">
            {item("/panel", <IconDashboard />, "Bosh panel")}
            {/* Loyihalar birma-bir sanalmaydi - hammasi shu sahifada, qidiruv
                bilan. Jamoa kattalashganda yon panel uzayib ketmasin. Ochiq
                loyihalar ham o'sha yerdagi «Ochiq» tugmasida. */}
            {item("/loyihalar", <IconBoard />, "Loyihalar")}
            {item("/mening-ishim", <IconTasks />, "Mening ishim", counts.open)}
            {item("/tekshiruv", <IconReview />, "Tekshiruv navbati", counts.reviews, true)}
            {item("/xabarlar", <IconChat />, "Xabarlar")}
            {item("/bildirishnomalar", <IconBell />, "Bildirishnomalar")}
            {item("/taqvim", <IconCalendar />, "Taqvim")}
            {item("/tarix", <IconHistory />, "Umumiy tarix")}
          </div>

          <div className="sidebar-footer">
            <Link to="/profil" className="sidebar-user">
              <Avatar user={user} />
              <span style={{ minWidth: 0 }}>
                <span className="name">{user?.full_name}</span>
                <br />
                <span className="role">{user?.specialty_display}</span>
              </span>
            </Link>
            <button
              className="btn btn-sm btn-block btn-logout"
              onClick={() => {
                logout();
                nav("/kirish");
              }}
            >
              <IconLogout size={14} /> Chiqish
            </button>
          </div>
        </aside>

        <div className="main">
          {header}
          {/* Sahifa to'sig'i: bitta bo'lim yiqilsa yon panel, qidiruv va
              bildirishnomalar joyida qoladi - odam boshqa bo'limga o'tib
              ketaveradi. `key` manzil: yangi sahifada to'siq o'zi tiklanadi,
              aks holda xato holati saqlanib qolardi. */}
          <ErrorBoundary key={loc.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
    </>
  );
}

/** Sahifa sarlavhasi */
export function PageHead({
  title,
  subtitle,
  actions,
  tabs,
}: {
  title: React.ReactNode;
  /** Sarlavha ostidagi qator - masalan loyiha tavsifi */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="title-row">
        <h1>{title}</h1>
        <span className="spacer" />
        {actions}
      </div>
      {subtitle && <div className="page-sub">{subtitle}</div>}
      {tabs && <div className="tabs">{tabs}</div>}
    </div>
  );
}
