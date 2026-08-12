import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { Project } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Loading, Progress } from "@/components/ui";

import Overview from "./project/Overview";
import Board from "./project/Board";
import TaskList from "./project/TaskList";
import Members from "./project/Members";
import History from "./project/History";
import Onboarding from "./project/Onboarding";
import Brief from "./project/Brief";

const TABS = [
  { slug: "", label: "Umumiy" },
  { slug: "doska", label: "Doska" },
  { slug: "vazifalar", label: "Vazifalar" },
  { slug: "jamoa", label: "Jamoa" },
  { slug: "tarix", label: "Tarix" },
  { slug: "kirish", label: "Loyihaga kirish" },
  { slug: "brif", label: "Brif" },
];

export default function ProjectDetail() {
  const { id, tab } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setProject(await api.get<Project>(`/projects/${id}/`));
    } catch {
      setError("Loyihani ochib bolmadi — ruxsat yoq yoki topilmadi");
    }
  };

  useEffect(() => { void reload(); }, [id]);

  if (error) return <div className="content"><div className="msg msg-error">{error}</div></div>;
  if (!project) return <div className="content"><Loading /></div>;

  const acc = project.access;
  const active = tab || "";

  return (
    <>
      <PageHead
        title={
          <>
            <span className="lang-dot" style={{ background: project.color }} />{" "}
            <Link to="/loyihalar" className="muted">loyihalar</Link>
            <span className="muted"> / </span>
            <strong>{project.name}</strong>{" "}
            <span className="badge mono">{project.key}</span>{" "}
            <span className={`badge ${project.status === "ACTIVE" ? "badge-ok" : ""}`}>
              {project.status_display}
            </span>
            <span className="badge">{acc.role_label}</span>
          </>
        }
        actions={
          <>
            {acc.can_create_task && (
              <>
                <Link className="btn btn-sm" to={`/loyiha/${id}/koplab-vazifa`}>Koplab vazifa</Link>
                <Link className="btn btn-sm btn-primary" to={`/loyiha/${id}/vazifa-yaratish`}>
                  Yangi vazifa
                </Link>
              </>
            )}
            {acc.can_manage && (
              <Link className="btn btn-sm" to={`/loyiha/${id}/tahrir`}>Sozlamalar</Link>
            )}
          </>
        }
        tabs={TABS.map((t) => (
          <NavLink
            key={t.slug}
            to={`/loyiha/${id}${t.slug ? "/" + t.slug : ""}`}
            end
            className={`tab ${active === t.slug ? "active" : ""}`}
          >
            {t.label}
            {t.slug === "jamoa" && !!project.pending_requests && (
              <span className="n" style={{ color: "var(--danger)" }}>{project.pending_requests}</span>
            )}
          </NavLink>
        ))}
      />

      <div className="content">
        <div className="row mb">
          <div style={{ flex: 1, maxWidth: 320 }}>
            <Progress value={project.progress} />
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            {project.progress}% bajarildi · {project.open_tasks} ochiq · {project.member_count} azo
          </span>
        </div>

        {active === "" && <Overview project={project} onChange={reload} />}
        {active === "doska" && <Board project={project} />}
        {active === "vazifalar" && <TaskList project={project} />}
        {active === "jamoa" && <Members project={project} onChange={reload} />}
        {active === "tarix" && <History project={project} />}
        {active === "kirish" && <Onboarding project={project} />}
        {active === "brif" && <Brief project={project} onChange={reload} />}
      </div>
    </>
  );
}
