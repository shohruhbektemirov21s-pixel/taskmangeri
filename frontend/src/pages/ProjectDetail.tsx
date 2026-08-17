import { Suspense, lazy } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { useFetch } from "@/api/useFetch";
import type { Project } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { ErrorMsg, Loading, Progress } from "@/components/ui";

/**
 * Bo'limlar talab bo'yicha yuklanadi.
 *
 * Ilgari hammasi shu yerda statik import qilinardi va bitta bo'lakka
 * tushardi: «Umumiy» ni ochgan odam ham doska, suhbat, prognoz, tarix va
 * hujjatlar kodini yuklab olardi. Endi har bo'lim bosilganda keladi.
 */
const Overview = lazy(() => import("./project/Overview"));
const Board = lazy(() => import("./project/Board"));
const TaskList = lazy(() => import("./project/TaskList"));
const Members = lazy(() => import("./project/Members"));
const History = lazy(() => import("./project/History"));
const Onboarding = lazy(() => import("./project/Onboarding"));
const Brief = lazy(() => import("./project/Brief"));
const Chat = lazy(() => import("@/components/Chat"));
const Files = lazy(() => import("./project/Files"));
const ForecastTab = lazy(() => import("./project/Forecast"));

// `team`: faqat jamoa a'zosiga ochiladigan bo'limlar. Loyihani ko'ra
// oladigan odam hujjatlarni ham, tarixni ham ko'radi — ular loyiha nima
// ekanini tushuntiradi. Yopiq qoladigan yagona joy — suhbat: u jamoaning
// ish yozishmasi, tomoshabinga emas (serverda ham shunday).
const TABS = [
  { slug: "", label: "Umumiy" },
  { slug: "doska", label: "Doska" },
  { slug: "vazifalar", label: "Vazifalar" },
  { slug: "jamoa", label: "Jamoa" },
  { slug: "muddatlar", label: "Muddatlar" },
  { slug: "fayllar", label: "Hujjatlar" },
  { slug: "chat", label: "Suhbat", team: true },
  { slug: "tarix", label: "Tarix" },
  { slug: "kirish", label: "Loyihaga kirish" },
  { slug: "brif", label: "Brif" },
];

export default function ProjectDetail() {
  const { id, tab } = useParams();
  const nav = useNavigate();
  const { data: project, error, loading, reload } = useFetch<Project>(`/projects/${id}/`);

  if (loading) return <div className="content"><Loading /></div>;
  if (!project) {
    return (
      <div className="content">
        <ErrorMsg error={error || "Loyihani ochib bo'lmadi - ruxsat yo'q yoki topilmadi."} />
      </div>
    );
  }

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
            {/* Yopiq loyihada ishlayotganini odam bilib tursin */}
            {!project.is_public && (
              <span className="badge badge-warn"
                    title="Bu loyihani faqat jamoa azolari koradi">
                yopiq
              </span>
            )}
          </>
        }
        /* Tavsif har bir bo'limda ko'rinib tursin - loyiha nimaligini
           bilish uchun «Umumiy» ga qaytish shart emas. */
        subtitle={project.description || undefined}
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
        tabs={TABS.filter((t) => !t.team || acc.is_member || acc.is_manager || acc.is_admin).map((t) => (
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

        <Suspense fallback={<Loading />}>
          {active === "" && <Overview project={project} onChange={reload} />}
          {active === "doska" && <Board project={project} />}
          {active === "vazifalar" && <TaskList project={project} />}
          {active === "jamoa" && <Members project={project} onChange={reload} />}
          {active === "muddatlar" && <ForecastTab project={project} />}
          {active === "fayllar" && <Files project={project} />}
          {active === "chat" && <Chat projectId={project.id} />}
          {active === "tarix" && <History project={project} />}
          {active === "kirish" && <Onboarding project={project} />}
          {active === "brif" && <Brief project={project} onChange={reload} />}
        </Suspense>
      </div>
    </>
  );
}
