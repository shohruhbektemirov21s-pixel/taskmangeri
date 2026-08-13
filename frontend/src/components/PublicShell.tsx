/**
 * Ochiq sahifalar uchun umumiy ramka (header + footer).
 *
 * Ro'yxatdan o'tmagan odam ham ko'radigan sahifalar shu ramkada turadi:
 * qidiruv va loyihaning ochiq ko'rinishi. Kirgan odam uchun tugmalar
 * o'zgaradi — qayta kirishga majburlamaymiz.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { IconSearch } from "./icons";
import ThemeToggle from "./ThemeToggle";
import { Logo } from "./Logo";

export default function PublicShell({
  children, query = "", showSearch = true,
}: {
  children: ReactNode;
  query?: string;
  showSearch?: boolean;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState(query);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setQ(query); }, [query]);

  // "/" tugmasi qidiruvni ochadi — headerdagi ishora shuni va'da qiladi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        || el instanceof HTMLSelectElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="lp-header">
        <div className="lp-wrap">
          <Link to="/" className="logo-link"
                style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text)", fontWeight: 600 }}>
            <Logo size={30} /> <span>TeamFlow</span>
          </Link>

          <span className="spacer" />

          {showSearch && (
            <form
              className="gh-search"
              onSubmit={(e) => {
                e.preventDefault();
                nav(`/qidiruv?q=${encodeURIComponent(q.trim())}`);
              }}
            >
              <IconSearch size={14} />
              <input ref={input} type="search" value={q} placeholder="Loyiha qidirish…"
                     onChange={(e) => setQ(e.target.value)} />
              <kbd>/</kbd>
            </form>
          )}

          <ThemeToggle />

          {user ? (
            <Link className="btn btn-primary" to="/panel">Panelga o'tish</Link>
          ) : (
            <>
              <Link className="btn" to="/kirish">Kirish</Link>
              <Link className="btn btn-primary" to="/royxatdan-otish">Ro'yxatdan o'tish</Link>
            </>
          )}
        </div>
      </header>

      {children}

      <footer className="lp-footer">
        <div className="lp-wrap">
          <Logo size={22} />
          <span>TeamFlow</span>
          <span className="spacer" />
          <Link to="/">Bosh sahifa</Link>
          <Link to="/qidiruv">Loyihalar</Link>
          {!user && <Link to="/royxatdan-otish">Ro'yxatdan o'tish</Link>}
        </div>
      </footer>
    </>
  );
}
