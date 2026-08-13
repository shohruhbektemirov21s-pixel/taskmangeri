/**
 * Muddatlar — «kim qachon tugatadi».
 *
 * Ikki kesim: har bir odam bo'yicha va mutaxassislik bo'yicha
 * («frontend qachon tugaydi»). Hisob backendda: qolgan rejalashtirilgan soat
 * kuniga bir necha soatdan bajariladi deb olinadi. Bashorat muddatdan
 * kechikayotgan bo'lsa qator qizil bilan belgilanadi.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Forecast, Project } from "@/api/types";
import { Avatar, Card, Empty, ErrorMsg, Loading, Progress, Stat, fmtDate } from "@/components/ui";

export default function ForecastTab({ project }: { project: Project }) {
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Forecast>(`/projects/${project.id}/forecast/`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bashoratni hisoblab bo'lmadi");
    }
  }, [project.id]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorMsg error={error} />;
  if (!data) return <Loading />;

  const p = data.project;

  return (
    <>
      <div className="grid grid-4 mb">
        <Stat value={p.open} label="Ochiq vazifa" tone="accent" />
        <Stat value={p.done} label="Bajarilgan" tone="ok" />
        <Stat value={`${p.hours_left} soat`} label="Qolgan ish" tone="warn" />
        <Stat
          value={p.forecast_date ? fmtDate(p.forecast_date) : "—"}
          label="Loyiha taxminan tugaydi"
          tone={p.at_risk ? "danger" : "done"}
        />
      </div>

      {p.at_risk && (
        <div className="callout danger mb">
          Bashorat muddatdan kechikmoqda: rejada <strong>{fmtDate(p.due_date)}</strong>,
          hisob-kitobga ko'ra <strong>{fmtDate(p.forecast_date)}</strong>.
        </div>
      )}
      {!!p.unassigned && (
        <div className="callout warn mb">
          {p.unassigned} ta vazifa hech kimga biriktirilmagan — ular bashoratga kirmadi.
        </div>
      )}

      <Card title="Mutaxassislik bo'yicha" padded={false}
            badge={<span className="badge">{data.specialties.length}</span>}>
        {!data.specialties.length ? (
          <Empty title="Ma'lumot yo'q" text="Hali hech kimga vazifa biriktirilmagan." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Yo'nalish</th><th>Odam</th><th>Ochiq</th><th>Bajarilgan</th>
                <th>Qolgan soat</th><th>Muddat</th><th>Taxminan tugaydi</th>
              </tr>
            </thead>
            <tbody>
              {data.specialties.map((s) => (
                <tr key={s.value} className={s.at_risk ? "row-risk" : ""}>
                  <td>
                    <strong>{s.label}</strong>
                    <div style={{ maxWidth: 140, marginTop: 6 }}>
                      <Progress value={s.progress} />
                    </div>
                  </td>
                  <td>{s.people}</td>
                  <td>{s.open}{!!s.overdue && <span className="badge badge-danger" style={{ marginLeft: 6 }}>{s.overdue} kechikkan</span>}</td>
                  <td>{s.done}</td>
                  <td className="mono">{s.hours_left}</td>
                  <td className="muted">{s.last_due ? fmtDate(s.last_due) : "—"}</td>
                  <td>
                    <strong className={s.at_risk ? "c-red" : ""}>
                      {s.forecast_date ? fmtDate(s.forecast_date) : "—"}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Odamlar bo'yicha" padded={false}
            badge={<span className="badge">{data.members.length}</span>}>
        {!data.members.length ? (
          <Empty title="Ma'lumot yo'q" text="Vazifalarni jamoaga taqsimlang." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Xodim</th><th>Rol</th><th>Ochiq</th><th>Tekshiruvda</th>
                <th>Bajarilgan</th><th>Qolgan soat</th><th>Taxminan tugatadi</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.user.id} className={m.at_risk ? "row-risk" : ""}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <Avatar user={m.user} size="sm" />
                      <div style={{ minWidth: 0 }}>
                        <Link to={`/loyiha/${project.id}/dasturchi/${m.user.id}`}>
                          {m.user.full_name}
                        </Link>
                        <br /><small className="muted">{m.specialty_display}</small>
                      </div>
                    </div>
                  </td>
                  <td className="muted">{m.role}</td>
                  <td>
                    {m.open}
                    {!!m.overdue && (
                      <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                        {m.overdue} kechikkan
                      </span>
                    )}
                  </td>
                  <td>{m.in_review}</td>
                  <td>{m.done}</td>
                  <td className="mono">{m.hours_left}</td>
                  <td>
                    <strong className={m.at_risk ? "c-red" : ""}>
                      {m.forecast_date ? fmtDate(m.forecast_date) : "—"}
                    </strong>
                    {m.last_due && (
                      <><br /><small className="muted">muddat: {fmtDate(m.last_due)}</small></>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

    </>
  );
}
