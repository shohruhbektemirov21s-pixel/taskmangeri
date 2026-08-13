/**
 * Muddatlar — kimda nima bor va qachonga belgilangan.
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
        <Stat value={p.overdue} label="Muddati otgan" tone={p.overdue ? "danger" : "ok"} />
        <Stat
          value={p.due_date ? fmtDate(p.due_date) : "—"}
          label="Loyiha muddati"
          tone={p.at_risk ? "danger" : "done"}
        />
      </div>

      <div className="card mb">
        <div className="card-body">
          <div className="row wrap" style={{ gap: 24 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Loyiha (kiritilgan)</div>
              <strong>{p.start_date ? fmtDate(p.start_date) : "—"}</strong>
              <span className="muted"> → </span>
              <strong>{p.due_date ? fmtDate(p.due_date) : "—"}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Vazifalar (kiritilgan)</div>
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
          Vazifalarning oxirgi muddati <strong>{fmtDate(p.task_due)}</strong> —
          loyiha muddatidan (<strong>{fmtDate(p.due_date)}</strong>) kech.
        </div>
      )}
      {!!p.unassigned && (
        <div className="callout warn mb">
          {p.unassigned} ta vazifa hech kimga biriktirilmagan.
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
                <th>Boshlanish</th><th>Oxirgi muddat</th>
              </tr>
            </thead>
            <tbody>
              {data.specialties.map((s) => (
                <tr key={s.value} className={s.late ? "row-risk" : ""}>
                  <td>
                    <strong>{s.label}</strong>
                    <div style={{ maxWidth: 140, marginTop: 6 }}>
                      <Progress value={s.progress} />
                    </div>
                  </td>
                  <td>{s.people}</td>
                  <td>{s.open}{!!s.overdue && <span className="badge badge-danger" style={{ marginLeft: 6 }}>{s.overdue} kechikkan</span>}</td>
                  <td>{s.done}</td>
                  <td className="muted">{s.first_start ? fmtDate(s.first_start) : "—"}</td>
                  <td>
                    <strong className={s.late ? "c-red" : ""}>
                      {s.last_due ? fmtDate(s.last_due) : "—"}
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
                <th>Bajarilgan</th><th>Boshlanish</th><th>Oxirgi muddat</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.user.id} className={m.late ? "row-risk" : ""}>
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
                  <td className="muted">{m.first_start ? fmtDate(m.first_start) : "—"}</td>
                  <td>
                    <strong className={m.late ? "c-red" : ""}>
                      {m.last_due ? fmtDate(m.last_due) : "—"}
                    </strong>
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
