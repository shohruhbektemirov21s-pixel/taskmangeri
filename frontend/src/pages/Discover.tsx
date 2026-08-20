import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf } from "@/api/client";
import type { Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, Empty, Loading, SpecialtyTag } from "@/components/ui";
import { toProject, toProjectJoin, useGo } from "@/nav";
import { tx } from "@/i18n";

export default function Discover() {
  const fid = useId();
  const go = useGo();
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
      <PageHead title={<strong>{tx("discover.loyihaga_qoshilish")}</strong>} />
      <div className="content">
        <div className="split">
          <div>
            <form className="filters" onSubmit={(e) => { e.preventDefault(); void load(); }}>
              <div className="f grow">
                <label htmlFor={`${fid}-0`}>{tx("common.qidiruv")}</label>
                <input id={`${fid}-0`} value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder={tx("discover.loyiha_nomi_yoki_kaliti")} />
              </div>
              <button className="btn">{tx("discover.qidirish")}</button>
            </form>

            {!projects ? <Loading /> : (
              <div className="card">
                <div className="card-list">
                  {projects.map((p) => (
                    /* Butun karta bosiladi - loyihaga kirish uchun tugmani
                       qidirib o'tirish shart emas. Ichidagi tugmalar o'z
                       ishini qiladi (`stopPropagation`). */
                    <div className="repo-item clickable" key={p.id}
                         onClick={() => go(toProject(p.id))}>
                      <div className="row wrap">
                        <h3 style={{ margin: 0 }}>
                          <span className="lang-dot" style={{ background: p.color }} />{" "}
                          <Link {...toProject(p.id)}
                                onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                        </h3>
                        <span className="badge mono">{p.key}</span>
                        {p.auto_accept && <span className="badge badge-ok">{tx("discover.avtomatik_qabul")}</span>}
                        <span className="spacer" />
                        {/* Ochiq loyihani qo'shilmasdan ham ko'rish mumkin:
                            vazifalar va tarix ko'rinadi, fayllar esa faqat
                            jamoaga (serverda shunday cheklangan). */}
                        <Link className="btn btn-sm btn-primary" {...toProjectJoin(p.id)}
                              onClick={(e) => e.stopPropagation()}>
                          {tx("common.qoshilish")}
                        </Link>
                      </div>
                      {p.description && <p className="muted" style={{ margin: "8px 0 0" }}>{p.description}</p>}
                      <div className="repo-meta">
                        <span>{p.workspace_name}</span>
                        <span>{p.member_count} {tx("common.azo")}</span>
                        <span>{p.open_tasks} {tx("common.ochiq_vazifa")}</span>
                        {p.manager && <span>{tx("common.pm")} {p.manager.full_name}</span>}
                      </div>
                    </div>
                  ))}
                  {!projects.length && (
                    <Empty title={tx("common.loyiha_topilmadi")}
                           text={tx("discover.hozircha_ochiq_loyiha_yoq_yoki")} />
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <Card title={tx("discover.sizning_yonalishingiz")}>
              <div className="row mb"><SpecialtyTag user={user} /></div>
              <strong style={{ fontSize: 13 }}>{tx("discover.konikmalaringiz")}</strong>
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
