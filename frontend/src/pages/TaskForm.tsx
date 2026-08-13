import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Project, Task, UserBrief } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { IconSearch } from "@/components/icons";
import { Avatar, Card, ErrorMsg, Loading } from "@/components/ui";

interface Suggestion {
  user: UserBrief;
  role: string;
  open_tasks: number;
  matches: boolean;
}

export default function TaskForm() {
  const { id, taskId } = useParams();
  const nav = useNavigate();
  const { meta } = useAuth();
  const editing = Boolean(taskId);

  const [project, setProject] = useState<Project | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [assignees, setAssignees] = useState<number[]>([]);
  // Jamoa kattalashganda uzun ro'yxatdan odam topib bo'lmaydi - shuning uchun qidiruv.
  const [who, setWho] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const [f, setF] = useState({
    title: "", description: "", acceptance_criteria: "",
    task_type: "FEATURE", priority: 2, status: "TODO",
    required_specialty: "", due_date: "", estimate_hours: "",
    branch_name: "", pr_url: "", reviewer_id: "",
  });

  const projectId = project?.id ?? id;

  useEffect(() => {
    void (async () => {
      let pid = id;
      if (editing) {
        const t = await api.get<Task>(`/tasks/${taskId}/`);
        pid = String(t.project);
        setF({
          title: t.title, description: t.description, acceptance_criteria: t.acceptance_criteria,
          task_type: t.task_type, priority: t.priority, status: t.status,
          required_specialty: t.required_specialty || "", due_date: t.due_date || "",
          estimate_hours: t.estimate_hours || "", branch_name: t.branch_name,
          pr_url: t.pr_url, reviewer_id: t.reviewer ? String(t.reviewer.id) : "",
        });
        setAssignees(t.assignees.map((a) => a.id));
      }
      setProject(await api.get<Project>(`/projects/${pid}/`));
      setReady(true);
    })();
  }, [id, taskId, editing]);

  useEffect(() => {
    if (!projectId) return;
    void api.get<Suggestion[]>("/tasks/suggest-assignees/", {
      project: projectId, specialty: f.required_specialty,
    }).then(setSuggestions).catch(() => setSuggestions([]));
  }, [projectId, f.required_specialty]);

  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  function toggle(uid: number) {
    setAssignees((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const body: Record<string, unknown> = {
      ...f,
      project: Number(projectId),
      priority: Number(f.priority),
      assignee_ids: assignees,
      due_date: f.due_date || null,
      estimate_hours: f.estimate_hours || null,
      reviewer_id: f.reviewer_id ? Number(f.reviewer_id) : null,
    };
    try {
      const saved = editing
        ? await api.patch<Task>(`/tasks/${taskId}/`, body)
        : await api.post<Task>("/tasks/", body);
      nav(`/vazifa/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else setError("Saqlashda xatolik");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !project) return <div className="content"><Loading /></div>;

  const specialtyInfo = meta?.specialties?.find((s) => s.value === f.required_specialty);

  // Ism, familiya yoki email bo'yicha filtr. Tanlangan a'zo qidiruvdan tushib
  // qolsa ham tanlovi saqlanadi - pastda nechtasi yashiringani aytiladi.
  const needle = who.trim().toLowerCase();
  const shown = needle
    ? suggestions.filter((s) =>
        `${s.user.full_name} ${s.user.email}`.toLowerCase().includes(needle))
    : suggestions;
  const hiddenPicked = assignees.filter(
    (id) => !shown.some((s) => s.user.id === id)).length;

  return (
    <>
      <PageHead
        title={
          <>
            <span className="muted">{project.name} / </span>
            <strong>{editing ? "Vazifani tahrirlash" : "Yangi vazifa"}</strong>
          </>
        }
      />
      <div className="content">
        <ErrorMsg error={error} />
        <form onSubmit={submit}>
          <div className="split">
            <div>
              <Card title="Vazifa mazmuni">
                <div className="field">
                  <label>Sarlavha</label>
                  <input value={f.title} required autoFocus
                         onChange={(e) => set("title", e.target.value)}
                         placeholder="Qisqa va aniq sarlavha" />
                  {errors.title && <div className="err">{errors.title}</div>}
                </div>
                <div className="field">
                  <label>Nima qilish kerak</label>
                  <textarea rows={6} value={f.description}
                            onChange={(e) => set("description", e.target.value)}
                            placeholder="Qayerdan boshlash, qaysi fayllar, qanday yechim kutilmoqda" />
                </div>
                <div className="field">
                  <label>Tayyorlik mezoni</label>
                  <textarea rows={4} value={f.acceptance_criteria}
                            onChange={(e) => set("acceptance_criteria", e.target.value)}
                            placeholder={"- Login ishlaydi\n- Testlar otadi\n- Hujjat yangilandi"} />
                  <div className="help">
                    Aniq royxat yozing — dasturchi nima qilishini bilib, vaqt yoqotmaydi.
                  </div>
                </div>
              </Card>

              <Card title="Ijrochilar"
                    badge={<span className="badge">{assignees.length} tanlangan</span>}>
                {f.required_specialty && (
                  <div className="callout mb">
                    Faqat <b>{specialtyInfo?.label}</b> yonalishidagi aʼzolar korsatilmoqda.
                  </div>
                )}
                <div className="gh-search mb" style={{ width: "100%" }}>
                  <IconSearch size={14} />
                  <input type="search" value={who} placeholder="Ism, familiya yoki email bo'yicha qidiring"
                         onChange={(e) => setWho(e.target.value)} />
                </div>
                <div className="stack">
                  {shown.map((s) => (
                    <label key={s.user.id} className="row"
                           style={{
                             fontWeight: 400, cursor: "pointer", padding: "8px 10px",
                             border: "1px solid var(--border)", borderRadius: 6,
                             background: assignees.includes(s.user.id) ? "var(--accent-soft)" : "transparent",
                           }}>
                      <input type="checkbox" style={{ width: "auto", minHeight: 0 }}
                             checked={assignees.includes(s.user.id)}
                             onChange={() => toggle(s.user.id)} />
                      <Avatar user={s.user} size="sm" />
                      <div>
                        <strong style={{ fontSize: 13 }}>{s.user.full_name}</strong>
                        <br />
                        <small className="muted">
                          {s.user.specialty_display} · {s.user.seniority_display}
                        </small>
                      </div>
                      <span className="spacer" />
                      <span className="badge">{s.open_tasks} ochiq ish</span>
                      {!s.matches && <span className="badge badge-warn">mos emas</span>}
                    </label>
                  ))}
                  {!shown.length && !!suggestions.length && (
                    <p className="muted">«{who}» boyicha hech kim topilmadi.</p>
                  )}
                  {!suggestions.length && (
                    <p className="muted">
                      Bu yonalishda jamoada aʼzo yoq. Avval mos mutaxassisni qoshing.
                    </p>
                  )}
                  {!!hiddenPicked && (
                    <p className="muted" style={{ fontSize: 12 }}>
                      Yana {hiddenPicked} ta tanlangan aʼzo qidiruvdan tashqarida — tanlovi saqlanadi.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            <div>
              <Card title="Xususiyatlar">
                <div className="field">
                  <label>Kerakli mutaxassislik</label>
                  <select value={f.required_specialty}
                          onChange={(e) => set("required_specialty", e.target.value)}>
                    <option value="">Talab qilinmaydi</option>
                    {(meta?.specialties || []).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <div className="help">Belgilansa, faqat mos mutaxassislar tavsiya qilinadi</div>
                </div>
                <div className="field">
                  <label>Turi</label>
                  <select value={f.task_type} onChange={(e) => set("task_type", e.target.value)}>
                    {(meta?.task_type || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Muhimlik</label>
                  <select value={f.priority} onChange={(e) => set("priority", e.target.value)}>
                    {(meta?.task_priority || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Boshlangich holat</label>
                  <select value={f.status} onChange={(e) => set("status", e.target.value)}>
                    {(meta?.task_status || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label>Muddat</label>
                    <input type="date" value={f.due_date}
                           onChange={(e) => set("due_date", e.target.value)} />
                  </div>
                  <div className="field" style={{ width: 120 }}>
                    <label>Reja (soat)</label>
                    <input type="number" step="0.5" value={f.estimate_hours}
                           onChange={(e) => set("estimate_hours", e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>Tekshiruvchi</label>
                  <select value={f.reviewer_id} onChange={(e) => set("reviewer_id", e.target.value)}>
                    <option value="">Menejer tekshiradi</option>
                    {(project.members || []).map((m) => (
                      <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
                    ))}
                  </select>
                </div>
              </Card>

              <Card title="Git">
                <div className="field">
                  <label>Branch</label>
                  <input value={f.branch_name} onChange={(e) => set("branch_name", e.target.value)}
                         placeholder="feature/login" />
                </div>
                <div className="field">
                  <label>Pull request</label>
                  <input value={f.pr_url} onChange={(e) => set("pr_url", e.target.value)}
                         placeholder="https://github.com/..." />
                </div>
              </Card>

              {specialtyInfo && (
                <Card title="Sifat royxati">
                  <p className="muted" style={{ fontSize: 13 }}>
                    {specialtyInfo.label} uchun standart tekshiruvlar:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {specialtyInfo.checklist.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </Card>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saqlanmoqda..." : editing ? "Saqlash" : "Vazifa yaratish"}
            </button>
            <button type="button" className="btn" onClick={() => nav(-1)}>Bekor qilish</button>
          </div>
        </form>
      </div>
    </>
  );
}
