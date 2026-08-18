import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { JoinRequest, Project, ProjectMember } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import AddMemberBox from "@/components/AddMemberBox";
import { Avatar, Card, Empty, ErrorMsg, Loading, SpecialtyTag, fmtDate, timeAgo } from "@/components/ui";
import { confirmDialog } from "@/components/Confirm";
import { useProjectLive } from "@/realtime/RealtimeContext";
import { toDeveloper, toProjectJoin } from "@/nav";

export default function Members({ project, onChange }: { project: Project; onChange: () => void }) {
  const { meta, user } = useAuth();
  const acc = project.access;

  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Har bir o'zgarishda nomzodlar ro'yxati qayta so'raladi.
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setMembers(listOf<ProjectMember>(await api.get<any>(`/projects/${project.id}/members/`)));
    if (acc.can_manage) {
      try {
        setRequests(await api.get<JoinRequest[]>(`/projects/${project.id}/requests/`));
      } catch { /* ignore */ }
    }
  }, [project.id, acc.can_manage]);

  useEffect(() => { void load(); }, [load]);
  useProjectLive(project.id, () => { void load(); });

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
      onChange();
      setVersion((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Amalni bajarib bolmadi");
    }
  }

  /** Menejer himoyalangan: uni na loyiha admini, na tizim admini chiqara oladi. */
  const isManager = (m: ProjectMember) =>
    m.role === "MANAGER" || m.user.id === project.manager?.id;
  /** O'ziga o'zi tegmaydi: adminlikni ham, chiqishni ham boshqa odam bajaradi.
      Ataylab chiqmoqchi bo'lsa o'ngdagi «Loyihadan chiqish» kartasi bor. */
  const isSelf = (m: ProjectMember) => m.user.id === user?.id;

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");
  const active = (members || []).filter((m) => m.is_active);
  const former = (members || []).filter((m) => !m.is_active);

  if (!members) return <Loading />;

  return (
    <>
      <ErrorMsg error={error} />

      {acc.can_manage && (
        <div className="mb">
          <AddMemberBox
            projectId={project.id}
            roles={(meta?.project_role || [])
              .filter((r) => r.value !== "MANAGER" || acc.can_grant_manager)}
            defaultRole="DEVELOPER"
            refreshKey={version}
            onChange={() => { void load(); onChange(); setVersion((n) => n + 1); }}
          />
        </div>
      )}

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
            <div className="table-wrap"><table className="table">
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
                          <Link {...toDeveloper(project.id, m.user.id)}>{m.user.full_name}</Link>
                          <br />
                          <small className="muted">{m.user.email}</small>
                          {m.user.is_platform_admin && (
                            <> <span className="badge badge-brand">tizim admini</span></>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ color: m.user.specialty_color }}>
                        {m.user.specialty_display}
                      </span>
                      <br /><small className="muted">{m.user.seniority_display}</small>
                    </td>
                    <td>
                      {acc.can_manage && !isManager(m) ? (
                        <select defaultValue={m.role} style={{ width: 160 }}
                                onChange={(e) => void act(() =>
                                  api.post(`/projects/${project.id}/members/${m.id}/`, {
                                    action: "role", role: e.target.value,
                                  }))}>
                          {(meta?.project_role || [])
                            /* MENEJER rolini faqat amaldagi menejer bera oladi */
                            .filter((x) => x.value !== "MANAGER" || acc.can_grant_manager)
                            .map((x) => (
                              <option key={x.value} value={String(x.value)}>{x.label}</option>
                            ))}
                        </select>
                      ) : (
                        <span className={`badge ${isManager(m) ? "badge-brand" : ""}`}>
                          {m.role_display}
                        </span>
                      )}
                    </td>
                    <td className="nowrap">
                      <span className="badge badge-info">{m.load?.open ?? 0} ochiq</span>{" "}
                      <span className="badge badge-ok">{m.load?.done ?? 0} bajarilgan</span>
                    </td>
                    <td className="right"><div className="row-actions">
                      {acc.can_appoint_admin && !isSelf(m) && (
                        m.user.is_platform_admin ? (
                          /* Berilgan huquqni qaytarib olish. Oxirgi admin va bosh
                             hisob serverda himoyalangan - u yerdan 400 keladi. */
                          <button className="btn btn-sm" title="Tizim admini huquqini bekor qilish"
                                  onClick={() => void (async () => {
                                    const ok = await confirmDialog({
                                      title: `${m.user.full_name} adminlikdan chiqarilsinmi?`,
                                      body: "Tizim admini huquqidan mahrum bo'ladi. "
                                        + "Loyihadagi roli o'zgarmaydi.",
                                      confirmText: "Bekor qilish",
                                      danger: true,
                                    });
                                    if (!ok) return;
                                    await act(() => api.post(
                                      `/projects/${project.id}/members/${m.id}/`,
                                      { action: "revoke_admin" }));
                                  })()}>
                            Adminlikni bekor qilish
                          </button>
                        ) : (
                          <button className="btn btn-sm" title="Tizim admini qilib tayinlash"
                                  onClick={() => void (async () => {
                                    const ok = await confirmDialog({
                                      title: `${m.user.full_name} tizim admini bo'lsinmi?`,
                                      body: "Butun platformada hamma huquqqa ega bo'ladi: "
                                        + "barcha loyihalar, foydalanuvchilar va sozlamalar.",
                                      confirmText: "Admin qilish",
                                    });
                                    if (!ok) return;
                                    await act(() => api.post(
                                      `/projects/${project.id}/members/${m.id}/`,
                                      { action: "appoint_admin" }));
                                  })()}>
                            Admin qilish
                          </button>
                        )
                      )}
                      {acc.can_manage && (
                        isSelf(m) ? (
                          <span className="badge" title="O'zingizga bu yerdan tega olmaysiz">
                            bu sizsiz
                          </span>
                        ) : isManager(m) ? (
                          <span className="badge" title="Menejerni faqat boshqa menejer almashtira oladi">
                            himoyalangan
                          </span>
                        ) : (
                          <button className="btn btn-sm btn-danger" onClick={() => {
                            const note = window.prompt(
                              "Keyingi dasturchi uchun topshiriq eslatmasi (tarixda saqlanadi):", "");
                            if (note === null) return;
                            void act(() => api.post(`/projects/${project.id}/members/${m.id}/`, {
                              action: "remove", handover_note: note,
                            }));
                          }}>Chiqarish</button>
                        )
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>

          {former.length > 0 && (
            <Card title="Sobiq aʼzolar" padded={false}>
              <div className="card-list">
                {former.map((m) => (
                  <div className="card-body tight" key={m.id}>
                    <div className="row">
                      <Avatar user={m.user} size="sm" />
                      <Link {...toDeveloper(project.id, m.user.id)}>{m.user.full_name}</Link>
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
              <div className="table-wrap"><table className="table">
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
              </table></div>
            </Card>
          )}
        </div>

        <div>
          {acc.can_manage && (
            <Card title="Qoshilish kodi">
              <div className="muted" style={{ fontSize: 12 }}>
                Kod bilan o'zi qo'shilishi uchun: <code>{project.join_code}</code>
              </div>
            </Card>
          )}

          {!acc.is_member && (
            <Card title="Qoshilish">
              <Link className="btn btn-primary btn-block" {...toProjectJoin(project.id)}>
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
