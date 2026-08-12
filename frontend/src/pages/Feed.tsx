import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import type { Activity } from "@/api/types";
import { PageHead } from "@/components/Layout";
import Timeline from "@/components/Timeline";
import { Card, Loading } from "@/components/ui";

const CATEGORIES = [
  { value: "", label: "Hammasi" },
  { value: "task", label: "Vazifalar" },
  { value: "review", label: "Tekshiruvlar" },
  { value: "member", label: "Jamoa" },
  { value: "project", label: "Loyiha" },
  { value: "workspace", label: "Ish maydoni" },
];

export default function Feed() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);

  const search = params.get("q") || "";
  const category = params.get("category") || "";
  const days = params.get("days") || "";

  useEffect(() => {
    setItems(null);
    void api.get<any>("/activity/", { search, category, days, page, page_size: 50 })
      .then((d) => { setItems(d.results || []); setCount(d.count || 0); });
  }, [search, category, days, page]);

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
