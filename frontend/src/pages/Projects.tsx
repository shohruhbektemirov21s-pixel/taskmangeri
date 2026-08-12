import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf } from "@/api/client";
import type { Project } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Empty, Loading, Progress } from "@/components/ui";

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [scope, setScope] = useState("mine");

  useEffect(() => {
    setProjects(null);
    void api.get<any>("/projects/", { scope, page_size: 100 })
      .then((d) => setProjects(listOf<Project>(d)));
  }, [scope]);

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
            <Link className="btn btn-primary btn-sm" to="/loyiha/yangi">Yangi loyiha</Link>
          </>
        }
      />
      <div className="content">
        {!projects ? <Loading /> : (
          <div className="card">
            <div className="card-list">
              {projects.map((p) => (
                <div className="repo-item" key={p.id}>
                  <div className="row wrap">
                    <h3 style={{ margin: 0 }}>
                      <span className="lang-dot" style={{ background: p.color }} />{" "}
                      <Link to={`/loyiha/${p.id}`}>{p.name}</Link>
                    </h3>
                    <span className="badge mono">{p.key}</span>
                    <span className={`badge ${p.status === "ACTIVE" ? "badge-ok" : ""}`}>
                      {p.status_display}
                    </span>
                    <span className="spacer" />
                    <Link className="btn btn-sm" to={`/loyiha/${p.id}/doska`}>Doska</Link>
                    <Link className="btn btn-sm" to={`/loyiha/${p.id}/tarix`}>Tarix</Link>
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
                    <Link className="btn" to="/loyiha/yangi">Yangi loyiha</Link>
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
