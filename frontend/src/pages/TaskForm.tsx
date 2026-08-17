import { useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Project, Task, UserBrief } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import { IconSearch } from "@/components/icons";
import { Avatar, Card, DateTimeField, ErrorMsg, Loading, fromDateTimeInput, toDateTimeInput }
  from "@/components/ui";

interface Suggestion {
  user: UserBrief;
  role: string;
  open_tasks: number;
  matches: boolean;
}

export default function TaskForm() {
  const fid = useId();
  const { id, taskId } = useParams();
  const nav = useNavigate();
  const { meta } = useAuth();
  const editing = Boolean(taskId);

  const [project, setProject] = useState<Project | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [assignees, setAssignees] = useState<number[]>([]);
  // Jamoa kattalashganda uzun ro'yxatdan odam topib bo'lmaydi - shuning uchun qidiruv.
  const [who, setWho] = useState("");
  // Fayllar vazifa yaratilgandan keyin biriktiriladi - avval id kerak.
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const [f, setF] = useState({
    title: "", description: "", acceptance_criteria: "",
    task_type: "FEATURE", priority: 2, status: "TODO",
    required_specialty: "", start_date: "", due_date: "",
    reviewer_id: "",
  });

  const projectId = project?.id ?? id;

  useEffect(() => {
    let alive = true;
    void (async () => {
      let pid = id;
      if (editing) {
        const t = await api.get<Task>(`/tasks/${taskId}/`);
        if (!alive) return;
        pid = String(t.project);
        setF({
          title: t.title, description: t.description, acceptance_criteria: t.acceptance_criteria,
          task_type: t.task_type, priority: t.priority, status: t.status,
          required_specialty: t.required_specialty || "",
          start_date: toDateTimeInput(t.start_date),
          due_date: toDateTimeInput(t.due_date),
          reviewer_id: t.reviewer ? String(t.reviewer.id) : "",
        });
        setAssignees(t.assignees.map((a) => a.id));
      }
      const p = await api.get<Project>(`/projects/${pid}/`);
      if (!alive) return;
      setProject(p);
      setReady(true);
    })().catch((e) => {
      // Xato ushlanmasa sahifa abadiy "Yuklanmoqda" da qolardi.
      if (alive) setError(e instanceof ApiError ? e.message : "Vazifani ochib bo'lmadi.");
    });
    return () => { alive = false; };
  }, [id, taskId, editing]);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    void api.get<Suggestion[]>("/tasks/suggest-assignees/", {
      project: projectId, specialty: f.required_specialty,
    })
      .then((d) => { if (alive) setSuggestions(d); })
      .catch(() => { if (alive) setSuggestions([]); });
    return () => { alive = false; };
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
      start_date: fromDateTimeInput(f.start_date),
      due_date: fromDateTimeInput(f.due_date),
      reviewer_id: f.reviewer_id ? Number(f.reviewer_id) : null,
    };
    try {
      const saved = editing
        ? await api.patch<Task>(`/tasks/${taskId}/`, body)
        : await api.post<Task>("/tasks/", body);

      // Vazifa saqlandi. Fayl yuklanmasa ham vazifa yo'qolmasin - odam
      // vazifa sahifasida fayllarni qayta biriktira oladi.
      if (files.length) {
        try {
          await uploadFiles(`/tasks/${saved.id}/attachments/`, files);
        } catch {
          setBusy(false);
          setError("Vazifa yaratildi, lekin fayllarni biriktirib bolmadi — "
                   + "ularni vazifa sahifasidan qayta yuklang.");
          nav(`/vazifa/${saved.id}`);
          return;
        }
      }
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
                  <label htmlFor={`${fid}-0`}>Sarlavha</label>
                  <input id={`${fid}-0`} value={f.title} required autoFocus
                         onChange={(e) => set("title", e.target.value)}
                         placeholder="Qisqa va aniq sarlavha" />
                  {errors.title && <div className="err">{errors.title}</div>}
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-1`}>Nima qilish kerak</label>
                  <textarea id={`${fid}-1`} rows={6} value={f.description}
                            onChange={(e) => set("description", e.target.value)}
                            placeholder="Qayerdan boshlash, qaysi fayllar, qanday yechim kutilmoqda" />
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-2`}>Tayyorlik mezoni</label>
                  <textarea id={`${fid}-2`} rows={4} value={f.acceptance_criteria}
                            onChange={(e) => set("acceptance_criteria", e.target.value)}
                            placeholder={"- Login ishlaydi\n- Testlar otadi\n- Hujjat yangilandi"} />
                </div>
              </Card>

              <Card title="Ijrochilar"
                    badge={<span className="badge">{assignees.length} tanlangan</span>}>
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

              {/* Tahrirlashda fayllar vazifa sahifasida boshqariladi - bu yerda
                  faqat yangi vazifaga biriktiriladigan boshlangich fayllar. */}
              {!editing && (
                <Card title="Fayllar">
                  <FilePicker files={files} onChange={setFiles} />
                </Card>
              )}
            </div>

            <div>
              <Card title="Xususiyatlar">
                <div className="field">
                  <label htmlFor={`${fid}-3`}>Kerakli mutaxassislik</label>
                  <select id={`${fid}-3`} value={f.required_specialty}
                          onChange={(e) => set("required_specialty", e.target.value)}>
                    <option value="">Talab qilinmaydi</option>
                    {(meta?.specialties || []).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-4`}>Turi</label>
                  <select id={`${fid}-4`} value={f.task_type} onChange={(e) => set("task_type", e.target.value)}>
                    {(meta?.task_type || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-5`}>Muhimlik</label>
                  <select id={`${fid}-5`} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
                    {(meta?.task_priority || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-6`}>Boshlangich holat</label>
                  <select id={`${fid}-6`} value={f.status} onChange={(e) => set("status", e.target.value)}>
                    {(meta?.task_status || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                {/* Ish oynasi yonma-yon: "qachondan - qachongacha" bir qarashda
                    o'qiladi. Tor ekranda pastma-past tushadi. */}
                <div className="row wrap">
                  <div className="field" style={{ flex: 1, minWidth: 190 }}>
                    <label htmlFor={`${fid}-7`}>Boshlanish</label>
                    <DateTimeField id={`${fid}-7`} value={f.start_date}
                                   max={f.due_date || undefined}
                                   onChange={(v) => set("start_date", v)} />
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: 190 }}>
                    <label htmlFor={`${fid}-9`}>Muddat</label>
                    {/* min: muddat boshlanishdan oldin bo'lib qolmasin */}
                    <DateTimeField id={`${fid}-9`} value={f.due_date}
                                   min={f.start_date || undefined}
                                   onChange={(v) => set("due_date", v)} />
                    {errors.due_date && <div className="err">{errors.due_date}</div>}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-8`}>Tekshiruvchi</label>
                  <select id={`${fid}-8`} value={f.reviewer_id} onChange={(e) => set("reviewer_id", e.target.value)}>
                    <option value="">Menejer tekshiradi</option>
                    {(project.members || []).map((m) => (
                      <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
                    ))}
                  </select>
                </div>
              </Card>

              {specialtyInfo && (
                <Card title="Sifat royxati">
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
