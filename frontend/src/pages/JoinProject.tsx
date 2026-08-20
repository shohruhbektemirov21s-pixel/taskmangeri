import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, Empty, ErrorMsg, Loading, SpecialtyTag } from "@/components/ui";
import { toProject, useEntityId, useGo } from "@/nav";
import { tx } from "@/i18n";

export default function JoinProject() {
  const fid = useId();
  const id = useEntityId("project");
  const go = useGo();
  const { user, meta } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    void api.get<Project>(`/projects/${id}/`).then((p) => {
      if (!alive) return;
      setProject(p);
      setRole(user?.default_project_role || "DEVELOPER");
    }).catch(() => { if (alive) setError(tx("join_project.loyihani_ochib_bolmadi")); });
    return () => { alive = false; };
  }, [id, user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<any>(`/projects/${id}/join/`, {
        message, desired_role: role, code,
      });
      if (res.joined) go(toProject(id, "kirish"));
      else go("/qoshilish");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("join_project.sorov_yuborishda_xatolik"));
    } finally {
      setBusy(false);
    }
  }

  // Manzilda loyiha raqami saqlanmaydi - havolani qo'lda ochgan odam shu
  // yerga tushadi. Oq ekran emas, chiqish yo'li ko'rsatiladi.
  if (!id) {
    return (
      <div className="content">
        <Empty title={tx("common.loyiha_tanlanmagan")}
               text={tx("join_project.bu_sahifa_loyiha_ichidan_ochiladi")}>
          <Link className="btn btn-primary" to="/loyihalar">{tx("common.loyihalarim")}</Link>
        </Empty>
      </div>
    );
  }

  if (!project) return <div className="content"><Loading /></div>;

  const roles = (meta?.project_role || []).filter((r) => r.value !== "MANAGER");

  return (
    <>
      <PageHead title={<><span className="muted">{tx("join_project.qoshilish")} </span><strong>{project.name}</strong></>} />
      <div className="content">
        <div className="split">
          <Card title={tx("join_project.qoshilish_sorovi")}>
            <ErrorMsg error={error} />
            <form onSubmit={submit}>
              <div className="field">
                <span className="lbl">{tx("join_project.sizning_yonalishingiz")}</span>
                <div className="row"><SpecialtyTag user={user} /><span className="muted">{user?.seniority_display}</span></div>
              </div>
              <div className="field">
                <label htmlFor={`${fid}-0`}>{tx("join_project.istagan_rol")}</label>
                <select id={`${fid}-0`} value={role} onChange={(e) => setRole(e.target.value)}>
                  {roles.map((r) => <option key={r.value} value={String(r.value)}>{r.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${fid}-1`}>{tx("join_project.xabar")}</label>
                <textarea id={`${fid}-1`} rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
                          placeholder={tx("join_project.qanday_tajribangiz_bor_loyihaga_nima")} />
              </div>
              {!project.is_public && (
                <div className="field">
                  <label htmlFor={`${fid}-2`}>{tx("join_project.qoshilish_kodi")}</label>
                  <input id={`${fid}-2`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="A1B2C3D4" />
                </div>
              )}
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? tx("join_project.yuborilmoqda") : tx("join_project.sorov_yuborish")}
              </button>
            </form>
          </Card>

          <div>
            <Card title={tx("common.loyiha_haqida")}>
              <p className="muted">{project.description || tx("join_project.tavsif_kiritilmagan")}</p>
              <div className="divider" />
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="badge mono">{project.key}</span>
                <span className="badge">{project.member_count} {tx("common.azo")}</span>
                <span className="badge">{project.open_tasks} {tx("common.ochiq_vazifa")}</span>
              </div>
              {project.auto_accept && (
                <div className="callout ok mt">{tx("join_project.bu_loyiha_sorovlarni_avtomatik_qabul")}</div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
