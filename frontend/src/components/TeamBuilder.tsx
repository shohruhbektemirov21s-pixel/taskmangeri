/**
 * Panelda jamoa yig'ish - menejer uchun.
 *
 * Yangi loyiha nol jamoa bilan boshlanadi, menejer esa birinchi kunlarda aynan
 * shu ish bilan band bo'ladi. Ilgari buning uchun har safar loyiha sahifasining
 * "Jamoa" bo'limiga o'tish kerak edi; endi uchala amal ham panelning o'zida:
 *
 *   1) odamni **email yoki ism-familiya** bo'yicha topib taklif qilish;
 *   2) qo'shilish so'rovini qabul qilish yoki rad etish;
 *   3) a'zoni jamoadan chiqarish.
 *
 * Ruxsat tekshiruvi backendda: bu yerda faqat menejer boshqaradigan loyihalar
 * ko'rsatiladi va MENEJER roli `can_grant_manager` bo'lmasa ro'yxatga tushmaydi.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { JoinRequest, Project, ProjectMember } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import InviteBox from "./InviteBox";
import { Avatar, Card, ErrorMsg, SpecialtyTag, timeAgo } from "./ui";

export default function TeamBuilder({
  projects, onChange,
}: {
  projects: Project[];
  onChange?: () => void;
}) {
  const { meta } = useAuth();
  const [projectId, setProjectId] = useState<number | null>(projects[0]?.id ?? null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Loyihalar ro'yxati kelgach (yoki o'zgargach) tanlov yaroqli bo'lib qolsin.
  useEffect(() => {
    if (!projects.length) { setProjectId(null); return; }
    if (!projects.some((p) => p.id === projectId)) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const project = projects.find((p) => p.id === projectId) || null;

  const load = useCallback(async () => {
    if (!projectId) { setRequests([]); setMembers([]); return; }
    try {
      setRequests(listOf<JoinRequest>(
        await api.get<any>(`/projects/${projectId}/requests/`, { status: "PENDING" })));
    } catch { setRequests([]); }
    try {
      setMembers(listOf<ProjectMember>(await api.get<any>(`/projects/${projectId}/members/`)));
    } catch { setMembers([]); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
      onChange?.();
      setVersion((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Amalni bajarib bolmadi");
    }
  }

  if (!projects.length) return null;

  const acc = project?.access;
  /** Menejer himoyalangan: uni bu yerdan chiqarib bo'lmaydi. */
  const isManager = (m: ProjectMember) =>
    m.role === "MANAGER" || m.user.id === project?.manager?.id;
  const active = members.filter((m) => m.is_active);
  const roles = (meta?.project_role || [])
    .filter((r) => r.value !== "MANAGER" || acc?.can_grant_manager);

  return (
    <Card
      title="Jamoa yigish"
      badge={requests.length ? <span className="badge badge-warn">{requests.length} sorov</span> : undefined}
      action={project && (
        <Link className="btn btn-sm" to={`/loyiha/${project.id}/jamoa`}>Toliq bolim</Link>
      )}
    >
      <ErrorMsg error={error} />

      {projects.length > 1 && (
        <div className="field">
          <label>Qaysi loyihaga</label>
          <select value={projectId ?? ""} onChange={(e) => setProjectId(Number(e.target.value))}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.member_count ?? 0} aʼzo)
              </option>
            ))}
          </select>
        </div>
      )}

      {project && !active.length && !requests.length && (
        <div className="callout mb">
          <strong>{project.name}</strong> hali boʻsh. Pastdan odamni email yoki
          ism-familiyasi boʻyicha topib taklif yuboring — u tasdiqlagach aʼzo boʻladi.
        </div>
      )}

      {/* 1. Taklif qilish - qidiruv shu komponent ichida */}
      {project && acc?.can_manage && (
        <InviteBox
          projectId={project.id}
          roles={roles}
          defaultRole="DEVELOPER"
          refreshKey={version}
          onChange={() => { void load(); onChange?.(); setVersion((n) => n + 1); }}
        />
      )}

      {/* 2. Qo'shilish so'rovlari - qabul qilish yoki rad etish */}
      {!!requests.length && (
        <>
          <div className="divider" />
          <h4 style={{ margin: "0 0 10px" }}>Qoshilish sorovlari</h4>
          <div className="stack">
            {requests.map((r) => (
              <div className="card-body tight" key={r.id}
                   style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
                <div className="row wrap">
                  <Avatar user={r.user} size="sm" />
                  <div style={{ minWidth: 0 }}>
                    <strong>{r.user.full_name}</strong> <SpecialtyTag user={r.user} compact />
                    <br />
                    <small className="muted">{r.user.email} · {timeAgo(r.created_at)}</small>
                  </div>
                  <span className="spacer" />
                  <select id={`tb-role-${r.id}`} defaultValue={r.desired_role} style={{ width: 150 }}>
                    {roles.map((x) => (
                      <option key={x.value} value={String(x.value)}>{x.label}</option>
                    ))}
                  </select>
                  <button className="btn btn-sm btn-primary" onClick={() => {
                    const sel = document.getElementById(`tb-role-${r.id}`) as HTMLSelectElement;
                    void act(() => api.post(`/projects/${r.project}/requests/${r.id}/decide/`, {
                      action: "approve", role: sel.value, note: "Xush kelibsiz",
                    }));
                  }}>Qabul qilish</button>
                  <button className="btn btn-sm btn-danger" onClick={() =>
                    void act(() => api.post(`/projects/${r.project}/requests/${r.id}/decide/`, {
                      action: "reject", note: "Hozircha orin yoq",
                    }))}>Rad etish</button>
                </div>
                {r.message && <div className="tl-detail" style={{ marginTop: 8 }}>{r.message}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 3. Jamoa tarkibi - chiqarib tashlash */}
      {!!active.length && (
        <>
          <div className="divider" />
          <h4 style={{ margin: "0 0 10px" }}>
            Jamoa <span className="badge">{active.length}</span>
          </h4>
          <div className="stack">
            {active.map((m) => (
              <div className="row" key={m.id}
                   style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
                <Avatar user={m.user} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <Link to={`/profil/${m.user.id}`}>{m.user.full_name}</Link>
                  <br />
                  <small className="muted">{m.user.email}</small>
                </div>
                <span className="spacer" />
                <span className="badge">{m.role_display}</span>
                <span className="badge badge-info">{m.load?.open ?? 0} ochiq</span>
                {acc?.can_manage && (
                  isManager(m)
                    ? <span className="badge" title="Menejerni faqat boshqa menejer almashtira oladi">
                        himoyalangan
                      </span>
                    : <button className="btn btn-sm btn-danger" onClick={() => {
                        const note = window.prompt(
                          `${m.user.full_name} jamoadan chiqariladi. Keyingi dasturchi uchun `
                          + "topshiriq eslatmasi (tarixda saqlanadi):", "");
                        if (note === null) return;
                        void act(() => api.post(`/projects/${projectId}/members/${m.id}/`, {
                          action: "remove", handover_note: note,
                        }));
                      }}>Chiqarish</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
