import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Project } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Empty, ErrorMsg, Loading, Progress, RowMenu, confirmDelete }
  from "@/components/ui";

export default function Projects() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [scope, setScope] = useState("mine");

  const load = useCallback(async () => {
    const d = await api.get<any>("/projects/", { scope, page_size: 100 });
    setProjects(listOf<Project>(d));
  }, [scope]);

  useEffect(() => {
    setProjects(null);
    void load();
  }, [load]);

  /** Loyihani o'chirish - nomini yozdirib tasdiqlaymiz. */
  async function removeProject(id: number, name: string) {
    if (!confirmDelete(name)) return;
    setError(null);
    try {
      await api.delete(`/projects/${id}/`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Loyihani ochirib bolmadi");
    }
  }

  return (
    <>
      <PageHead
        title={<strong>Loyihalar</strong>}
        actions={
          <>
            <div className="btn-group">
              {[["mine", "Meniki"], ["managed", "Boshqaruvim"], ["discover", "Ochiq"]].map(([v, l]) => (
                <button key={v} className={`btn btn-sm ${scope === v ? "btn-accent" : ""}`}
                        onClick={() => setScope(v)}>{l}</button>
              ))}
            </div>
            {user?.can_create_project && (
              <Link className="btn btn-primary btn-sm" to="/loyiha/yangi">Yangi loyiha</Link>
            )}
          </>
        }
      />
      <div className="content">
        <ErrorMsg error={error} />
        {!projects ? <Loading /> : (
          <div className="card">
            <div className="card-list">
              {projects.map((p) => (
                /* Qatorning istalgan yeriga bosilsa loyiha ochiladi - nomni
                   aniq nishonga olish shart emas. Ichidagi havola va
                   tugmalar o'z ishini qiladi (`stopPropagation`). */
                <div className="repo-item clickable" key={p.id}
                     onClick={() => nav(`/loyiha/${p.id}`)}>
                  <div className="row wrap">
                    <h3 style={{ margin: 0 }}>
                      <span className="lang-dot" style={{ background: p.color }} />{" "}
                      <Link to={`/loyiha/${p.id}`}
                            onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                    </h3>
                    <span className="badge mono">{p.key}</span>
                    <span className={`badge ${p.status === "ACTIVE" ? "badge-ok" : ""}`}>
                      {p.status_display}
                    </span>
                    <span className="spacer" />
                    <Link className="btn btn-sm" to={`/loyiha/${p.id}/doska`}
                          onClick={(e) => e.stopPropagation()}>Doska</Link>
                    <Link className="btn btn-sm" to={`/loyiha/${p.id}/tarix`}
                          onClick={(e) => e.stopPropagation()}>Tarix</Link>
                    {/* Boshqarish amallari chekkadagi «⋯» ostida: ro'yxat toza qoladi.
                        Menejer va admin uchun ko'rinadi, serverda ham shu tekshiriladi. */}
                    {(p.manager?.id === user?.id || user?.is_platform_admin) && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <RowMenu>
                          <Link to={`/loyiha/${p.id}/tahrir`}>Tahrirlash</Link>
                          <button type="button" className="danger"
                                  onClick={() => void removeProject(p.id, p.name)}>
                            Ochirish
                          </button>
                        </RowMenu>
                      </span>
                    )}
                  </div>
                  {p.description && <p className="muted" style={{ margin: "8px 0 0" }}>{p.description}</p>}
                  <div style={{ marginTop: 10 }}><Progress value={p.progress} /></div>
                  <div className="repo-meta">
                    <span>{p.workspace_name}</span>
                    <span>{p.open_tasks} ochiq</span>
                    <span>{p.done_tasks} bajarilgan</span>
                    <span>{p.member_count} azo</span>
                    <span>menda: {p.my_tasks}</span>
                    {p.manager && <span>PM: {p.manager.full_name}</span>}
                  </div>
                </div>
              ))}
              {!projects.length && (
                <Empty icon="☰" title="Loyiha topilmadi" text="Ochiq loyihaga qoshiling yoki yangi yarating.">
                  <div className="row" style={{ justifyContent: "center" }}>
                    <Link className="btn btn-primary" to="/qoshilish">Loyiha topish</Link>
                    {user?.can_create_project && (
                      <Link className="btn" to="/loyiha/yangi">Yangi loyiha</Link>
                    )}
                  </div>
                </Empty>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
