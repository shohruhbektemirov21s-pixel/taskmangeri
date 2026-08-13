import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, listOf } from "@/api/client";
import type { Activity, Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import Timeline from "@/components/Timeline";
import { Card, Loading } from "@/components/ui";

const CATEGORIES = [
  { value: "", label: "Hammasi" },
  { value: "task", label: "Vazifalar" },
  { value: "review", label: "Tekshiruvlar" },
  { value: "member", label: "Jamoa" },
  { value: "project", label: "Loyiha" },
];

export default function Feed() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [projects, setProjects] = useState<Project[]>([]);

  const search = params.get("q") || "";
  const category = params.get("category") || "";
  const days = params.get("days") || "";
  const project = params.get("project") || "";

  // Filtr ro'yxati: admin hammasini, qolganlar o'z loyihalarini ko'radi.
  useEffect(() => {
    void api.get<any>("/projects/", {
      scope: user?.is_platform_admin ? "all" : "mine", page_size: 100,
    }).then((d) => setProjects(listOf<Project>(d))).catch(() => setProjects([]));
  }, [user?.is_platform_admin]);

  useEffect(() => {
    setItems(null);
    // `project` bo'sh bo'lsa yuborilmaydi - u holda butun tarix qaytadi.
    void api.get<any>("/activity/", { search, category, days, project, page, page_size: 50 })
      .then((d) => { setItems(d.results || []); setCount(d.count || 0); })
      .catch(() => { setItems([]); setCount(0); });
  }, [search, category, days, project, page]);

  function set(k: string, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    setPage(1);
  }

  const pages = Math.ceil(count / 50);

  return (
    <>
      <PageHead title={<strong>Umumiy tarix</strong>}
                actions={<span className="badge">{count} yozuv</span>} />
      <div className="content">
        <div className="filters">
          <div className="f" style={{ flex: 1 }}>
            <label>Qidiruv</label>
            <input defaultValue={search} placeholder="Matn boyicha"
                   onKeyDown={(e) => {
                     if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
                   }} />
          </div>
          <div className="f">
            <label>Turkum</label>
            <select value={category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Loyiha</label>
            <select value={project} onChange={(e) => set("project", e.target.value)}>
              <option value="">Barcha loyihalar</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Davr</label>
            <select value={days} onChange={(e) => set("days", e.target.value)}>
              <option value="">Butun tarix</option>
              <option value="7">Songgi 7 kun</option>
              <option value="30">Songgi 30 kun</option>
            </select>
          </div>
        </div>

        <Card>
          {!items ? <Loading /> : <Timeline items={items} />}
          {pages > 1 && (
            <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
              <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                ← Oldingi
              </button>
              <span className="muted">{page} / {pages}</span>
              <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Keyingi →
              </button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
