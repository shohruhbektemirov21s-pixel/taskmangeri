import { useId, useState } from "react";
import { ApiError, api } from "@/api/client";
import type { Workspace } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Card, ErrorMsg } from "@/components/ui";
import { toWorkspace, useGo } from "@/nav";
import { tx } from "@/i18n";

export default function WorkspaceForm() {
  const fid = useId();
  const go = useGo();
  const [f, setF] = useState({ name: "", description: "", is_open: true });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ws = await api.post<Workspace>("/workspaces/", f);
      go(toWorkspace(ws.slug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("workspace_form.yaratib_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title={<strong>{tx("workspace_form.yangi_ish_maydoni")}</strong>} />
      <div className="content" style={{ maxWidth: 640 }}>
        <ErrorMsg error={error} />
        <Card title={tx("workspace_form.maydon_malumotlari")}>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor={`${fid}-0`}>{tx("workspace_form.nomi")}</label>
              <input id={`${fid}-0`} value={f.name} required autoFocus
                     onChange={(e) => setF({ ...f, name: e.target.value })}
                     placeholder={tx("workspace_form.masalan_aloqa_bank_it")} />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-1`}>{tx("workspace_form.tavsif")}</label>
              <textarea id={`${fid}-1`} rows={3} value={f.description}
                        onChange={(e) => setF({ ...f, description: e.target.value })}
                        placeholder={tx("workspace_form.jamoa_nima_bilan_shugullanadi")} />
            </div>
            <label className="row" style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={f.is_open} style={{ width: "auto", minHeight: 0 }}
                     onChange={(e) => setF({ ...f, is_open: e.target.checked })} />
              {tx("workspace_form.ochiq_qoshilish_kodisiz_qoshilsa_boladi")}
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                {busy ? tx("common.yaratilmoqda") : tx("workspace_form.yaratish")}
              </button>
              <button type="button" className="btn" onClick={() => go(-1)}>{tx("common.bekor_qilish")}</button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
