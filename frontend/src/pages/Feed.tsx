/**
 * Umumiy tarix — loyihalar kesimida.
 *
 * Ilgari bu sahifa hamma loyihaning yozuvlarini bitta aralash lentaga
 * qo'yardi: yozuv ko'payganda unda hech narsa topib bo'lmasdi. Endi avval
 * **loyihalar ro'yxati** chiqadi, odam qaysinisini ochishni o'zi tanlaydi.
 *
 * Qidiruv ikki darajada ishlaydi:
 *   - loyiha yopiq turganda — nom, kalit va tavsif bo'yicha loyiha qidiriladi;
 *   - loyiha ochilganda — o'sha loyihaning yozuvlari matn bo'yicha filtrlanadi.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import type { Activity } from "@/api/types";
import { PageHead } from "@/components/Layout";
import Timeline from "@/components/Timeline";
import { Card, Empty, Loading, timeAgo } from "@/components/ui";

interface ProjectRow {
  id: number;
  name: string;
  key: string;
  color: string;
  status_display: string;
  is_public: boolean;
  manager_name: string;
  activity_count: number;
  last_activity: string | null;
}

/** Ochilgan loyihaning yozuvlari — faqat ochilganda so'raladi. */
function ProjectFeed({ projectId }: { projectId: number }) {
  const fid = useId();
  // Turkumlar backenddan (`/meta/` -> `VERB_META`): frontendda qattiq
  // yozilganda «Ish maydoni» va «Foydalanuvchi» filtrga tushmay qolgan edi.
  const { meta } = useAuth();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: "", category: "", days: "", mine: "" });

  useEffect(() => {
    // Filtr yoki sahifa tez almashtirilsa eski javob yangisining ustiga
    // tushmasin - kechikkan so'rov bekor qilinadi.
    let alive = true;
    setItems(null);
    void api.get<any>("/activity/", {
      project: projectId, search: f.search, category: f.category, days: f.days,
      page, page_size: 50,
    })
      .then((d) => { if (!alive) return; setItems(d.results || []); setCount(d.count || 0); })
      .catch(() => { if (!alive) return; setItems([]); setCount(0); });
    return () => { alive = false; };
  }, [projectId, f, page]);

  const set = (k: string, v: string) => { setPage(1); setF((p) => ({ ...p, [k]: v })); };
  const pages = Math.ceil(count / 50);

  return (
    <div className="card-body">
      <div className="filters">
        <div className="f" style={{ flex: 1 }}>
          <label htmlFor={`${fid}-0`}>Yozuvlar ichidan qidirish</label>
          <input id={`${fid}-0`} defaultValue={f.search} placeholder="Matn boyicha"
                 onKeyDown={(e) => {
                   if (e.key === "Enter") set("search", (e.target as HTMLInputElement).value);
                 }} />
        </div>
        <div className="f">
          <label htmlFor={`${fid}-1`}>Turkum</label>
          <select id={`${fid}-1`} value={f.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Hammasi</option>
            {(meta?.activity_category || []).map((c) => (
              <option key={String(c.value)} value={String(c.value)}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor={`${fid}-2`}>Davr</label>
          <select id={`${fid}-2`} value={f.days} onChange={(e) => set("days", e.target.value)}>
            <option value="">Butun tarix</option>
            <option value="7">Songgi 7 kun</option>
            <option value="30">Songgi 30 kun</option>
            <option value="90">Songgi 90 kun</option>
          </select>
        </div>
      </div>

      {!items ? <Loading /> : items.length
        ? <Timeline items={items} showProject={false} />
        : <Empty title="Yozuv topilmadi" text="Filtrni bo'shatib ko'ring." />}

      {pages > 1 && (
        <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
          <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            ← Oldingi
          </button>
          <span className="muted">{page} / {pages}</span>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Keyingi →
          </button>
        </div>
      )}
    </div>
  );
}

export default function Feed() {
  const fid = useId();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ProjectRow[] | null>(null);

  const q = params.get("q") || "";
  // Ochiq loyiha manzilda turadi — sahifa yangilansa ham ochiq qoladi.
  const open = Number(params.get("loyiha") || 0) || null;

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await api.get<ProjectRow[]>("/activity/by-project/", { q }));
    } catch {
      setRows([]);
    }
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  function set(k: string, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
  }

  const total = (rows || []).reduce((n, r) => n + r.activity_count, 0);

  return (
    <>
      <PageHead title={<strong>Umumiy tarix</strong>}
                subtitle="Loyihani bosing — o'sha loyihaning tarixi ochiladi"
                actions={<span className="badge">{total} yozuv</span>} />
      <div className="content">
        <div className="filters">
          <div className="f" style={{ flex: 1 }}>
            <label htmlFor={`${fid}-3`}>Loyiha qidirish</label>
            <input id={`${fid}-3`} defaultValue={q} placeholder="Nom, kalit yoki tavsif boyicha"
                   onKeyDown={(e) => {
                     if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
                   }} />
          </div>
        </div>

        {!rows ? <Loading /> : !rows.length ? (
          <Empty icon="☰" title="Loyiha topilmadi"
                 text={q ? "Qidiruvni o'zgartirib ko'ring." : "Hali loyiha yo'q."} />
        ) : (
          <div className="card">
            <div className="card-list">
              {rows.map((r) => {
                const isOpen = open === r.id;
                return (
                  <div key={r.id}>
                    {/* Butun qator ochish tugmasi — sarlavhani aniq nishonga
                        olish shart emas. Ichidagi havolalar o'z ishini qiladi. */}
                    <div className="repo-item clickable"
                         onClick={() => set("loyiha", isOpen ? "" : String(r.id))}>
                      <div className="row wrap">
                        <h3 style={{ margin: 0 }}>
                          <span className="lang-dot" style={{ background: r.color }} />{" "}
                          <Link to={`/loyiha/${r.id}`}
                                onClick={(e) => e.stopPropagation()}>{r.name}</Link>
                        </h3>
                        <span className="badge mono">{r.key}</span>
                        <span className="badge">{r.status_display}</span>
                        {!r.is_public && <span className="badge badge-warn">yopiq</span>}
                        <span className="spacer" />
                        <span className="badge">{r.activity_count} yozuv</span>
                        <span className="muted" style={{ fontSize: 18, lineHeight: 1 }}>
                          {isOpen ? "▴" : "▾"}
                        </span>
                      </div>
                      <div className="repo-meta">
                        {r.manager_name && <span>PM: {r.manager_name}</span>}
                        {r.last_activity && <span>songgi harakat: {timeAgo(r.last_activity)}</span>}
                      </div>
                    </div>
                    {isOpen && (
                      <Card padded={false}>
                        <ProjectFeed projectId={r.id} />
                      </Card>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
