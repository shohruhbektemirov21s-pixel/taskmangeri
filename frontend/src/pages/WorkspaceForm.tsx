import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Workspace } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Card, ErrorMsg } from "@/components/ui";

export default function WorkspaceForm() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", description: "", color: "#2f81f7", is_open: true });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ws = await api.post<Workspace>("/workspaces/", f);
      nav(`/ish-maydoni/${ws.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Yaratib bolmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title={<strong>Yangi ish maydoni</strong>} />
      <div className="content" style={{ maxWidth: 640 }}>
        <ErrorMsg error={error} />
        <div className="callout mb">
          Ish maydoni — GitHub organization ekvivalenti. Loyihalar shu maydon ichida joylashadi.
        </div>
        <Card title="Maydon maʼlumotlari">
          <form onSubmit={submit}>
            <div className="field">
              <label>Nomi</label>
              <input value={f.name} required autoFocus
                     onChange={(e) => setF({ ...f, name: e.target.value })}
                     placeholder="Masalan: Aloqa Bank IT" />
            </div>
            <div className="field">
              <label>Tavsif</label>
              <textarea rows={3} value={f.description}
                        onChange={(e) => setF({ ...f, description: e.target.value })}
                        placeholder="Jamoa nima bilan shugullanadi" />
            </div>
            <div className="field" style={{ width: 120 }}>
              <label>Rang</label>
              <input type="color" value={f.color}
                     onChange={(e) => setF({ ...f, color: e.target.value })} />
            </div>
            <label className="row" style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={f.is_open} style={{ width: "auto", minHeight: 0 }}
                     onChange={(e) => setF({ ...f, is_open: e.target.checked })} />
              Ochiq — taklif kodisiz qoshilsa boladi
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Yaratilmoqda..." : "Yaratish"}
              </button>
              <button type="button" className="btn" onClick={() => nav(-1)}>Bekor qilish</button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
