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
import { tx } from "@/i18n";

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
      setError(err instanceof ApiError ? err.message : tx("common.amalni_bajarib_bolmadi"));
    }
  }

  /** Menejer himoyalangan: unga hech kim tegmaydi - u loyihadan faqat o'zi
      chiqadi (o'ngdagi «Loyihadan chiqish» kartasi). */
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
        <Card title={tx("project_members.qoshilish_sorovlari")} padded={false}
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
                      {r.user.seniority_display} {tx("project_members.istagan_roli")} {r.desired_role_display} · {timeAgo(r.created_at)}
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
                      action: "approve", role: sel.value, note: tx("project_members.xush_kelibsiz"),
                    }));
                  }}>{tx("common.qabul_qilish")}</button>
                  <button className="btn btn-sm btn-danger" onClick={() =>
                    void act(() => api.post(`/projects/${project.id}/requests/${r.id}/decide/`, {
                      action: "reject", note: tx("project_members.hozircha_orin_yoq"),
                    }))}>{tx("project_members.rad_etish")}</button>
                </div>
                {r.message && <div className="tl-detail" style={{ marginTop: 10 }}>{r.message}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="split">
        <div>
          <Card title={tx("common.jamoa")} padded={false} badge={<span className="badge">{active.length}</span>}>
            <div className="table-wrap"><table className="table">
              <thead>
                <tr><th>{tx("project_members.azo")}</th><th>{tx("common.mutaxassislik")}</th><th>{tx("common.rol")}</th><th>{tx("project_members.yuklama")}</th><th></th></tr>
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
                            <> <span className="badge badge-brand">{tx("project_members.tizim_admini")}</span></>
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
                      <span className="badge badge-info">{m.load?.open ?? 0} {tx("common.ochiq")}</span>{" "}
                      <span className="badge badge-ok">{m.load?.done ?? 0} {tx("common.bajarilgan_2")}</span>
                    </td>
                    <td className="right"><div className="row-actions">
                      {acc.can_appoint_admin && !isSelf(m) && (
                        m.user.is_platform_admin ? (
                          /* Berilgan huquqni qaytarib olish. Oxirgi admin va bosh
                             hisob serverda himoyalangan - u yerdan 400 keladi. */
                          <button className="btn btn-sm" title={tx("project_members.tizim_admini_huquqini_bekor_qilish")}
                                  onClick={() => void (async () => {
                                    const ok = await confirmDialog({
                                      title: tx("project_members.adminlikdan_chiqarilsinmi", { ism: m.user.full_name }),
                                      body: tx("project_members.tizim_admini_huquqidan_mahrum_boladi")
                                        + tx("project_members.loyihadagi_roli_ozgarmaydi"),
                                      confirmText: tx("common.bekor_qilish"),
                                      danger: true,
                                    });
                                    if (!ok) return;
                                    await act(() => api.post(
                                      `/projects/${project.id}/members/${m.id}/`,
                                      { action: "revoke_admin" }));
                                  })()}>
                            {tx("project_members.adminlikni_bekor_qilish")}
                          </button>
                        ) : (
                          <button className="btn btn-sm" title={tx("project_members.tizim_admini_qilib_tayinlash")}
                                  onClick={() => void (async () => {
                                    const ok = await confirmDialog({
                                      title: tx("project_members.tizim_admini_bolsinmi", { ism: m.user.full_name }),
                                      body: tx("project_members.butun_platformada_hamma_huquqqa_ega")
                                        + tx("project_members.barcha_loyihalar_foydalanuvchilar_va_sozlama"),
                                      confirmText: tx("project_members.admin_qilish"),
                                    });
                                    if (!ok) return;
                                    await act(() => api.post(
                                      `/projects/${project.id}/members/${m.id}/`,
                                      { action: "appoint_admin" }));
                                  })()}>
                            {tx("project_members.admin_qilish")}
                          </button>
                        )
                      )}
                      {acc.can_manage && (
                        isSelf(m) ? (
                          <span className="badge" title={tx("project_members.ozingizga_bu_yerdan_tega_olmaysiz")}>
                            {tx("project_members.bu_sizsiz")}
                          </span>
                        ) : isManager(m) ? (
                          <span className="badge" title={tx("project_members.menejerga_tegib_bolmaydi_u_loyihadan")}>
                            {tx("project_members.himoyalangan")}
                          </span>
                        ) : (
                          <button className="btn btn-sm btn-danger" onClick={() => {
                            const note = window.prompt(
                              tx("project_members.keyingi_dasturchi_uchun_topshiriq_eslatmasi"), "");
                            if (note === null) return;
                            void act(() => api.post(`/projects/${project.id}/members/${m.id}/`, {
                              action: "remove", handover_note: note,
                            }));
                          }}>{tx("project_members.chiqarish")}</button>
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
            <Card title={tx("project_members.sobiq_azolar")} padded={false}>
              <div className="card-list">
                {former.map((m) => (
                  <div className="card-body tight" key={m.id}>
                    <div className="row">
                      <Avatar user={m.user} size="sm" />
                      <Link {...toDeveloper(project.id, m.user.id)}>{m.user.full_name}</Link>
                      <span className="badge">{m.role_display}</span>
                      <span className="spacer" />
                      <small className="muted">{tx("project_members.chiqqan")} {fmtDate(m.left_at)}</small>
                    </div>
                    {m.handover_note && (
                      <div className="tl-detail" style={{ marginTop: 8 }}>
                        <strong>{tx("project_members.topshiriq_eslatmasi")}</strong> {m.handover_note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {decided.length > 0 && acc.can_manage && (
            <Card title={tx("project_members.sorovlar_tarixi")} padded={false}>
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
            <Card title={tx("project_members.qoshilish_kodi")}>
              <div className="muted" style={{ fontSize: 12 }}>
                {tx("project_members.kod_bilan_ozi_qoshilishi_uchun")} <code>{project.join_code}</code>
              </div>
            </Card>
          )}

          {!acc.is_member && (
            <Card title={tx("common.qoshilish")}>
              <Link className="btn btn-primary btn-block" {...toProjectJoin(project.id)}>
                {tx("project_members.sorov_yuborish")}
              </Link>
            </Card>
          )}
          {/* Chiqish - a'zoning O'Z qarori, shuning uchun MENEJERGA ham
              ko'rinadi. Bu muhim: menejerni hech kim chiqara olmaydi
              (`can_change_member`), ya'ni bu yagona yo'l. Ilgari karta
              menejerdan yashirilardi va loyiha menejeri interfeys orqali
              hech qachon o'zgarmas bo'lib qolardi. */}
          {acc.is_member && (
            <Card title={tx("project_members.loyihadan_chiqish")}>
              {acc.is_manager && (
                <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                  {tx("project_members.siz_loyiha_menejerisiz_chiqsangiz_loyiha")}
                </p>
              )}
              <button className="btn btn-danger btn-block" onClick={() => void (async () => {
                if (acc.is_manager) {
                  const ok = await confirmDialog({
                    title: tx("project_members.loyiha_menejerligidan_chiqasizmi"),
                    body: tx("project_members.loyiha_menejersiz_qoladi_ozingizni_qaytara")
                      + tx("project_members.yangi_menejerni_tizim_admini_tayinlaydi"),
                    confirmText: tx("common.chiqish"),
                    danger: true,
                  });
                  if (!ok) return;
                }
                const note = window.prompt(tx("project_members.keyingi_dasturchi_uchun_eslatma_qoldiring"), "");
                if (note === null) return;
                await act(() => api.post(`/projects/${project.id}/leave/`,
                                         { handover_note: note }));
              })()}>{tx("common.chiqish")}</button>
            </Card>
          )}
        </div>
      </div>

      {!active.length && <Empty title={tx("project_members.jamoa_hali_shakllanmagan")} />}
    </>
  );
}
