import { useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, ErrorMsg, Loading, fromDateTimeInput } from "@/components/ui";

export default function TaskBulkForm() {
  const fid = useId();
  const { id } = useParams();
  const nav = useNavigate();
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
    let alive = true;
    void api.get<Project>(`/projects/${id}/`)
      .then((p) => { if (alive) setProject(p); })
      .catch((e) => {
        if (alive) setError(e instanceof ApiError ? e.message : "Loyihani ochib bo'lmadi.");
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
      nav(`/loyiha/${id}/doska`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Vazifalarni yaratib bolmadi");
    } finally {
      setBusy(false);
    }
  }

  if (!project) return <div className="content"><Loading /></div>;

  // URL orqali kirib qolmasin: vazifa yaratish/tahrirlash - menejer va admin ishi.
  if (!project.access?.can_create_task) {
    return (
      <div className="content">
        <Card title="Ruxsat yoq">
          <p className="muted" style={{ margin: 0 }}>
            Vazifa yaratish va tahrirlash faqat loyiha menejeri va adminda.
            Sizga biriktirilgan ishni «Mening ishim» bolimidan bajarasiz.
          </p>
        </Card>
      </div>
    );
  }


  return (
    <>
      <PageHead
        title={<><span className="muted">{project.name} / </span><strong>Koplab vazifa berish</strong></>}
      />
      <div className="content">
        <ErrorMsg error={error} />
        <form onSubmit={submit}>
          <div className="split">
            <div>
              <Card title="Vazifalar royxati"
                    badge={<span className="badge">{titles.length} ta</span>}>
                <textarea
                  rows={12}
                  value={lines}
                  onChange={(e) => setLines(e.target.value)}
                  placeholder={"Login sahifasini yasash\nAPI: foydalanuvchi royxati\nDocker konfiguratsiyani sozlash"}
                />
              </Card>

              {titles.length > 0 && (
                <Card title="Taqsimot koinishi (oldindan)" padded={false}>
                  <div className="table-wrap"><table className="table">
                    <thead><tr><th>#</th><th>Vazifa</th><th>Kimga</th></tr></thead>
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
              <Card title="Kimga beriladi">
                <div className="field">
                  <label htmlFor={`${fid}-0`}>Kerakli mutaxassislik</label>
                  <select id={`${fid}-0`} value={f.required_specialty}
                          onChange={(e) => setF({ ...f, required_specialty: e.target.value })}>
                    <option value="">Talab qilinmaydi</option>
                    {(meta?.specialties || []).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <label className="row" style={{ fontWeight: 400 }}>
                  <input type="checkbox" checked={matchSpec} style={{ width: "auto", minHeight: 0 }}
                         onChange={(e) => setMatchSpec(e.target.checked)} />
                  Faqat mos mutaxassislarga berilsin
                </label>
                <label className="row" style={{ fontWeight: 400, marginTop: 8 }}>
                  <input type="checkbox" checked={distribute} style={{ width: "auto", minHeight: 0 }}
                         onChange={(e) => setDistribute(e.target.checked)} />
                  Navbat bilan taqsimlash (1-task 1-odamga)
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
                    <p className="muted">Bu yonalishda jamoada aʼzo yoq.</p>
                  )}
                </div>
              </Card>

              <Card title="Umumiy xususiyatlar">
                <div className="field">
                  <label htmlFor={`${fid}-1`}>Muhimlik</label>
                  <select id={`${fid}-1`} value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })}>
                    {(meta?.task_priority || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-2`}>Turi</label>
                  <select id={`${fid}-2`} value={f.task_type} onChange={(e) => setF({ ...f, task_type: e.target.value })}>
                    {(meta?.task_type || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-3`}>Umumiy muddat</label>
                  <input id={`${fid}-3`} type="datetime-local" value={f.due_date}
                         onChange={(e) => setF({ ...f, due_date: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-4`}>Umumiy tayyorlik mezoni</label>
                  <textarea id={`${fid}-4`} rows={3} value={f.acceptance_criteria}
                            onChange={(e) => setF({ ...f, acceptance_criteria: e.target.value })}
                            placeholder="Hamma vazifaga bir xil qollaniladi" />
                </div>
              </Card>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy || !titles.length}>
              {busy ? "Yaratilmoqda..." : `${titles.length} ta vazifa yaratish`}
            </button>
            <button type="button" className="btn" onClick={() => nav(-1)}>Bekor qilish</button>
          </div>
        </form>
      </div>
    </>
  );
}
