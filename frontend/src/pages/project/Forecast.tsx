/**
 * Muddatlar — kim qaysi vazifani qachon tugatadi.
 *
 * Mutaxassislik kesimi olib tashlandi: u yig'indi ko'rsatkich edi va
 * "kim qachon tugatadi" degan savolga javob bermasdi. Endi har bir odam
 * o'z ismi bilan turadi, ostida esa vazifalari — har biri o'z sanasi bilan.
 *
 * Sahifada faqat bazadagi haqiqiy ma'lumot: kiritilgan boshlanish va tugash
 * sanalari, ochiq/bajarilgan vazifalar va kechikkanlar. Avval bu yerda
 * o'ylab topilgan soatlardan chiqarilgan "taxminan tugaydi" sanasi turardi -
 * odam kiritmagan sana ekranda turishi chalkashlikdan boshqa narsa emas.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Forecast, Project } from "@/api/types";
import { Avatar, Card, Empty, ErrorMsg, Loading, Stat, fmtDate } from "@/components/ui";
import { toDeveloper, toProject, toTask, useGo } from "@/nav";
import { tx } from "@/i18n";

export default function ForecastTab({ project }: { project: Project }) {
  const go = useGo();
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Forecast>(`/projects/${project.id}/forecast/`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("project_forecast.bashoratni_hisoblab_bolmadi"));
    }
  }, [project.id]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorMsg error={error} />;
  if (!data) return <Loading />;

  const p = data.project;

  return (
    <>
      {/* «Umumiy» sahifasidagi kabi: raqam bosilsa o'sha vazifalar
          ro'yxati filtrlangan holda ochiladi. Oxirgi katak - sana, uning
          ortida ro'yxat yo'q, shuning uchun u bosilmaydi. */}
      <div className="grid grid-4 mb">
        <Stat value={p.open} label={tx("common.ochiq_vazifa_2")} tone="accent"
              {...toProject(project.id, "vazifalar", "open=1")}
              title={tx("project_forecast.ochiq_vazifalarni_korish")} />
        <Stat value={p.done} label={tx("common.bajarilgan")} tone="ok"
              {...toProject(project.id, "vazifalar", "status=DONE")}
              title={tx("project_forecast.bajarilgan_vazifalarni_korish")} />
        <Stat value={p.overdue} label={tx("common.muddati_otgan")} tone={p.overdue ? "danger" : "ok"}
              {...toProject(project.id, "vazifalar", "overdue=1")}
              title={tx("project_forecast.muddati_otgan_vazifalarni_korish")} />
        <Stat
          value={p.start_date ? fmtDate(p.start_date) : "—"}
          label={tx("project_forecast.loyiha_boshlanish_sanasi")}
          tone="done"
        />
      </div>

      <div className="card mb">
        <div className="card-body">
          <div className="row wrap" style={{ gap: 24 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>{tx("project_forecast.loyiha_kiritilgan")}</div>
              <strong>{p.start_date ? fmtDate(p.start_date) : "—"}</strong>
              <span className="muted"> → </span>
              <strong>{p.due_date ? fmtDate(p.due_date) : "—"}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>{tx("project_forecast.vazifalar_kiritilgan")}</div>
              <strong>{p.task_start ? fmtDate(p.task_start) : "—"}</strong>
              <span className="muted"> → </span>
              <strong className={p.at_risk ? "c-red" : ""}>
                {p.task_due ? fmtDate(p.task_due) : "—"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {p.at_risk && (
        <div className="callout danger mb">
          {tx("project_forecast.vazifalarning_oxirgi_muddati")} <strong>{fmtDate(p.task_due)}</strong> {tx("project_forecast.loyiha_muddatidan")}<strong>{fmtDate(p.due_date)}</strong>{tx("project_forecast.kech")}
        </div>
      )}
      {!!p.unassigned && (
        <div className="callout warn mb">
          {p.unassigned} {tx("project_forecast.ta_vazifa_hech_kimga_biriktirilmagan")}
        </div>
      )}

      {!data.members.length ? (
        <Card title={tx("project_forecast.kim_qachon_tugatadi")}>
          <Empty title={tx("project_forecast.malumot_yoq")} text={tx("project_forecast.vazifalarni_jamoaga_taqsimlang")} />
        </Card>
      ) : data.members.map((m) => (
        <Card key={m.user.id} padded={false}
              title={
                <span className="row" style={{ gap: 8 }}>
                  <Avatar user={m.user} size="sm" />
                  <Link {...toDeveloper(project.id, m.user.id)}>
                    {m.user.full_name}
                  </Link>
                  <span className="muted" style={{ fontWeight: 400 }}>
                    · ({m.user.specialty_display}) {m.role}
                  </span>
                </span>
              }
              badge={
                <span className="row" style={{ gap: 6 }}>
                  <span className="badge">{m.open} {tx("common.ochiq")}</span>
                  {!!m.in_review && <span className="badge badge-info">{m.in_review} {tx("project_forecast.tekshiruvda")}</span>}
                  {!!m.done && <span className="badge badge-ok">{m.done} {tx("common.bajarilgan_2")}</span>}
                  {!!m.overdue && <span className="badge badge-danger">{m.overdue} {tx("project_forecast.kechikkan")}</span>}
                </span>
              }>
          {/* Yig'indi sana emas, har bir vazifa o'z sanasi bilan: odam nimani
              qachon tugatishini aynan shu jadvaldan ko'radi. */}
          {!m.tasks.length ? (
            <div className="card-body">
              <span className="muted">{tx("project_forecast.ochiq_vazifa_yoq")}</span>
            </div>
          ) : (
            <div className="table-wrap"><table className="table">
              <thead>
                <tr>
                  <th>{tx("common.vazifa")}</th><th>{tx("common.holat")}</th>
                  <th>{tx("common.boshlanish")}</th><th>{tx("project_forecast.tugatish_sanasi")}</th>
                </tr>
              </thead>
              <tbody>
                {m.tasks.map((t) => (
                  <tr key={t.id} className={`clickable ${t.overdue ? "row-risk" : ""}`}
                      onClick={() => go(toTask(t.id))}>
                    <td>
                      <Link {...toTask(t.id)} onClick={(e) => e.stopPropagation()}
                            style={{ color: "var(--text)", fontWeight: 500 }}>
                        {t.title}
                      </Link>
                    </td>
                    <td className="muted nowrap">{t.status_display}</td>
                    <td className="muted nowrap">{t.start_date ? fmtDate(t.start_date) : "—"}</td>
                    <td className="nowrap">
                      {t.due_date ? (
                        <strong className={t.overdue ? "c-red" : ""}>
                          {fmtDate(t.due_date)}
                          {t.overdue && <span className="badge badge-danger"
                                              style={{ marginLeft: 6 }}>{tx("project_forecast.kechikkan")}</span>}
                        </strong>
                      ) : (
                        <span className="muted">{tx("project_forecast.sana_qoyilmagan")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      ))}

    </>
  );
}
