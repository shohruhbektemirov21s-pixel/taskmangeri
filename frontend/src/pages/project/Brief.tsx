import { useEffect, useState } from "react";
import { ApiError, api } from "@/api/client";
import type { Brief as BriefType, Project } from "@/api/types";
import { Card, ErrorMsg, Loading, OkMsg, Progress, fmtDateTime } from "@/components/ui";
import { tx } from "@/i18n";

// `hint` faqat tahrirlashdagi placeholder uchun - ko'rish rejimida maslahat
// yozilmaydi, karta faqat to'ldirilgan-to'ldirilmaganini aytadi.
const FIELDS: { key: keyof BriefType; label: string; hint: string; rows: number }[] = [
  { key: "goal", label: tx("project_brief.loyiha_maqsadi"), hint: tx("project_brief.bir_ikki_gapda_nima_uchun"), rows: 3 },
  { key: "tech_stack", label: tx("project_brief.texnologiyalar"), hint: tx("project_brief.django_5_postgresql_react_docker"), rows: 3 },
  { key: "architecture", label: tx("project_brief.arxitektura"), hint: tx("project_brief.papkalar_tuzilishi_asosiy_modullar_integrats"), rows: 5 },
  { key: "pitfalls", label: tx("project_brief.ehtiyot_boling"), hint: tx("project_brief.avval_yol_qoyilgan_xatolar_tuzoqlar"), rows: 4 },
  { key: "contacts", label: tx("project_brief.kim_nima_boyicha_javob_beradi"), hint: tx("project_brief.masalan_tolovlar_sardor_ui_malika"), rows: 3 },
];

export default function Brief({ project, onChange }: { project: Project; onChange: () => void }) {
  const [brief, setBrief] = useState<BriefType | null>(null);
  const [edit, setEdit] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.get<BriefType>(`/projects/${project.id}/brief/`).then((b) => {
      if (!alive) return;
      setBrief(b);
      const v: Record<string, string> = {};
      FIELDS.forEach((f) => { v[f.key as string] = (b[f.key] as string) || ""; });
      setValues(v);
    }).catch((e) => {
      if (alive) setError(e instanceof ApiError ? e.message : tx("project_brief.arxitekturani_ochib_bolmadi"));
    });
    return () => { alive = false; };
  }, [project.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const b = await api.patch<BriefType>(`/projects/${project.id}/brief/`, values);
      setBrief(b);
      setSaved(tx("project_brief.arxitektura_saqlandi"));
      setEdit(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("common.saqlashda_xatolik"));
    } finally {
      setBusy(false);
    }
  }

  if (!brief) return <Loading />;

  return (
    <>
      <ErrorMsg error={error} />
      <OkMsg text={saved} />

      <div className="card mb">
        <div className="card-body">
          <div className="row">
            <div style={{ flex: 1, maxWidth: 320 }}><Progress value={brief.filled_ratio} /></div>
            <span className="muted">{brief.filled_ratio}{tx("project_brief.toldirilgan")}</span>
            <span className="spacer" />
            {brief.updated_by && (
              <small className="muted">
                {tx("project_brief.oxirgi_yangilash")} {brief.updated_by.full_name} · {fmtDateTime(brief.updated_at)}
              </small>
            )}
            {project.access.can_manage && !edit && (
              <button className="btn btn-sm btn-primary" onClick={() => setEdit(true)}>{tx("common.tahrirlash")}</button>
            )}
          </div>
        </div>
      </div>

      {edit ? (
        <form onSubmit={save}>
          <div className="grid grid-2">
            {FIELDS.map((f) => (
              <Card key={String(f.key)} title={f.label}>
                <textarea rows={f.rows} value={values[f.key as string] || ""}
                          placeholder={f.hint}
                          onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
              </Card>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? tx("common.saqlanmoqda") : tx("common.saqlash")}
            </button>
            <button type="button" className="btn" onClick={() => setEdit(false)}>{tx("common.bekor_qilish")}</button>
          </div>
        </form>
      ) : (
        <div className="grid grid-2">
          {FIELDS.map((f) => {
            const value = (brief[f.key] as string) || "";
            return (
              <Card key={String(f.key)} title={f.label}>
                {value.trim() ? (
                  <div className="pre-wrap">{value}</div>
                ) : (
                  <p className="muted">{tx("project_brief.toldirilmagan")}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
