/**
 * Loyihaning ochiq ko'rinishi — kirmagan odam ham ko'radi.
 *
 * Bu yerda vazifalar matni, a'zolar ro'yxati, fayllar va tarix ko'rsatilmaydi —
 * ular jamoa ichidagi narsa. Faqat "bu qanday loyiha va menga joy bormi"
 * degan savolga javob beradigan ma'lumot chiqadi.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { PublicProject as PublicProjectData } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import PublicShell from "@/components/PublicShell";
import { Card, Empty, Loading, Progress, Stat, fmtDate } from "@/components/ui";

export default function PublicProject() {
  const { id } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState<PublicProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setProject(await api.get<PublicProjectData>(`/public/projects/${id}/`));
      } catch (err) {
        setError(err instanceof ApiError && err.status === 404
          ? "Bunday ochiq loyiha topilmadi — u yopiq bo'lishi mumkin."
          : "Loyihani ochib bo'lmadi");
      }
    })();
  }, [id]);

  if (error) {
    return (
      <PublicShell>
        <div className="lp-wrap" style={{ padding: "60px 24px" }}>
          <Empty icon="🔒" title="Ko'rsatib bo'lmadi" text={error}>
            <Link className="btn" to="/qidiruv">Boshqa loyihalarni ko'rish</Link>
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
          <Link className="muted" to="/qidiruv">ochiq loyihalar</Link>
          <span className="muted">/</span>
          <span className="lang-dot" style={{ background: project.color }} />
          <h1 style={{ margin: 0 }}>{project.name}</h1>
          <span className="badge mono">{project.key}</span>
          <span className="badge">{project.status_display}</span>
        </div>

        <div className="split">
          <div>
            <Card title="Loyiha haqida">
              <p className="pre-wrap" style={{ marginBottom: 0 }}>
                {project.description || "Tavsif kiritilmagan."}
              </p>
            </Card>

            <Card title="Bajarilgani">
              <Progress value={project.progress} />
              <div className="grid grid-3 mt">
                <Stat value={`${project.progress}%`} label="Bajarildi" tone="ok" />
                <Stat value={project.open_tasks ?? 0} label="Ochiq vazifa" tone="accent" />
                <Stat value={project.done_tasks ?? 0} label="Yopilgan vazifa" tone="done" />
              </div>
            </Card>

            {!!project.team_composition?.length && (
              <Card title="Jamoa tarkibi" padded={false}>
                <table className="table">
                  <tbody>
                    {project.team_composition.map((t) => (
                      <tr key={t.value}>
                        <td>{t.label}</td>
                        <td className="right mono">{t.count} kishi</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>

          <div>
            <Card title={user ? "Qo'shilish" : "Jamoaga qo'shilmoqchimisiz?"}>
              {user ? (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Siz tizimdasiz — loyihaga so'rov yuborishingiz mumkin.
                  </p>
                  <Link className="btn btn-primary btn-block" to={`/loyiha/${project.id}/qoshilish`}>
                    So'rov yuborish
                  </Link>
                  <Link className="btn btn-block mt" to={`/loyiha/${project.id}`}>
                    Loyihani ochish
                  </Link>
                </>
              ) : (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Ro'yxatdan o'ting va mutaxassisligingizni tanlang — sizga mos
                    loyihalar birinchi ko'rsatiladi.
                  </p>
                  <Link className="btn btn-primary btn-block" to="/royxatdan-otish">
                    Ro'yxatdan o'tish
                  </Link>
                  <Link className="btn btn-block mt" to="/kirish">Hisobga kirish</Link>
                </>
              )}
            </Card>

            {!!project.needed_specialties.length && (
              <Card title="Qanday mutaxassis kerak">
                <div className="row wrap" style={{ gap: 7 }}>
                  {project.needed_specialties.map((s) => (
                    <span className="badge badge-info" key={s.value}>{s.label}</span>
                  ))}
                </div>
                {!!project.specialty_gaps?.length && (
                  <>
                    <div className="divider" />
                    <div className="muted mb" style={{ fontSize: 13 }}>
                      Hozir jamoada yo'q — bo'sh o'rin:
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

            <Card title="Ma'lumot">
              <ul className="list-plain" style={{ fontSize: 13 }}>
                {project.manager_name && (
                  <li><span className="muted">Menejer:</span> {project.manager_name}</li>
                )}
                <li><span className="muted">Jamoa:</span> {project.member_count} a'zo</li>
                <li><span className="muted">Ochilgan:</span> {fmtDate(project.created_at)}</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
