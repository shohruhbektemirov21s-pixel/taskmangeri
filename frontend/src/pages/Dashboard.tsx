import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { DashboardData } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { useLive } from "@/realtime/RealtimeContext";
import TeamBuilder from "@/components/TeamBuilder";
import Timeline from "@/components/Timeline";
import {
  AvatarStack, Card, Empty, Loading, Priority, Progress,
  Stat, StatusBadge, fmtDate, fmtDateTime, timeAgo,
} from "@/components/ui";

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState<DashboardData | null>(null);

  const reload = useCallback(() => {
    void api.get<DashboardData>("/dashboard/").then(setD).catch(() => setD(null));
  }, []);

  useEffect(() => { reload(); }, [reload]);
  // Jonli: vazifa yoki loyiha o'zgarsa panel o'zini yangilaydi.
  useLive((d) => {
    if (d.event === "task.update" || d.event === "project.update") reload();
  });

  if (!d) return <div className="content"><Loading text="Panel yuklanmoqda..." /></div>;

  const t = d.next_task;

  return (
    <div className="content">
      <div className="row wrap mb">
        <div>
          <h1 style={{ margin: 0 }}>Salom, {user?.full_name.split(" ")[0]}</h1>
          <div className="row" style={{ marginTop: 4 }}>
            <span className="muted">{user?.seniority_display}</span>
          </div>
        </div>
        <span className="spacer" />
        <Link className="btn" to="/mening-ishim">Mening ishim</Link>
        {user?.can_create_project && (
          <Link className="btn btn-primary" to="/loyiha/yangi">Yangi loyiha</Link>
        )}
      </div>

      <div className="grid grid-4 mb">
        <Stat value={d.stats.open} label="Ochiq vazifa" tone="accent" />
        <Stat value={d.stats.review} label="Tekshiruvda" tone="done" />
        <Stat value={d.stats.returned} label="Tuzatish kerak" tone="danger" />
        <Stat value={d.stats.done_week} label="Shu haftada bajarildi" tone="ok" />
      </div>

      {(d.stats.returned > 0 || d.stats.overdue > 0) && (
        <div className="callout danger mb">
          <strong>Diqqat:</strong>{" "}
          {d.stats.returned > 0 && `${d.stats.returned} ta vazifa tuzatishga qaytarilgan. `}
          {d.stats.overdue > 0 && `${d.stats.overdue} ta vazifa muddati otgan.`}
        </div>
      )}

      <div className="split">
        <div>
          {t ? (
            <div className="card">
              <div className="card-head">
                <h3>Keyingi vazifa</h3>
                <span className="badge badge-info">eng muhimi</span>
                <span className="spacer" />
                <Link className="mono muted" to={`/loyiha/${t.project}`}>{t.project_name}</Link>
              </div>
              <div className="card-body">
                <div className="row wrap mb">
                  <span className="mono muted">{t.code}</span>
                  <StatusBadge task={t} />
                  <Priority task={t} />
                  {t.specialty_label && <span className="badge badge-brand">{t.specialty_label}</span>}
                  {t.due_date && (
                    <span className={`badge ${t.is_overdue ? "badge-danger" : ""}`}>
                      Muddat: {fmtDateTime(t.due_date)}
                    </span>
                  )}
                </div>
                <h2 style={{ margin: "0 0 10px" }}>
                  <Link to={`/vazifa/${t.id}`}>{t.title}</Link>
                </h2>
                {t.description && <p className="muted pre-wrap">{t.description.slice(0, 300)}</p>}
                {t.acceptance_criteria && (
                  <div className="callout ok">
                    <strong>Tayyorlik mezoni</strong>
                    <div className="pre-wrap" style={{ marginTop: 6 }}>{t.acceptance_criteria}</div>
                  </div>
                )}
                <div className="form-actions">
                  <Link className="btn btn-primary" to={`/vazifa/${t.id}`}>Ishni boshlash</Link>
                  <Link className="btn" to={`/loyiha/${t.project}/kirish`}>Loyiha konteksti</Link>
                </div>
              </div>
            </div>
          ) : (
            <Card>
              <Empty icon="☐" title="Sizda ochiq vazifa yoq"
                     text="Loyihaga qoshiling yoki menejerdan vazifa soranng.">
                <Link className="btn btn-primary" to="/qoshilish">Loyihaga qoshilish</Link>
              </Empty>
            </Card>
          )}

          {d.focus_queue.length > 1 && (
            <Card title="Navbatdagi ishlar" padded={false}
                  action={<Link className="btn btn-sm" to="/mening-ishim">Hammasi</Link>}>
              <div className="table-wrap"><table className="table">
                <tbody>
                  {d.focus_queue.map((x) => (
                    <tr key={x.id}>
                      <td className="nowrap mono muted">{x.code}</td>
                      <td>
                        <Link to={`/vazifa/${x.id}`}>{x.title}</Link>
                        <br /><small className="muted">{x.project_name}</small>
                      </td>
                      <td><StatusBadge task={x} /></td>
                      <td className="right"><Priority task={x} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </Card>
          )}

          {d.review_queue.length > 0 && (
            <Card title="Tekshirishingiz kutilmoqda" padded={false}
                  badge={<span className="badge badge-danger">{d.review_queue.length}</span>}
                  action={<Link className="btn btn-sm" to="/tekshiruv">Navbatga otish</Link>}>
              <div className="table-wrap"><table className="table">
                <tbody>
                  {d.review_queue.map((x) => (
                    <tr key={x.id}>
                      <td className="nowrap mono muted">{x.code}</td>
                      <td>
                        <Link to={`/vazifa/${x.id}`}>{x.title}</Link>
                        <br /><small className="muted">{x.project_name} · {timeAgo(x.submitted_at)}</small>
                      </td>
                      <td className="right"><AvatarStack users={x.assignees} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </Card>
          )}

          {/* Menejer jamoani nol holatdan shu yerda yig'adi: qidirib taklif
              qilish, so'rovni qabul qilish, a'zoni chiqarish. */}
          {d.managed_projects.length > 0 && (
            <div className="mb">
              <TeamBuilder projects={d.managed_projects} onChange={reload} />
            </div>
          )}

          <Card title="Songgi harakatlar"
                action={<Link className="btn btn-sm" to="/tarix">Toliq tarix</Link>}>
            <Timeline items={d.feed} />
          </Card>
        </div>

        <div>
          <Card title="Loyihalarim" padded={false}
                action={<Link className="btn btn-sm" to="/qoshilish">Qoshilish</Link>}>
            <div className="card-list">
              {d.my_projects.map((p) => (
                <div className="repo-item" key={p.id}>
                  <h3>
                    <span className="lang-dot" style={{ background: p.color }} />{" "}
                    <Link to={`/loyiha/${p.id}`}>{p.name}</Link>
                  </h3>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {p.workspace_name} · <span className="mono">{p.key}</span>
                  </div>
                  <div style={{ marginTop: 8 }}><Progress value={p.progress} /></div>
                  <div className="repo-meta">
                    <span>{p.open_tasks} ochiq</span>
                    <span>{p.member_count} azo</span>
                    <span>menda: {p.my_tasks}</span>
                  </div>
                </div>
              ))}
              {!d.my_projects.length && (
                <Empty title="Loyihada emassiz" text="Ochiq loyihaga qoshiling.">
                  <Link className="btn btn-primary btn-sm" to="/qoshilish">Loyiha topish</Link>
                </Empty>
              )}
            </div>
          </Card>

          {d.managed_projects.length > 0 && (
            <Card title="Boshqarayotganlarim" padded={false}>
              <div className="card-list">
                {d.managed_projects.map((p) => (
                  <div className="card-body tight row" key={p.id}>
                    <span className="lang-dot" style={{ background: p.color }} />
                    <Link to={`/loyiha/${p.id}`}>{p.name}</Link>
                    <span className="spacer" />
                    <Link className="btn btn-sm" to={`/loyiha/${p.id}/koplab-vazifa`}>Task berish</Link>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(d.blocked.length > 0 || d.waiting_review.length > 0) && (
            <Card title="Kutilayotganlar">
              <ul className="list-plain">
                {d.waiting_review.map((x) => (
                  <li key={x.id}>
                    <StatusBadge task={x} /> <Link to={`/vazifa/${x.id}`}>{x.code}</Link>{" "}
                    {x.title.slice(0, 40)}
                  </li>
                ))}
                {d.blocked.map((x) => (
                  <li key={x.id}>
                    <StatusBadge task={x} /> <Link to={`/vazifa/${x.id}`}>{x.code}</Link>{" "}
                    {x.title.slice(0, 40)}
                    {x.blocked_reason && <><br /><small className="muted">{x.blocked_reason}</small></>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
