import { Link } from "react-router-dom";
import { useFetch } from "@/api/useFetch";
import type { OnboardingData, Project } from "@/api/types";
import Timeline from "@/components/Timeline";
import { Avatar, Card, ErrorMsg, Loading, Priority, Progress, StatusBadge, fmtDate, timeAgo } from "@/components/ui";
import { toDeveloper, toProject, toTask } from "@/nav";
import { tx } from "@/i18n";

const BRIEF_SECTIONS: [keyof NonNullable<OnboardingData["brief"]>, string][] = [
  ["goal", tx("project_onboarding.loyiha_maqsadi")],
  ["tech_stack", tx("project_onboarding.texnologiyalar")],
  ["architecture", tx("project_onboarding.arxitektura")],
  ["pitfalls", tx("project_onboarding.ehtiyot_boling")],
  ["contacts", tx("project_onboarding.kim_nima_boyicha_javob_beradi")],
];

export default function Onboarding({ project }: { project: Project }) {
  const { data: d, error } = useFetch<OnboardingData>(
    "/activity/onboarding/", { project: project.id });

  if (error) return <ErrorMsg error={error} />;
  if (!d) return <Loading text={tx("project_onboarding.kontekst_yigilmoqda")} />;

  return (
    <>
      <div className="split">
        <div>
          <Card title={tx("project_onboarding.1_loyiha_nima_qiladi")}>
            <p className="pre-wrap">{d.project.description || tx("common.tavsif_kiritilmagan")}</p>
            <div className="row mb">
              <div style={{ flex: 1, maxWidth: 300 }}><Progress value={d.project.progress} /></div>
              <span className="muted">{d.project.progress}{tx("project_onboarding.bajarildi")}</span>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {d.project.repo_url && (
                <a className="btn btn-sm" href={d.project.repo_url} target="_blank" rel="noreferrer">
                  {tx("project_onboarding.repozitoriy")}
                </a>
              )}
              {d.project.docs_url && (
                <a className="btn btn-sm" href={d.project.docs_url} target="_blank" rel="noreferrer">
                  {tx("common.hujjatlar")}
                </a>
              )}
              {d.project.manager && (
                <span className="chip">{tx("common.menejer")} {d.project.manager.full_name}</span>
              )}
            </div>
          </Card>

          <Card title={tx("project_onboarding.2_loyiha_arxitekturasi")}
                badge={d.brief && <span className="badge">{d.brief.filled_ratio}{tx("project_onboarding.toldirilgan")}</span>}
                action={project.access.can_manage &&
                  <Link className="btn btn-sm" {...toProject(project.id, "brif")}>{tx("common.tahrirlash")}</Link>}>
            {d.brief ? (
              <div className="stack">
                {BRIEF_SECTIONS.map(([key, label]) => {
                  const value = d.brief?.[key];
                  if (!value || typeof value !== "string" || !value.trim()) return null;
                  return (
                    <div key={String(key)}>
                      <strong style={{ fontSize: 13 }}>{label}</strong>
                      <div className="tl-detail">{value}</div>
                    </div>
                  );
                })}
                {d.brief.filled_ratio === 0 && (
                  <p className="muted">{tx("project_onboarding.arxitektura_toldirilmagan")}</p>
                )}
              </div>
            ) : <p className="muted">{tx("project_onboarding.arxitektura_yozilmagan")}</p>}
          </Card>

          <Card title={tx("project_onboarding.3_muhim_qarorlar_va_eslatmalar")}
                badge={<span className="badge">{d.key_notes.length}</span>}>
            <ul className="list-plain">
              {d.key_notes.map((w) => (
                <li key={w.id}>
                  <div className="row">
                    <Avatar user={w.user} size="sm" />
                    <strong style={{ fontSize: 13 }}>{w.user.full_name}</strong>
                    {w.task
                      ? <Link className="mono muted" {...toTask(w.task)}>{w.task_code}</Link>
                      : <span className="mono muted">{w.task_code}</span>}
                    <span className="spacer" />
                    <small className="muted">{w.hours} {tx("project_onboarding.soat")} {fmtDate(w.work_date)}</small>
                  </div>
                  <div className="pre-wrap" style={{ marginTop: 6 }}>{w.note}</div>
                </li>
              ))}
              {!d.key_notes.length && <li className="muted">{tx("project_onboarding.hozircha_ish_jurnali_yoq")}</li>}
            </ul>
          </Card>

          <Card title={tx("project_onboarding.4_takrorlanmasligi_kerak_bolgan_xatolar")}
                badge={<span className="badge badge-danger">{d.lessons.length}</span>}>
            <ul className="list-plain">
              {d.lessons.map((r) => (
                <li key={r.id}>
                  <div className="row">
                    <span className="badge badge-warn">{r.verdict_display}</span>
                    {r.task
                      ? <Link className="mono" {...toTask(r.task)}>{r.task_code}</Link>
                      : <span className="mono">{r.task_code}</span>}
                    <span className="muted">{r.task_title}</span>
                    <span className="spacer" />
                    <small className="muted">{r.reviewer?.full_name} · {timeAgo(r.created_at)}</small>
                  </div>
                  <div className="tl-detail">{r.comment}</div>
                </li>
              ))}
              {!d.lessons.length && <li className="muted">{tx("project_onboarding.hali_qaytarilgan_ish_yoq")}</li>}
            </ul>
          </Card>

          <Card title={tx("project_onboarding.5_loyiha_bosqichlari")}>
            <Timeline items={d.milestones} showProject={false} />
          </Card>
        </div>

        <div>
          <Card title={tx("project_onboarding.kim_nima_qilgan")} padded={false}>
            <div className="card-list">
              {d.contributions.map((c) => (
                <Link key={c.member.id} className="card-body tight"
                      {...toDeveloper(project.id, c.member.user.id)}
                      style={{ color: "inherit", textDecoration: "none", display: "block" }}>
                  <div className="row">
                    <Avatar user={c.member.user} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: 13 }}>{c.member.user.full_name}</strong>
                      <br />
                      <small className="muted">
                        {c.member.user.specialty_display} · {c.member.role_display}
                        {!c.member.is_active && tx("project_onboarding.sobiq")}
                      </small>
                    </div>
                  </div>
                  <div className="row wrap" style={{ marginTop: 6, gap: 6 }}>
                    <span className="badge badge-ok">{c.done} {tx("common.bajarilgan_2")}</span>
                    <span className="badge badge-info">{c.open} {tx("common.ochiq")}</span>
                    <span className="badge">{c.hours} {tx("common.soat")}</span>
                  </div>
                  {c.member.handover_note && (
                    <div className="tl-detail" style={{ marginTop: 8 }}>
                      <strong>{tx("project_onboarding.eslatma")}</strong> {c.member.handover_note}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </Card>

          <Card title={tx("project_onboarding.hozir_ochiq_turgan_ishlar")} padded={false}>
            <div className="table-wrap"><table className="table">
              <tbody>
                {d.open_now.map((t) => (
                  <tr key={t.id}>
                    <td className="mono muted nowrap">{t.code}</td>
                    <td><Link {...toTask(t.id)}>{t.title}</Link></td>
                    <td><Priority task={t} /></td>
                  </tr>
                ))}
                {!d.open_now.length && (
                  <tr><td className="muted center">{tx("project_onboarding.ochiq_vazifa_yoq")}</td></tr>
                )}
              </tbody>
            </table></div>
          </Card>

          <Card title={tx("project_onboarding.songgi_bajarilganlar")} padded={false}>
            <div className="table-wrap"><table className="table">
              <tbody>
                {d.recent_done.map((t) => (
                  <tr key={t.id}>
                    <td className="mono muted nowrap">{t.code}</td>
                    <td><Link {...toTask(t.id)}>{t.title}</Link></td>
                    <td><StatusBadge task={t} /></td>
                  </tr>
                ))}
                {!d.recent_done.length && (
                  <tr><td className="muted center">{tx("project_onboarding.hali_bajarilgan_vazifa_yoq")}</td></tr>
                )}
              </tbody>
            </table></div>
          </Card>
        </div>
      </div>
    </>
  );
}
