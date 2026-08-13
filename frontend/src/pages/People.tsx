import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, ErrorMsg, Loading, fmtDate } from "@/components/ui";

export default function People() {
  const { user, meta } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [f, setF] = useState({ search: "", specialty: "", role: "", seniority: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setUsers(listOf<User>(await api.get<any>("/users/", { ...f, page_size: 200 })));
  }, [f]);

  useEffect(() => { void load(); }, [load]);

  async function change(target: User, patch: Record<string, unknown>) {
    setError(null);
    try {
      await api.patch(`/users/${target.id}/role/`, patch);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ozgartirib bolmadi");
    }
  }

  const isAdmin = user?.is_platform_admin;

  // Mutaxassislik bo'yicha taqsimot
  const byspec: Record<string, number> = {};
  (users || []).forEach((u) => { byspec[u.specialty_display] = (byspec[u.specialty_display] || 0) + 1; });

  return (
    <>
      <PageHead title={<strong>Foydalanuvchilar</strong>}
                actions={users && <span className="badge">{users.length} ta</span>} />
      <div className="content">
        <ErrorMsg error={error} />

        <div className="filters">
          <div className="f" style={{ flex: 1 }}>
            <label>Qidiruv</label>
            <input value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })}
                   placeholder="Ism, email yoki konikma" />
          </div>
          <div className="f">
            <label>Mutaxassislik</label>
            <select value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })}>
              <option value="">Hammasi</option>
              {(meta?.specialties || []).map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Daraja</label>
            <select value={f.seniority} onChange={(e) => setF({ ...f, seniority: e.target.value })}>
              <option value="">Hammasi</option>
              {(meta?.seniority || []).map((s) => (
                <option key={s.value} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Tizim roli</label>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="">Hammasi</option>
              {(meta?.global_role || []).map((s) => (
                <option key={s.value} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="split">
          <div className="card">
            {!users ? <Loading /> : (
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>Foydalanuvchi</th><th>Mutaxassislik</th><th>Tizim roli</th>
                    <th>Loyihalar</th><th>Ochiq ish</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="row">
                          <Avatar user={u} size="sm" />
                          <div>
                            <Link to={`/profil/${u.id}`}>{u.full_name}</Link>
                            {!u.is_active && <span className="badge badge-danger">bloklangan</span>}
                            <br /><small className="muted">{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {isAdmin ? (
                          <select defaultValue={u.specialty} style={{ width: 160 }}
                                  onChange={(e) => void change(u, { specialty: e.target.value })}>
                            {(meta?.specialties || []).map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge" style={{ color: u.specialty_color }}>
                            {u.specialty_display}
                          </span>
                        )}
                        <br /><small className="muted">{u.seniority_display} · {u.years_experience} yil</small>
                      </td>
                      <td>
                        {isAdmin ? (
                          <select defaultValue={u.global_role} style={{ width: 150 }}
                                  onChange={(e) => void change(u, { global_role: e.target.value })}>
                            {(meta?.global_role || []).map((s) => (
                              <option key={s.value} value={String(s.value)}>{s.label}</option>
                            ))}
                          </select>
                        ) : <span className="badge">{u.global_role_display}</span>}
                      </td>
                      <td>{u.project_count ?? 0}</td>
                      <td>{u.open_tasks ?? 0}</td>
                      <td className="right">
                        {isAdmin && u.id !== user?.id && (
                          <button className={`btn btn-sm ${u.is_active ? "btn-danger" : ""}`}
                                  onClick={() => void change(u, { is_active: !u.is_active })}>
                            {u.is_active ? "Bloklash" : "Faollashtirish"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          <div>
            <Card title="Mutaxassisliklar taqsimoti">
              <ul className="list-plain" style={{ fontSize: 13 }}>
                {Object.entries(byspec).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <li className="row" key={k}>
                    <span>{k}</span><span className="spacer" /><strong>{v}</strong>
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
