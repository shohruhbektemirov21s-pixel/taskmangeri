import { Suspense, lazy } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { useFetch } from "@/api/useFetch";
import type { Project } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Empty, ErrorMsg, Loading, Progress } from "@/components/ui";
import { toBulkTasks, toNewTask, toProject, toProjectEdit, useEntityId } from "@/nav";

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
  // Slug `brif` bo'lib qoladi - u serverdagi `ProjectBrief` bilan bir
  // xil nom va marshrutda ham shu. O'zbekcha yorlig'i esa loyihaning
  // texnik tavsifi ekanini aniqroq aytadi.
  { slug: "brif", label: "Arxitekturasi" },
];

export default function ProjectDetail() {
  // Loyiha raqami manzilda emas, sahifa holatida - `src/nav` ga qarang.
  // `tab` esa manzilda qoladi: u maxfiy ham emas, kimningdir raqami ham
  // emas, lekin orqaga qaytish va sahifani yangilash uchun kerak.
  const id = useEntityId("project");
  const { tab } = useParams();
  const nav = useNavigate();
  const { data: project, error, loading, reload } = useFetch<Project>(
    id ? `/projects/${id}/` : null);

  // Manzilni qo'lda yozib kirgan yoki sessiyasi tozalangan odam shu yerga
  // tushadi: oq ekran emas, tushunarli chiqish yo'li bo'lsin.
  if (!id) {
    return (
      <div className="content">
        <Empty title="Loyiha tanlanmagan"
               text="Manzilda loyiha raqami saqlanmaydi - uni ro'yxatdan tanlang.">
          <Link className="btn btn-primary" to="/loyihalar">Loyihalarim</Link>
        </Empty>
      </div>
    );
  }

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
                <Link className="btn btn-sm" {...toBulkTasks(id)}>Koplab vazifa</Link>
                <Link className="btn btn-sm btn-primary" {...toNewTask(id)}>
                  Yangi vazifa
                </Link>
              </>
            )}
            {acc.can_manage && (
              <Link className="btn btn-sm" {...toProjectEdit(id)}>Sozlamalar</Link>
            )}
          </>
        }
        tabs={TABS.filter((t) => !t.team || acc.is_member || acc.is_manager || acc.is_admin).map((t) => (
          <NavLink
            key={t.slug}
            {...toProject(id, t.slug || undefined)}
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
