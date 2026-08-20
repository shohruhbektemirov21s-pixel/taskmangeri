/**
 * Loyihaning ochiq ko'rinishi — kirmagan odam ham ko'radi.
 *
 * Bu yerda vazifalar matni, a'zolar ro'yxati, fayllar va tarix ko'rsatilmaydi —
 * ular jamoa ichidagi narsa. Faqat "bu qanday loyiha va menga joy bormi"
 * degan savolga javob beradigan ma'lumot chiqadi.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { PublicProject as PublicProjectData } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import PublicShell from "@/components/PublicShell";
import { Card, Empty, Loading, Progress, Stat, fmtDate } from "@/components/ui";
import { toProject, toProjectJoin, useEntityId } from "@/nav";
import { tx } from "@/i18n";

export default function PublicProject() {
  const id = useEntityId("project");
  const { user } = useAuth();
  const [project, setProject] = useState<PublicProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await api.get<PublicProjectData>(`/public/projects/${id}/`);
        if (alive) setProject(d);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof ApiError && err.status === 404
          ? tx("public_project.bunday_ochiq_loyiha_topilmadi_u")
          : tx("public_project.loyihani_ochib_bolmadi"));
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (error) {
    return (
      <PublicShell>
        <div className="lp-wrap" style={{ padding: "60px 24px" }}>
          <Empty icon="🔒" title={tx("public_project.korsatib_bolmadi")} text={error}>
            <Link className="btn" to="/qidiruv">{tx("public_project.boshqa_loyihalarni_korish")}</Link>
          </Empty>
        </div>
      </PublicShell>
    );
  }

  if (!project) {
    return <PublicShell><div className="lp-wrap" style={{ padding: 60 }}><Loading /></div></PublicShell>;
  }

  return (
    <PublicShell>
      <div className="lp-wrap" style={{ padding: "36px 24px 64px" }}>
        <div className="row wrap mb" style={{ gap: 10 }}>
          <Link className="muted" to="/qidiruv">{tx("public_project.ochiq_loyihalar")}</Link>
          <span className="muted">/</span>
          <span className="lang-dot" style={{ background: project.color }} />
          <h1 style={{ margin: 0 }}>{project.name}</h1>
          <span className="badge mono">{project.key}</span>
          <span className="badge">{project.status_display}</span>
        </div>

        <div className="split">
          <div>
            <Card title={tx("common.loyiha_haqida")}>
              <p className="pre-wrap" style={{ marginBottom: 0 }}>
                {project.description || tx("common.tavsif_kiritilmagan")}
              </p>
            </Card>

            <Card title={tx("public_project.bajarilgani")}>
              <Progress value={project.progress} />
              <div className="grid grid-3 mt">
                <Stat value={`${project.progress}%`} label={tx("common.bajarildi")} tone="ok" />
                <Stat value={project.open_tasks ?? 0} label={tx("common.ochiq_vazifa_2")} tone="accent" />
                <Stat value={project.done_tasks ?? 0} label={tx("public_project.yopilgan_vazifa")} tone="done" />
              </div>
            </Card>

            {!!project.team_composition?.length && (
              <Card title={tx("public_project.jamoa_tarkibi")} padded={false}>
                <div className="table-wrap"><table className="table">
                  <tbody>
                    {project.team_composition.map((t) => (
                      <tr key={t.value}>
                        <td>{t.label}</td>
                        <td className="right mono">{t.count} {tx("common.kishi")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </Card>
            )}
          </div>

          <div>
            <Card title={user ? tx("public_project.qoshilish") : tx("public_project.jamoaga_qoshilmoqchimisiz")}>
              {user ? (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    {tx("public_project.siz_tizimdasiz_loyihaga_sorov_yuborishingiz")}
                  </p>
                  <Link className="btn btn-primary btn-block" {...toProjectJoin(project.id)}>
                    {tx("public_project.sorov_yuborish")}
                  </Link>
                  <Link className="btn btn-block mt" {...toProject(project.id)}>
                    {tx("public_project.loyihani_ochish")}
                  </Link>
                </>
              ) : (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    {tx("public_project.royxatdan_oting_va_mutaxassisligingizni_tanl")}
                  </p>
                  <Link className="btn btn-primary btn-block" to="/royxatdan-otish">
                    {tx("common.royxatdan_otish")}
                  </Link>
                  <Link className="btn btn-block mt" to="/kirish">{tx("public_project.hisobga_kirish")}</Link>
                </>
              )}
            </Card>

            {!!project.needed_specialties.length && (
              <Card title={tx("public_project.qanday_mutaxassis_kerak")}>
                <div className="row wrap" style={{ gap: 7 }}>
                  {project.needed_specialties.map((s) => (
                    <span className="badge badge-info" key={s.value}>{s.label}</span>
                  ))}
                </div>
                {!!project.specialty_gaps?.length && (
                  <>
                    <div className="divider" />
                    <div className="muted mb" style={{ fontSize: 13 }}>
                      {tx("public_project.hozir_jamoada_yoq_bosh_orin")}
                    </div>
                    <div className="row wrap" style={{ gap: 7 }}>
                      {project.specialty_gaps.map((s) => (
                        <span className="badge badge-warn" key={s.value}>{s.label}</span>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            )}

            <Card title={tx("public_project.malumot")}>
              <ul className="list-plain" style={{ fontSize: 13 }}>
                {project.manager_name && (
                  <li><span className="muted">{tx("common.menejer")}</span> {project.manager_name}</li>
                )}
                <li><span className="muted">{tx("public_project.jamoa")}</span> {project.member_count} {tx("public_project.azo")}</li>
                <li><span className="muted">{tx("public_project.ochilgan")}</span> {fmtDate(project.created_at)}</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
