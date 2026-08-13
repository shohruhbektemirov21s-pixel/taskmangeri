import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, ErrorMsg, Loading, SpecialtyTag } from "@/components/ui";

export default function JoinProject() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, meta } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.get<Project>(`/projects/${id}/`).then((p) => {
      setProject(p);
      setRole(user?.default_project_role || "DEVELOPER");
    }).catch(() => setError("Loyihani ochib bolmadi"));
  }, [id, user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<any>(`/projects/${id}/join/`, {
        message, desired_role: role, code,
      });
      if (res.joined) nav(`/loyiha/${id}/kirish`);
      else nav("/qoshilish");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sorov yuborishda xatolik");
    } finally {
      setBusy(false);
    }
  }

  if (!project) return <div className="content"><Loading /></div>;

  const roles = (meta?.project_role || []).filter((r) => r.value !== "MANAGER");

  return (
    <>
      <PageHead title={<><span className="muted">Qoshilish / </span><strong>{project.name}</strong></>} />
      <div className="content">
        <div className="split">
          <Card title="Qoshilish sorovi">
            <ErrorMsg error={error} />
            <form onSubmit={submit}>
              <div className="field">
                <label>Sizning yonalishingiz</label>
                <div className="row"><SpecialtyTag user={user} /><span className="muted">{user?.seniority_display}</span></div>
              </div>
              <div className="field">
                <label>Istagan rol</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {roles.map((r) => <option key={r.value} value={String(r.value)}>{r.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Xabar</label>
                <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
                          placeholder="Qanday tajribangiz bor, loyihaga nima qoshasiz?" />
              </div>
              {!project.is_public && (
                <div className="field">
                  <label>Taklif kodi</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A1B2C3D4" />
                </div>
              )}
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "Yuborilmoqda..." : "Sorov yuborish"}
              </button>
            </form>
          </Card>

          <div>
            <Card title="Loyiha haqida">
              <p className="muted">{project.description || "Tavsif kiritilmagan"}</p>
              <div className="divider" />
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="badge mono">{project.key}</span>
                <span className="badge">{project.member_count} azo</span>
                <span className="badge">{project.open_tasks} ochiq vazifa</span>
              </div>
              {project.auto_accept && (
                <div className="callout ok mt">Bu loyiha sorovlarni avtomatik qabul qiladi.</div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
