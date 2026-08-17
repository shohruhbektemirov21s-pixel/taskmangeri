import { useId, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Project } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { IconPlus } from "@/components/icons";
import { Empty, ErrorMsg, Loading, Progress, RowMenu } from "@/components/ui";
import { deleteProject } from "@/api/projects";

/**
 * Ro'yxat kesimlari.
 *
 * "Hammasi" faqat tizim adminiga ko'rinadi va backend ham aynan shunday
 * tekshiradi (`scope == "all" and user.is_platform_admin`). Bu tugmasiz
 * admin o'z sahifasida bo'shlik ko'rardi: u hech bir loyihaning a'zosi
 * emas, "Meniki" esa a'zolik bo'yicha filtrlaydi.
 */
const SCOPES = (isAdmin?: boolean): [string, string][] => [
  ["mine", "Meniki"],
  ["managed", "Boshqaruvim"],
  ["discover", "Ochiq"],
  ...(isAdmin ? ([["all", "Hammasi"]] as [string, string][]) : []),
];

export default function Projects() {
  const fid = useId();
  const nav = useNavigate();
  const { user } = useAuth();
  // O'chirish xatosi - yuklash xatosidan alohida.
  const [actionError, setActionError] = useState<string | null>(null);
  const [scope, setScope] = useState("mine");
  // `q` - maydonda yozilayotgan matn, `applied` - serverga yuborilgani.
  // Ikkovi ajratilgani uchun har harfda so'rov ketmaydi.
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");

  // Ilgari bu yerda `catch` yo'q edi: server xato bersa va'da rad etilib,
  // ro'yxat `null` bo'lib qolardi va sahifa abadiy «Yuklanmoqda» da turardi.
  const { data, error: loadError, loading, reload } =
    useFetch<any>("/projects/", { scope, search: applied, page_size: 100 });
  const projects = useMemo(() => (data ? listOf<Project>(data) : null), [data]);
  const error = actionError || loadError;

  /** Loyihani o'chirish - jarayondagi ish bo'lsa qo'shimcha tasdiq so'raladi. */
  async function removeProject(id: number, name: string) {
    setActionError(null);
    try {
      if (await deleteProject(id, name)) reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Loyihani ochirib bolmadi");
    }
  }

  return (
    <>
      <PageHead
        title={<strong>Loyihalar</strong>}
        subtitle="Faol loyihalar va jarayonlar monitoringi"
        actions={
          user?.can_create_project && (
            <Link className="btn btn-primary" to="/loyiha/yangi">
              <IconPlus size={15} /> Yangi loyiha
            </Link>
          )
        }
        /* Kesimlar - kapsula shaklidagi tablar: sarlavha ostida, dizayndagidek */
        tabs={SCOPES(user?.is_platform_admin).map(([v, l]) => (
          <button key={v} type="button" className={`tab ${scope === v ? "active" : ""}`}
                  onClick={() => setScope(v)}>{l}</button>
        ))}
      />
      <div className="content">
        <ErrorMsg error={error} />

        {/* Nom, kalit va tavsif bo'yicha - qidiruv serverda
            (`ProjectViewSet.search_fields`), ya'ni yuklanmagan
            loyihalar ham topiladi. */}
        <form className="filters" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
          <div className="f grow">
            <label htmlFor={`${fid}-0`}>Qidiruv</label>
            <input id={`${fid}-0`} value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Nom, tavsif yoki hujjat nomi boyicha" />
          </div>
          <button className="btn">Qidirish</button>
          {!!applied && (
            <button type="button" className="btn btn-ghost"
                    onClick={() => { setQ(""); setApplied(""); }}>
              Tozalash
            </button>
          )}
        </form>

        {loading ? <Loading /> : !projects ? null : !projects.length ? (
          <div className="card">
            <Empty icon="☰" title="Loyiha topilmadi"
                   text={applied
                     ? `«${applied}» boyicha hech narsa topilmadi - boshqacha yozib koring.`
                     : "Ochiq loyihaga qoshiling yoki yangi yarating."}>
              <div className="row" style={{ justifyContent: "center" }}>
                {applied ? (
                  <button className="btn" onClick={() => { setQ(""); setApplied(""); }}>
                    Qidiruvni tozalash
                  </button>
                ) : (
                  <>
                    <Link className="btn btn-primary" to="/qoshilish">Loyiha topish</Link>
                    {user?.can_create_project && (
                      <Link className="btn" to="/loyiha/yangi">Yangi loyiha</Link>
                    )}
                  </>
                )}
              </div>
            </Empty>
          </div>
        ) : (
          /* Ro'yxat emas, kartalar setkasi: har loyihaning jarayoni va uchta
             asosiy raqami bir qarashda ko'rinadi. Ikkilamchi havolalar
             («Doska», «Tarix», tahrirlash) kartaning o'ng yuqorisidagi
             menyuda - dizaynda ham o'sha yerda kichik tugma turadi. */
          <div className="grid grid-2">
            {projects.map((p) => (
              /* Kartaning istalgan yeriga bosilsa loyiha ochiladi - nomni
                 aniq nishonga olish shart emas. Ichidagi havola va
                 tugmalar o'z ishini qiladi (`stopPropagation`). */
              <div className="pcard" key={p.id} onClick={() => nav(`/loyiha/${p.id}`)}>
                <div className="pcard-top">
                  <span className="lang-dot" style={{ background: p.color }} />
                  <Link className="pcard-name" to={`/loyiha/${p.id}`}
                        onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                  {p.status !== "ACTIVE" && (
                    <span className="badge">{p.status_display}</span>
                  )}
                  <span className="spacer" />
                  <span onClick={(e) => e.stopPropagation()}>
                    <RowMenu>
                      <Link to={`/loyiha/${p.id}/doska`}>Doska</Link>
                      <Link to={`/loyiha/${p.id}/tarix`}>Tarix</Link>
                      {/* Boshqarish amallari - menejer va adminga. Serverda ham
                          shu tekshiriladi, bu yerda faqat ko'rinish yashiriladi. */}
                      {(p.manager?.id === user?.id || user?.is_platform_admin) && (
                        <Link to={`/loyiha/${p.id}/tahrir`}>Tahrirlash</Link>
                      )}
                      {(p.manager?.id === user?.id || user?.is_platform_admin) && (
                        <button type="button" className="danger"
                                onClick={() => void removeProject(p.id, p.name)}>
                          Ochirish
                        </button>
                      )}
                    </RowMenu>
                  </span>
                </div>

                <div className="pcard-sub">
                  {p.workspace_name} · <span className="mono">{p.key}</span>
                </div>

                <div className="pcard-prog">
                  <span className="muted">Jarayon</span>
                  <span className="spacer" />
                  <strong>{p.progress}%</strong>
                </div>
                <Progress value={p.progress} />

                <div className="pcard-foot">
                  <span className="pcard-metric">
                    <small>Ochiq vazifa</small>
                    <strong>{p.open_tasks} ta</strong>
                  </span>
                  <span className="pcard-metric">
                    <small>A'zolar</small>
                    <strong>{p.member_count} kishi</strong>
                  </span>
                  <span className="pcard-metric">
                    <small>Menda</small>
                    <strong>{p.my_tasks} ta</strong>
                  </span>
                  <span className="spacer" />
                  <Link className="btn btn-sm" to={`/loyiha/${p.id}`}
                        onClick={(e) => e.stopPropagation()}>Kirish</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
