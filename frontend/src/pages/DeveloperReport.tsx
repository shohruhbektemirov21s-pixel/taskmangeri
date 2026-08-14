import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { DeveloperReport as Report } from "@/api/types";
import Timeline from "@/components/Timeline";
import { PageHead } from "@/components/Layout";
import {
  Avatar, Card, Empty, Loading, Priority, Stat, StatusBadge, fmtDate, timeAgo,
} from "@/components/ui";

export default function DeveloperReport() {
  const { id, userId } = useParams();
  const [d, setD] = useState<Report | null>(null);

  useEffect(() => {
    void api.get<Report>("/activity/developer-report/", { project: id, user: userId }).then(setD);
  }, [id, userId]);

  if (!d) return <div className="content"><Loading /></div>;

  const m = d.membership;

  return (
    <>
      <PageHead
        title={
          <>
            <Link className="muted" to={`/loyiha/${id}/tarix`}>tarix</Link>
            <span className="muted"> / </span>
            <strong>{d.developer.full_name}</strong>
          </>
        }
        actions={<Link className="btn btn-sm" to={`/loyiha/${id}/tarix`}>Loyiha tarixi</Link>}
      />

      <div className="content">
        <div className="card mb">
          <div className="card-body row wrap">
            <Avatar user={d.developer} size="lg" />
            <div>
              <h2 style={{ margin: 0 }}>{d.developer.full_name}</h2>
              <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                <span className="badge" style={{ color: d.developer.specialty_color }}>
                  {d.developer.specialty_display}
                </span>
                <span className="badge">{d.developer.seniority_display}</span>
                {m && <span className="badge">{m.role_display}</span>}
                {m && !m.is_active && <span className="badge badge-danger">sobiq aʼzo</span>}
              </div>
              <small className="muted">
                {m?.joined_at && `Qoshilgan: ${fmtDate(m.joined_at)}`}
                {m?.left_at && ` · Chiqqan: ${fmtDate(m.left_at)}`}
              </small>
            </div>
          </div>
          {m?.handover_note && (
            <div className="card-body" style={{ borderTop: "1px solid var(--border)" }}>
              <strong>Topshiriq eslatmasi</strong>
              <div className="tl-detail">{m.handover_note}</div>
            </div>
          )}
        </div>

        <div className="grid grid-4 mb">
          <Stat value={d.task_count} label="Jami vazifa" tone="accent" />
          <Stat value={d.done_count} label="Bajarilgan" tone="ok" />
          <Stat value={d.total_hours} label="Sarflangan soat" tone="warn" />
          <Stat value={d.review_map?.CHANGES_REQUESTED || 0} label="Qaytarilgan" tone="danger" />
        </div>

        <div className="split">
          <div>
            <Card title="Ish jurnali — nima qilingan va nega"
                  badge={<span className="badge">{d.worklogs.length}</span>}>
              <ul className="list-plain">
                {d.worklogs.map((w) => (
                  <li key={w.id}>
                    <div className="row">
                      <Link className="mono muted" to={`/vazifa/${w.task}`}>{w.task_code}</Link>
                      <span style={{ fontSize: 13 }}>{w.task_title}</span>
                      <span className="spacer" />
                      <span className="badge">{w.hours} soat</span>
                      <small className="muted">{fmtDate(w.work_date)}</small>
                    </div>
                    <div className="pre-wrap" style={{ marginTop: 6 }}>{w.note}</div>
                  </li>
                ))}
                {!d.worklogs.length && <li className="muted">Ish jurnali yozuvi yoq.</li>}
              </ul>
            </Card>

            <Card title="Tekshiruv natijalari"
                  badge={<span className="badge">{d.reviews.length}</span>}>
              <ul className="list-plain">
                {d.reviews.map((r) => (
                  <li key={r.id}>
                    <div className="row wrap">
                      <span className={`badge ${r.verdict === "APPROVED" ? "badge-ok" : "badge-warn"}`}>
                        {r.verdict_display}
                      </span>
                      <Link className="mono" to={`/vazifa/${r.task}`}>{r.task_code}</Link>
                      <span className="muted">{r.task_title}</span>
                      <span className="spacer" />
                      <small className="muted">{r.reviewer?.full_name} · {timeAgo(r.created_at)}</small>
                    </div>
                    {r.comment && <div className="tl-detail">{r.comment}</div>}
                  </li>
                ))}
                {!d.reviews.length && <li className="muted">Tekshiruv yoq.</li>}
              </ul>
            </Card>

            <Card title="Harakatlar tarixi">
              <Timeline items={d.timeline} showProject={false} />
            </Card>
          </div>

          <div>
            <Card title="Bajarilgan vazifalar" padded={false}>
              <div className="table-wrap"><table className="table">
                <tbody>
                  {d.done_tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="mono muted nowrap">{t.code}</td>
                      <td><Link to={`/vazifa/${t.id}`}>{t.title}</Link></td>
                      <td className="nowrap muted">{fmtDate(t.completed_at)}</td>
                    </tr>
                  ))}
                  {!d.done_tasks.length && (
                    <tr><td><Empty title="Hali bajarilgan vazifa yoq" /></td></tr>
                  )}
                </tbody>
              </table></div>
            </Card>

            <Card title="Ochiq vazifalar" padded={false}>
              <div className="table-wrap"><table className="table">
                <tbody>
                  {d.open_tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="mono muted nowrap">{t.code}</td>
                      <td><Link to={`/vazifa/${t.id}`}>{t.title}</Link></td>
                      <td><StatusBadge task={t} /></td>
                      <td><Priority task={t} /></td>
                    </tr>
                  ))}
                  {!d.open_tasks.length && (
                    <tr><td className="muted center">Ochiq vazifa yoq</td></tr>
                  )}
                </tbody>
              </table></div>
            </Card>

            <Card title="Holatlar boyicha">
              <ul className="list-plain" style={{ fontSize: 13 }}>
                {Object.entries(d.by_status).map(([k, v]) => (
                  <li className="row" key={k}>
                    <span className={`badge st-${k}`}>{k}</span>
                    <span className="spacer" />
                    <strong>{v}</strong>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
