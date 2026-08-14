import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, listOf } from "@/api/client";
import type { Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, Empty, Loading, SpecialtyTag } from "@/components/ui";

export default function Discover() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setProjects(null);
    const d = await api.get<any>("/projects/", {
      scope: "discover",
      search: q,
      page_size: 100,
    });
    setProjects(listOf<Project>(d));
  }

  useEffect(() => { void load(); }, []);

  return (
    <>
      <PageHead title={<strong>Loyihaga qoshilish</strong>} />
      <div className="content">
        <div className="split">
          <div>
            <form className="filters" onSubmit={(e) => { e.preventDefault(); void load(); }}>
              <div className="f" style={{ flex: 1 }}>
                <label>Qidiruv</label>
                <input value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder="Loyiha nomi yoki kaliti" />
              </div>
              <button className="btn">Qidirish</button>
            </form>

            {!projects ? <Loading /> : (
              <div className="card">
                <div className="card-list">
                  {projects.map((p) => (
                    /* Butun karta bosiladi - loyihaga kirish uchun tugmani
                       qidirib o'tirish shart emas. Ichidagi tugmalar o'z
                       ishini qiladi (`stopPropagation`). */
                    <div className="repo-item clickable" key={p.id}
                         onClick={() => nav(`/loyiha/${p.id}`)}>
                      <div className="row wrap">
                        <h3 style={{ margin: 0 }}>
                          <span className="lang-dot" style={{ background: p.color }} />{" "}
                          <Link to={`/loyiha/${p.id}`}
                                onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                        </h3>
                        <span className="badge mono">{p.key}</span>
                        {p.auto_accept && <span className="badge badge-ok">avtomatik qabul</span>}
                        <span className="spacer" />
                        {/* Ochiq loyihani qo'shilmasdan ham ko'rish mumkin:
                            vazifalar va tarix ko'rinadi, fayllar esa faqat
                            jamoaga (serverda shunday cheklangan). */}
                        <Link className="btn btn-sm btn-primary" to={`/loyiha/${p.id}/qoshilish`}
                              onClick={(e) => e.stopPropagation()}>
                          Qoshilish
                        </Link>
                      </div>
                      {p.description && <p className="muted" style={{ margin: "8px 0 0" }}>{p.description}</p>}
                      <div className="repo-meta">
                        <span>{p.workspace_name}</span>
                        <span>{p.member_count} azo</span>
                        <span>{p.open_tasks} ochiq vazifa</span>
                        {p.manager && <span>PM: {p.manager.full_name}</span>}
                      </div>
                    </div>
                  ))}
                  {!projects.length && (
                    <Empty title="Loyiha topilmadi"
                           text="Hozircha ochiq loyiha yoq yoki qidiruvga mos kelmadi." />
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <Card title="Sizning yonalishingiz">
              <div className="row mb"><SpecialtyTag user={user} /></div>
              <strong style={{ fontSize: 13 }}>Konikmalaringiz</strong>
              <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
                {user?.skill_list.map((s) => <span className="badge" key={s}>{s}</span>)}
              </div>
            </Card>

          </div>
        </div>
      </div>
    </>
  );
}
