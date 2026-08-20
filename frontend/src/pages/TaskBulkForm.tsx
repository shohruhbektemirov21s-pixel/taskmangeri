import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, DateTimeField, Empty, ErrorMsg, fromDateTimeInput, Loading } from "@/components/ui";
import { toProject, useEntityId, useGo } from "@/nav";
import { tx } from "@/i18n";

export default function TaskBulkForm() {
  const fid = useId();
  const id = useEntityId("project");
  const go = useGo();
  const { meta } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState("");
  const [assignees, setAssignees] = useState<number[]>([]);
  const [f, setF] = useState({
    priority: 2, task_type: "FEATURE", status: "TODO", due_date: "",
    acceptance_criteria: "", required_specialty: "",
  });
  const [distribute, setDistribute] = useState(true);
  const [matchSpec, setMatchSpec] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    void api.get<Project>(`/projects/${id}/`)
      .then((p) => { if (alive) setProject(p); })
      .catch((e) => {
        if (alive) setError(e instanceof ApiError ? e.message : tx("task_bulk_form.loyihani_ochib_bolmadi"));
      });
    return () => { alive = false; };
  }, [id]);

  const titles = lines.split("\n").map((l) => l.trim().replace(/^[-*]\s*/, "")).filter(Boolean);

  const members = (project?.members || []).filter(
    (m) => !f.required_specialty || !matchSpec || m.user.specialty === f.required_specialty
  );

  const selected = members.filter((m) => assignees.includes(m.user.id));

  /** Kim qaysi vazifani oladi - oldindan ko'rsatish */
  const preview = titles.map((t, i) => {
    if (!selected.length) return { title: t, who: ["biriktirilmagan"] };
    const who = distribute
      ? [selected[i % selected.length].user.full_name]
      : selected.map((m) => m.user.full_name);
    return { title: t, who };
  });

  function toggle(uid: number) {
    setAssignees((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/tasks/bulk/", {
        project: Number(id),
        titles,
        assignee_ids: assignees,
        distribute,
        match_by_specialty: matchSpec,
        required_specialty: f.required_specialty,
        priority: Number(f.priority),
        task_type: f.task_type,
        status: f.status,
        due_date: fromDateTimeInput(f.due_date),
        acceptance_criteria: f.acceptance_criteria,
      });
      go(toProject(id, "doska"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("task_bulk_form.vazifalarni_yaratib_bolmadi"));
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
               text={tx("task_bulk_form.bu_sahifa_loyiha_ichidan_ochiladi")}>
          <Link className="btn btn-primary" to="/loyihalar">{tx("common.loyihalarim")}</Link>
        </Empty>
      </div>
    );
  }

  if (!project) return <div className="content"><Loading /></div>;

  // URL orqali kirib qolmasin: vazifa yaratish/tahrirlash - menejer va admin ishi.
  if (!project.access?.can_create_task) {
    return (
      <div className="content">
        <Card title={tx("task_bulk_form.ruxsat_yoq")}>
          <p className="muted" style={{ margin: 0 }}>
            {tx("task_bulk_form.vazifa_yaratish_va_tahrirlash_faqat")}
          </p>
        </Card>
      </div>
    );
  }


  return (
    <>
      <PageHead
        title={<><span className="muted">{project.name} / </span><strong>{tx("task_bulk_form.koplab_vazifa_berish")}</strong></>}
      />
      <div className="content">
        <ErrorMsg error={error} />
        <form onSubmit={submit}>
          <div className="split">
            <div>
              <Card title={tx("task_bulk_form.vazifalar_royxati")}
                    badge={<span className="badge">{titles.length} {tx("common.ta")}</span>}>
                <textarea
                  rows={12}
                  value={lines}
                  onChange={(e) => setLines(e.target.value)}
                  placeholder={tx("task_bulk_form.login_sahifasini_yasash_api_foydalanuvchi")}
                />
              </Card>

              {titles.length > 0 && (
                <Card title={tx("task_bulk_form.taqsimot_koinishi_oldindan")} padded={false}>
                  <div className="table-wrap"><table className="table">
                    <thead><tr><th>#</th><th>{tx("common.vazifa")}</th><th>{tx("task_bulk_form.kimga")}</th></tr></thead>
                    <tbody>
                      {preview.map((p, i) => (
                        <tr key={i}>
                          <td className="muted mono">{i + 1}</td>
                          <td>{p.title}</td>
                          <td>
                            {p.who.map((w) => (
                              <span className="badge" key={w} style={{ marginRight: 4 }}>{w}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </Card>
              )}
            </div>

            <div>
              <Card title={tx("task_bulk_form.kimga_beriladi")}>
                <div className="field">
                  <label htmlFor={`${fid}-0`}>{tx("task_bulk_form.kerakli_mutaxassislik")}</label>
                  <select id={`${fid}-0`} value={f.required_specialty}
                          onChange={(e) => setF({ ...f, required_specialty: e.target.value })}>
                    <option value="">{tx("task_bulk_form.talab_qilinmaydi")}</option>
                    {(meta?.specialties || []).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <label className="row" style={{ fontWeight: 400 }}>
                  <input type="checkbox" checked={matchSpec} style={{ width: "auto", minHeight: 0 }}
                         onChange={(e) => setMatchSpec(e.target.checked)} />
                  {tx("task_bulk_form.faqat_mos_mutaxassislarga_berilsin")}
                </label>
                <label className="row" style={{ fontWeight: 400, marginTop: 8 }}>
                  <input type="checkbox" checked={distribute} style={{ width: "auto", minHeight: 0 }}
                         onChange={(e) => setDistribute(e.target.checked)} />
                  {tx("task_bulk_form.navbat_bilan_taqsimlash_1_task")}
                </label>

                <div className="divider" />
                <div className="stack">
                  {members.map((m) => (
                    <label key={m.id} className="row"
                           style={{
                             fontWeight: 400, cursor: "pointer", padding: "6px 10px",
                             border: "1px solid var(--border)", borderRadius: 6,
                             background: assignees.includes(m.user.id) ? "var(--accent-soft)" : "transparent",
                           }}>
                      <input type="checkbox" style={{ width: "auto", minHeight: 0 }}
                             checked={assignees.includes(m.user.id)}
                             onChange={() => toggle(m.user.id)} />
                      <Avatar user={m.user} size="sm" />
                      <div>
                        <strong style={{ fontSize: 13 }}>{m.user.full_name}</strong>
                        <br /><small className="muted">{m.user.specialty_display}</small>
                      </div>
                    </label>
                  ))}
                  {!members.length && (
                    <p className="muted">{tx("task_bulk_form.bu_yonalishda_jamoada_azo_yoq")}</p>
                  )}
                </div>
              </Card>

              <Card title={tx("task_bulk_form.umumiy_xususiyatlar")}>
                <div className="field">
                  <label htmlFor={`${fid}-1`}>{tx("common.muhimlik")}</label>
                  <select id={`${fid}-1`} value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })}>
                    {(meta?.task_priority || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-2`}>{tx("common.turi")}</label>
                  <select id={`${fid}-2`} value={f.task_type} onChange={(e) => setF({ ...f, task_type: e.target.value })}>
                    {(meta?.task_type || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-3`}>{tx("task_bulk_form.umumiy_muddat")}</label>
                  <DateTimeField id={`${fid}-3`} value={f.due_date}
                                 onChange={(v) => setF({ ...f, due_date: v })} />
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-4`}>{tx("task_bulk_form.umumiy_tayyorlik_mezoni")}</label>
                  <textarea id={`${fid}-4`} rows={3} value={f.acceptance_criteria}
                            onChange={(e) => setF({ ...f, acceptance_criteria: e.target.value })}
                            placeholder={tx("task_bulk_form.hamma_vazifaga_bir_xil_qollaniladi")} />
                </div>
              </Card>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy || !titles.length}>
              {busy ? tx("common.yaratilmoqda") : tx("task_bulk_form.nechta_vazifa_yaratish", { n: titles.length })}
            </button>
            <button type="button" className="btn" onClick={() => go(-1)}>{tx("common.bekor_qilish")}</button>
          </div>
        </form>
      </div>
    </>
  );
}
