import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { OnboardingData, Project } from "@/api/types";
import Timeline from "@/components/Timeline";
import { Avatar, Card, Loading, Priority, Progress, StatusBadge, fmtDate, timeAgo } from "@/components/ui";

const BRIEF_SECTIONS: [keyof NonNullable<OnboardingData["brief"]>, string][] = [
  ["goal", "Loyiha maqsadi"],
  ["tech_stack", "Texnologiyalar"],
  ["architecture", "Arxitektura"],
  ["setup_steps", "Ishga tushirish"],
  ["conventions", "Kelishuvlar"],
  ["definition_of_done", "Tayyorlik mezoni"],
  ["pitfalls", "Ehtiyot boling"],
  ["contacts", "Kim nima boyicha javob beradi"],
];

export default function Onboarding({ project }: { project: Project }) {
  const [d, setD] = useState<OnboardingData | null>(null);

  useEffect(() => {
    void api.get<OnboardingData>("/activity/onboarding/", { project: project.id }).then(setD);
  }, [project.id]);

  if (!d) return <Loading text="Kontekst yigilmoqda..." />;

  return (
    <>
      <div className="callout mb">
        <strong>Bu sahifa nima uchun:</strong> yangi kelgan dasturchi (yoki agent) loyihani
        10 daqiqada tushunishi uchun. Avvalgi dasturchilar nima qilgani, qanday qaror qabul
        qilingani va qayerda xato qilingani shu yerda jamlangan.
      </div>

      <div className="split">
        <div>
          <Card title="1. Loyiha nima qiladi">
            <p className="pre-wrap">{d.project.description || "Tavsif kiritilmagan."}</p>
            <div className="row mb">
              <div style={{ flex: 1, maxWidth: 300 }}><Progress value={d.project.progress} /></div>
              <span className="muted">{d.project.progress}% bajarildi</span>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {d.project.repo_url && (
                <a className="btn btn-sm" href={d.project.repo_url} target="_blank" rel="noreferrer">
                  Repozitoriy
                </a>
              )}
              {d.project.docs_url && (
                <a className="btn btn-sm" href={d.project.docs_url} target="_blank" rel="noreferrer">
                  Hujjatlar
                </a>
              )}
              {d.project.manager && (
                <span className="chip">Menejer: {d.project.manager.full_name}</span>
              )}
            </div>
          </Card>

          <Card title="2. Loyiha brifi"
                badge={d.brief && <span className="badge">{d.brief.filled_ratio}% toldirilgan</span>}
                action={project.access.can_manage &&
                  <Link className="btn btn-sm" to={`/loyiha/${project.id}/brif`}>Tahrirlash</Link>}>
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
                  <p className="muted">Brif hali toldirilmagan — menejerdan toldirishni soranng.</p>
                )}
              </div>
            ) : <p className="muted">Brif yaratilmagan.</p>}
          </Card>

          <Card title="3. Muhim qarorlar va eslatmalar"
                badge={<span className="badge">{d.key_notes.length}</span>}>
            <p className="muted" style={{ fontSize: 13 }}>
              Dasturchilarning ish jurnallaridan: nima qilingan va nega shunday qilingan.
            </p>
            <ul className="list-plain">
              {d.key_notes.map((w) => (
                <li key={w.id}>
                  <div className="row">
                    <Avatar user={w.user} size="sm" />
                    <strong style={{ fontSize: 13 }}>{w.user.full_name}</strong>
                    <Link className="mono muted" to={`/vazifa/${w.task}`}>{w.task_code}</Link>
                    <span className="spacer" />
                    <small className="muted">{w.hours} soat · {fmtDate(w.work_date)}</small>
                  </div>
                  <div className="pre-wrap" style={{ marginTop: 6 }}>{w.note}</div>
                </li>
              ))}
              {!d.key_notes.length && <li className="muted">Hozircha ish jurnali yoq.</li>}
            </ul>
          </Card>

          <Card title="4. Takrorlanmasligi kerak bolgan xatolar"
                badge={<span className="badge badge-danger">{d.lessons.length}</span>}>
            <p className="muted" style={{ fontSize: 13 }}>
              Tekshiruvda qaytarilgan ishlar — shu xatolarni takrorlamang.
            </p>
            <ul className="list-plain">
              {d.lessons.map((r) => (
                <li key={r.id}>
                  <div className="row">
                    <span className="badge badge-warn">{r.verdict_display}</span>
                    <Link className="mono" to={`/vazifa/${r.task}`}>{r.task_code}</Link>
                    <span className="muted">{r.task_title}</span>
                    <span className="spacer" />
                    <small className="muted">{r.reviewer?.full_name} · {timeAgo(r.created_at)}</small>
                  </div>
                  <div className="tl-detail">{r.comment}</div>
                </li>
              ))}
              {!d.lessons.length && <li className="muted">Hali qaytarilgan ish yoq.</li>}
            </ul>
          </Card>

          <Card title="5. Loyiha bosqichlari">
            <Timeline items={d.milestones} showProject={false} />
          </Card>
        </div>

        <div>
          <Card title="Kim nima qilgan" padded={false}>
            <div className="card-list">
              {d.contributions.map((c) => (
                <Link key={c.member.id} className="card-body tight"
                      to={`/loyiha/${project.id}/dasturchi/${c.member.user.id}`}
                      style={{ color: "inherit", textDecoration: "none", display: "block" }}>
                  <div className="row">
                    <Avatar user={c.member.user} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: 13 }}>{c.member.user.full_name}</strong>
                      <br />
                      <small className="muted">
                        {c.member.user.specialty_display} · {c.member.role_display}
                        {!c.member.is_active && " · sobiq"}
                      </small>
                    </div>
                  </div>
                  <div className="row wrap" style={{ marginTop: 6, gap: 6 }}>
                    <span className="badge badge-ok">{c.done} bajarilgan</span>
                    <span className="badge badge-info">{c.open} ochiq</span>
                    <span className="badge">{c.hours} soat</span>
                  </div>
                  {c.member.handover_note && (
                    <div className="tl-detail" style={{ marginTop: 8 }}>
                      <strong>Eslatma:</strong> {c.member.handover_note}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </Card>

          <Card title="Hozir ochiq turgan ishlar" padded={false}>
            <table className="table">
              <tbody>
                {d.open_now.map((t) => (
                  <tr key={t.id}>
                    <td className="mono muted nowrap">{t.code}</td>
                    <td><Link to={`/vazifa/${t.id}`}>{t.title}</Link></td>
                    <td><Priority task={t} /></td>
                  </tr>
                ))}
                {!d.open_now.length && (
                  <tr><td className="muted center">Ochiq vazifa yoq</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card title="Songgi bajarilganlar" padded={false}>
            <table className="table">
              <tbody>
                {d.recent_done.map((t) => (
                  <tr key={t.id}>
                    <td className="mono muted nowrap">{t.code}</td>
                    <td><Link to={`/vazifa/${t.id}`}>{t.title}</Link></td>
                    <td><StatusBadge task={t} /></td>
                  </tr>
                ))}
                {!d.recent_done.length && (
                  <tr><td className="muted center">Hali bajarilgan vazifa yoq</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}
