import { Link } from "react-router-dom";
import { useFetch } from "@/api/useFetch";
import type { DeveloperReport as Report } from "@/api/types";
import Timeline from "@/components/Timeline";
import { PageHead } from "@/components/Layout";
import {
  Avatar, Card, Empty, ErrorMsg, Loading, Priority, Stat, StatusBadge, fmtDate, timeAgo,
} from "@/components/ui";
import { toProject, toTask, useEntityId } from "@/nav";
import { tx } from "@/i18n";

export default function DeveloperReport() {
  // Loyiha va odam raqami manzilda emas, sahifa holatida - `src/nav`.
  const id = useEntityId("project");
  const userId = useEntityId("user");
  const { data: d, error } = useFetch<Report>(
    id && userId ? "/activity/developer-report/" : null, { project: id, user: userId });

  // Manzilda raqam saqlanmaydi - havolani qo'lda ochgan odam shu yerga
  // tushadi. Oq ekran emas, chiqish yo'li ko'rsatiladi.
  if (!id || !userId) {
    return (
      <div className="content">
        <Empty title={tx("developer_report.hisobot_tanlanmagan")}
               text={tx("developer_report.dasturchi_hisoboti_loyiha_jamoasidan_ochilad")}>
          <Link className="btn btn-primary" to="/loyihalar">{tx("common.loyihalarim")}</Link>
        </Empty>
      </div>
    );
  }

  if (error) return <div className="content"><ErrorMsg error={error} /></div>;
  if (!d) return <div className="content"><Loading /></div>;

  const m = d.membership;

  return (
    <>
      <PageHead
        title={
          <>
            <Link className="muted" {...toProject(id, "tarix")}>{tx("developer_report.tarix")}</Link>
            <span className="muted"> / </span>
            <strong>{d.developer.full_name}</strong>
          </>
        }
        actions={<Link className="btn btn-sm" {...toProject(id, "tarix")}>{tx("developer_report.loyiha_tarixi")}</Link>}
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
                {m && !m.is_active && <span className="badge badge-danger">{tx("developer_report.sobiq_azo")}</span>}
              </div>
              <small className="muted">
                {m?.joined_at && `Qoshilgan: ${fmtDate(m.joined_at)}`}
                {m?.left_at && ` · Chiqqan: ${fmtDate(m.left_at)}`}
              </small>
            </div>
          </div>
          {m?.handover_note && (
            <div className="card-body" style={{ borderTop: "1px solid var(--border)" }}>
              <strong>{tx("developer_report.topshiriq_eslatmasi")}</strong>
              <div className="tl-detail">{m.handover_note}</div>
            </div>
          )}
        </div>

        <div className="grid grid-4 mb">
          <Stat value={d.task_count} label={tx("developer_report.jami_vazifa")} tone="accent" />
          <Stat value={d.done_count} label={tx("common.bajarilgan")} tone="ok" />
          <Stat value={d.total_hours} label={tx("common.sarflangan_soat")} tone="warn" />
          <Stat value={d.review_map?.CHANGES_REQUESTED || 0} label={tx("developer_report.qaytarilgan")} tone="danger" />
        </div>

        <div className="split">
          <div>
            <Card title={tx("developer_report.ish_jurnali_nima_qilingan_va")}
                  badge={<span className="badge">{d.worklogs.length}</span>}>
              <ul className="list-plain">
                {d.worklogs.map((w) => (
                  <li key={w.id}>
                    <div className="row">
                      {w.task
                        ? <Link className="mono muted" {...toTask(w.task)}>{w.task_code}</Link>
                        : <span className="mono muted">{w.task_code}</span>}
                      <span style={{ fontSize: 13 }}>{w.task_title}</span>
                      <span className="spacer" />
                      <span className="badge">{w.hours} {tx("common.soat")}</span>
                      <small className="muted">{fmtDate(w.work_date)}</small>
                    </div>
                    <div className="pre-wrap" style={{ marginTop: 6 }}>{w.note}</div>
                  </li>
                ))}
                {!d.worklogs.length && <li className="muted">{tx("developer_report.ish_jurnali_yozuvi_yoq")}</li>}
              </ul>
            </Card>

            <Card title={tx("developer_report.tekshiruv_natijalari")}
                  badge={<span className="badge">{d.reviews.length}</span>}>
              <ul className="list-plain">
                {d.reviews.map((r) => (
                  <li key={r.id}>
                    <div className="row wrap">
                      <span className={`badge ${r.verdict === "APPROVED" ? "badge-ok" : "badge-warn"}`}>
                        {r.verdict_display}
                      </span>
                      {r.task
                        ? <Link className="mono" {...toTask(r.task)}>{r.task_code}</Link>
                        : <span className="mono">{r.task_code}</span>}
                      <span className="muted">{r.task_title}</span>
                      <span className="spacer" />
                      <small className="muted">{r.reviewer?.full_name} · {timeAgo(r.created_at)}</small>
                    </div>
                    {r.comment && <div className="tl-detail">{r.comment}</div>}
                  </li>
                ))}
                {!d.reviews.length && <li className="muted">{tx("developer_report.tekshiruv_yoq")}</li>}
              </ul>
            </Card>

            <Card title={tx("developer_report.harakatlar_tarixi")}>
              <Timeline items={d.timeline} showProject={false} />
            </Card>
          </div>

          <div>
            <Card title={tx("developer_report.bajarilgan_vazifalar")} padded={false}>
              <div className="table-wrap"><table className="table">
                <tbody>
                  {d.done_tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="mono muted nowrap">{t.code}</td>
                      <td><Link {...toTask(t.id)}>{t.title}</Link></td>
                      <td className="nowrap muted">{fmtDate(t.completed_at)}</td>
                    </tr>
                  ))}
                  {!d.done_tasks.length && (
                    <tr><td><Empty title={tx("developer_report.hali_bajarilgan_vazifa_yoq")} /></td></tr>
                  )}
                </tbody>
              </table></div>
            </Card>

            <Card title={tx("developer_report.ochiq_vazifalar")} padded={false}>
              <div className="table-wrap"><table className="table">
                <tbody>
                  {d.open_tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="mono muted nowrap">{t.code}</td>
                      <td><Link {...toTask(t.id)}>{t.title}</Link></td>
                      <td><StatusBadge task={t} /></td>
                      <td><Priority task={t} /></td>
                    </tr>
                  ))}
                  {!d.open_tasks.length && (
                    <tr><td className="muted center">{tx("developer_report.ochiq_vazifa_yoq")}</td></tr>
                  )}
                </tbody>
              </table></div>
            </Card>

            <Card title={tx("developer_report.holatlar_boyicha")}>
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
