import { useEffect, useState } from "react";
import { ApiError, api } from "@/api/client";
import type { Brief as BriefType, Project } from "@/api/types";
import { Card, ErrorMsg, Loading, OkMsg, Progress, fmtDateTime } from "@/components/ui";

// `hint` faqat tahrirlashdagi placeholder uchun - ko'rish rejimida maslahat
// yozilmaydi, karta faqat to'ldirilgan-to'ldirilmaganini aytadi.
const FIELDS: { key: keyof BriefType; label: string; hint: string; rows: number }[] = [
  { key: "goal", label: "Loyiha maqsadi", hint: "Bir-ikki gapda: nima uchun bu loyiha bor", rows: 3 },
  { key: "tech_stack", label: "Texnologiyalar", hint: "Django 5, PostgreSQL, React, Docker ...", rows: 3 },
  { key: "architecture", label: "Arxitektura", hint: "Papkalar tuzilishi, asosiy modullar, integratsiyalar", rows: 5 },
  { key: "setup_steps", label: "Ishga tushirish", hint: "docker compose up --build kabi qadamlar", rows: 5 },
  { key: "conventions", label: "Kelishuvlar", hint: "Kod uslubi, branch nomlash, commit qoidalari, PR jarayoni", rows: 4 },
  { key: "definition_of_done", label: "Umumiy tayyorlik mezoni", hint: "Har bir vazifa qachon tugagan hisoblanadi", rows: 4 },
  { key: "pitfalls", label: "Ehtiyot boling", hint: "Avval yol qoyilgan xatolar, tuzoqlar", rows: 4 },
  { key: "contacts", label: "Kim nima boyicha javob beradi", hint: "Masalan: tolovlar - Sardor, UI - Malika", rows: 3 },
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
      if (alive) setError(e instanceof ApiError ? e.message : "Brifni ochib bo'lmadi.");
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
      setSaved("Brif saqlandi.");
      setEdit(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Saqlashda xatolik");
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
            <span className="muted">{brief.filled_ratio}% toldirilgan</span>
            <span className="spacer" />
            {brief.updated_by && (
              <small className="muted">
                Oxirgi yangilash: {brief.updated_by.full_name} · {fmtDateTime(brief.updated_at)}
              </small>
            )}
            {project.access.can_manage && !edit && (
              <button className="btn btn-sm btn-primary" onClick={() => setEdit(true)}>Tahrirlash</button>
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
              {busy ? "Saqlanmoqda..." : "Saqlash"}
            </button>
            <button type="button" className="btn" onClick={() => setEdit(false)}>Bekor qilish</button>
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
                  <p className="muted">Toldirilmagan</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
