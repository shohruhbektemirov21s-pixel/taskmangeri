import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { JoinRequest, Project, ProjectMember, User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Avatar, Card, Empty, ErrorMsg, Loading, SpecialtyTag, fmtDate, timeAgo } from "@/components/ui";

export default function Members({ project, onChange }: { project: Project; onChange: () => void }) {
  const { meta } = useAuth();
  const acc = project.access;

  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [candidates, setCandidates] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState("DEVELOPER");
  const [specFilter, setSpecFilter] = useState("");

  const load = useCallback(async () => {
    setMembers(listOf<ProjectMember>(await api.get<any>(`/projects/${project.id}/members/`)));
    if (acc.can_manage) {
      try {
        setRequests(await api.get<JoinRequest[]>(`/projects/${project.id}/requests/`));
        setCandidates(listOf<User>(await api.get<any>("/users/", {
          specialty: specFilter, page_size: 100,
        })));
      } catch { /* ignore */ }
    }
  }, [project.id, acc.can_manage, specFilter]);

  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Amalni bajarib bolmadi");
    }
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");
  const active = (members || []).filter((m) => m.is_active);
  const former = (members || []).filter((m) => !m.is_active);

  if (!members) return <Loading />;

  return (
    <>
      <ErrorMsg error={error} />

      {acc.can_manage && pending.length > 0 && (
        <Card title="Qoshilish sorovlari" padded={false}
              badge={<span className="badge badge-warn">{pending.length}</span>}>
          <div className="card-list">
            {pending.map((r) => (
              <div className="card-body" key={r.id}>
                <div className="row wrap">
                  <Avatar user={r.user} />
                  <div>
                    <strong>{r.user.full_name}</strong>{" "}
                    <SpecialtyTag user={r.user} />
                    <br />
                    <small className="muted">
                      {r.user.seniority_display} · istagan roli: {r.desired_role_display} · {timeAgo(r.created_at)}
                    </small>
                  </div>
                  <span className="spacer" />
                  <select id={`role-${r.id}`} defaultValue={r.desired_role} style={{ width: 170 }}>
                    {(meta?.project_role || []).map((x) => (
                      <option key={x.value} value={String(x.value)}>{x.label}</option>
                    ))}
                  </select>
                  <button className="btn btn-sm btn-primary" onClick={() => {
                    const sel = document.getElementById(`role-${r.id}`) as HTMLSelectElement;
                    void act(() => api.post(`/projects/${project.id}/requests/${r.id}/decide/`, {
                      action: "approve", role: sel.value, note: "Xush kelibsiz",
                    }));
                  }}>Qabul qilish</button>
                  <button className="btn btn-sm btn-danger" onClick={() =>
                    void act(() => api.post(`/projects/${project.id}/requests/${r.id}/decide/`, {
                      action: "reject", note: "Hozircha orin yoq",
                    }))}>Rad etish</button>
                </div>
                {r.message && <div className="tl-detail" style={{ marginTop: 10 }}>{r.message}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="split">
        <div>
          <Card title="Jamoa" padded={false} badge={<span className="badge">{active.length}</span>}>
            <table className="table">
              <thead>
                <tr><th>Azo</th><th>Mutaxassislik</th><th>Rol</th><th>Yuklama</th><th></th></tr>
              </thead>
              <tbody>
                {active.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="row">
                        <Avatar user={m.user} size="sm" />
                        <div>
                          <Link to={`/loyiha/${project.id}/dasturchi/${m.user.id}`}>{m.user.full_name}</Link>
                          <br /><small className="muted">{m.user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ color: m.user.specialty_color }}>
                        <span className="mono">{m.user.specialty_icon}</span> {m.user.specialty_display}
                      </span>
                      <br /><small className="muted">{m.user.seniority_display}</small>
                    </td>
                    <td>
                      {acc.can_manage ? (
                        <select defaultValue={m.role} style={{ width: 150 }}
                                onChange={(e) => void act(() =>
                                  api.post(`/projects/${project.id}/members/${m.id}/`, {
                                    action: "role", role: e.target.value,
                                  }))}>
                          {(meta?.project_role || []).map((x) => (
                            <option key={x.value} value={String(x.value)}>{x.label}</option>
                          ))}
                        </select>
                      ) : <span className="badge">{m.role_display}</span>}
                    </td>
                    <td className="nowrap">
                      <span className="badge badge-info">{m.load?.open ?? 0} ochiq</span>{" "}
                      <span className="badge badge-ok">{m.load?.done ?? 0} bajarilgan</span>
                    </td>
                    <td className="right">
                      {acc.can_manage && (
                        <button className="btn btn-sm btn-danger" onClick={() => {
                          const note = window.prompt(
                            "Keyingi dasturchi uchun topshiriq eslatmasi (tarixda saqlanadi):", "");
                          if (note === null) return;
                          void act(() => api.post(`/projects/${project.id}/members/${m.id}/`, {
                            action: "remove", handover_note: note,
                          }));
                        }}>Chiqarish</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {former.length > 0 && (
            <Card title="Sobiq aʼzolar" padded={false}>
              <div className="card-list">
                {former.map((m) => (
                  <div className="card-body tight" key={m.id}>
                    <div className="row">
                      <Avatar user={m.user} size="sm" />
                      <Link to={`/loyiha/${project.id}/dasturchi/${m.user.id}`}>{m.user.full_name}</Link>
                      <span className="badge">{m.role_display}</span>
                      <span className="spacer" />
                      <small className="muted">chiqqan: {fmtDate(m.left_at)}</small>
                    </div>
                    {m.handover_note && (
                      <div className="tl-detail" style={{ marginTop: 8 }}>
                        <strong>Topshiriq eslatmasi:</strong> {m.handover_note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {decided.length > 0 && acc.can_manage && (
            <Card title="Sorovlar tarixi" padded={false}>
              <table className="table">
                <tbody>
                  {decided.map((r) => (
                    <tr key={r.id}>
                      <td>{r.user.full_name}</td>
                      <td>
                        <span className={`badge ${r.status === "APPROVED" ? "badge-ok" : "badge-danger"}`}>
                          {r.status_display}
                        </span>
                      </td>
                      <td className="muted">{r.decided_by?.full_name}</td>
                      <td className="muted">{timeAgo(r.decided_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div>
          {acc.can_manage && (
            <Card title="Aʼzo qoshish">
              <div className="field">
                <label>Mutaxassislik boyicha filtr</label>
                <select value={specFilter} onChange={(e) => setSpecFilter(e.target.value)}>
                  <option value="">Hammasi</option>
                  {(meta?.specialties || []).map((s: any) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Foydalanuvchi</label>
                <select value={addUser} onChange={(e) => setAddUser(e.target.value)}>
                  <option value="">Tanlang</option>
                  {candidates
                    .filter((u) => !active.some((m) => m.user.id === u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} — {u.specialty_display}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label>Rol</label>
                <select value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                  {(meta?.project_role || []).map((x) => (
                    <option key={x.value} value={String(x.value)}>{x.label}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary btn-block" disabled={!addUser}
                      onClick={() => void act(async () => {
                        await api.post(`/projects/${project.id}/members/add/`, {
                          user_id: Number(addUser), role: addRole,
                        });
                        setAddUser("");
                      })}>
                Qoshish
              </button>
              <div className="divider" />
              <div className="muted" style={{ fontSize: 12 }}>
                Qoshilish kodi: <code>{project.join_code}</code>
              </div>
            </Card>
          )}

          {!acc.is_member && (
            <Card title="Qoshilish">
              <Link className="btn btn-primary btn-block" to={`/loyiha/${project.id}/qoshilish`}>
                Sorov yuborish
              </Link>
            </Card>
          )}
          {acc.is_member && !acc.is_manager && (
            <Card title="Loyihadan chiqish">
              <button className="btn btn-danger btn-block" onClick={() => {
                const note = window.prompt("Keyingi dasturchi uchun eslatma qoldiring:", "");
                if (note === null) return;
                void act(() => api.post(`/projects/${project.id}/leave/`, { handover_note: note }));
              }}>Chiqish</button>
            </Card>
          )}
        </div>
      </div>

      {!active.length && <Empty title="Jamoa hali shakllanmagan" />}
    </>
  );
}
