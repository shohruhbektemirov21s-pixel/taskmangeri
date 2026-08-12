import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, listOf } from "@/api/client";
import type { Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Logo } from "./Logo";
import {
  IconBoard, IconDashboard, IconHistory, IconInbox, IconLogout, IconPlus,
  IconReview, IconSearch, IconSettings, IconTasks, IconUsers, IconWorkspace,
} from "./icons";
import { Avatar, SpecialtyTag } from "./ui";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState({ open: 0, reviews: 0, joins: 0 });
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.get<any>("/projects/", { scope: "mine", page_size: 12 });
        setProjects(listOf<Project>(data));
      } catch { /* jim */ }
      try {
        const d = await api.get<any>("/dashboard/");
        setCounts({
          open: d.stats.open,
          reviews: d.review_queue?.length ?? 0,
          joins: d.join_queue?.length ?? 0,
        });
      } catch { /* jim */ }
    })();
  }, [loc.pathname]);

  const item = (to: string, icon: React.ReactNode, label: string, count?: number, hot = false) => (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} end>
      <span className="ico">{icon}</span>
      <span className="label">{label}</span>
      {!!count && <span className={`count ${hot ? "hot" : ""}`}>{count}</span>}
    </NavLink>
  );

  return (
    <>
      <header className="gh-top">
        <Link to="/panel" className="logo-link">
          <Logo size={30} />
          <span>TeamFlow</span>
        </Link>

        <form
          className="gh-search"
          onSubmit={(e) => {
            e.preventDefault();
            nav(`/tarix?q=${encodeURIComponent(q)}`);
          }}
        >
          <IconSearch size={14} />
          <input
            type="search"
            placeholder="Tarix va loyihalardan qidirish"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>

        <nav className="top-nav">
          <Link to="/loyihalar">Loyihalar</Link>
          <Link to="/mening-ishim">Mening ishim</Link>
          <Link to="/ish-maydonlari">Ish maydonlari</Link>
        </nav>

        <span className="spacer" />

        <Link className="top-icon" to="/tekshiruv" title="Tekshiruv navbati">
          <IconInbox size={17} />
          {!!counts.reviews && <span className="dot">{counts.reviews}</span>}
        </Link>
        <Link className="top-icon" to="/loyiha/yangi" title="Yangi loyiha">
          <IconPlus size={17} />
        </Link>
        <Link to="/profil" title={user?.full_name}>
          <Avatar user={user} />
        </Link>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="nav-section">
            {item("/panel", <IconDashboard />, "Bosh panel")}
            {item("/mening-ishim", <IconTasks />, "Mening ishim", counts.open)}
            {item("/tekshiruv", <IconReview />, "Tekshiruv navbati", counts.reviews, true)}
            {item("/tarix", <IconHistory />, "Umumiy tarix")}
          </div>

          <div className="nav-section">
            <div className="nav-title">
              Loyihalar <span className="spacer" />
              <Link to="/loyiha/yangi">Yangi</Link>
            </div>
            {projects.map((p) => (
              <NavLink
                key={p.id}
                to={`/loyiha/${p.id}`}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <span className="ico">
                  <span className="lang-dot" style={{ background: p.color, width: 10, height: 10 }} />
                </span>
                <span className="label">{p.name}</span>
              </NavLink>
            ))}
            {!projects.length && <div className="nav-item muted">Hali loyiha yoq</div>}
            {item("/loyihalar", <IconBoard />, "Barchasi")}
            {item("/qoshilish", <IconSearch />, "Loyihaga qoshilish")}
          </div>

          <div className="nav-section">
            <div className="nav-title">Ish maydonlari</div>
            {item("/ish-maydonlari", <IconWorkspace />, "Royxat")}
            {item("/ish-maydoni/yangi", <IconPlus />, "Yangi maydon")}
          </div>

          {user?.is_platform_admin && (
            <div className="nav-section">
              <div className="nav-title">Boshqaruv</div>
              {item("/jamoa", <IconUsers />, "Foydalanuvchilar")}
              <a className="nav-item" href="/django-admin/" target="_blank" rel="noreferrer">
                <span className="ico"><IconSettings /></span>
                <span className="label">Django admin</span>
              </a>
            </div>
          )}

          <div className="sidebar-footer">
            <Link to="/profil" className="sidebar-user">
              <Avatar user={user} />
              <span style={{ minWidth: 0 }}>
                <span className="name">{user?.full_name}</span>
                <br />
                <span className="role">{user?.specialty_display}</span>
              </span>
            </Link>
            <div style={{ padding: "6px 8px" }}>
              <SpecialtyTag user={user} />
            </div>
            <button
              className="btn btn-sm btn-block"
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
          <Outlet />
        </div>
      </div>
    </>
  );
}

/** Sahifa sarlavhasi */
export function PageHead({
  title,
  actions,
  tabs,
}: {
  title: React.ReactNode;
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
      {tabs && <div className="tabs">{tabs}</div>}
    </div>
  );
}
