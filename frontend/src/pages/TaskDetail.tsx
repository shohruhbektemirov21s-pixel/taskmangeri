import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, tokens } from "@/api/client";
import type { Activity, Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import Timeline from "@/components/Timeline";
import {
  Avatar, AvatarStack, Card, ErrorMsg, Loading, Priority, StatusBadge,
  fmtDate, fmtDateTime, timeAgo,
} from "@/components/ui";

const FILE_ICON: Record<string, string> = {
  pdf: "PDF", doc: "DOC", docx: "DOC", xls: "XLS", xlsx: "XLS",
  zip: "ZIP", rar: "ZIP", md: "MD", txt: "TXT", json: "JSON",
  log: "LOG", sql: "SQL", py: "PY", js: "JS", ts: "TS",
};

export default function TaskDetail() {
  const { taskId } = useParams();
  const nav = useNavigate();
  const { user, meta } = useAuth();

  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [comment, setComment] = useState("");
  const [log, setLog] = useState({ hours: "1", note: "", work_date: new Date().toISOString().slice(0, 10) });
  const [review, setReview] = useState({ verdict: "APPROVED", comment: "" });
  const [blockReason, setBlockReason] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const t = await api.get<Task>(`/tasks/${taskId}/`);
      setTask(t);
      setHistory(await api.get<Activity[]>(`/tasks/${taskId}/history/`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Vazifani ochib bolmadi");
    }
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Amalni bajarib bolmadi");
    } finally {
      setBusy(false);
    }
  }

  /** Fayllarni yuklash - multipart so'rov */
  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const fd = new FormData();
    list.forEach((f) => fd.append("file", f));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/tasks/${taskId}/attachments/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.access}` },
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new ApiError(res.status, data);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Faylni yuklab bolmadi");
    } finally {
      setBusy(false);
    }
  }

  if (error && !task) return <div className="content"><div className="msg msg-error">{error}</div></div>;
  if (!task) return <div className="content"><Loading /></div>;

  const acc = task.access!;
  const transitions = task.allowed_transitions || [];
  const attachments = task.attachments || [];

  return (
    <>
      <PageHead
        title={
          <>
            <Link className="muted" to={`/loyiha/${task.project}`}>{task.project_name}</Link>
            <span className="muted"> / </span>
            <span className="mono muted">{task.code}</span>{" "}
            <strong>{task.title}</strong>
          </>
        }
        actions={
          <>
            {(acc.can_create_task || task.assignees.some((a) => a.id === user?.id)) && (
              <Link className="btn btn-sm" to={`/vazifa/${task.id}/tahrir`}>Tahrirlash</Link>
            )}
            {acc.can_manage && (
              <button className="btn btn-sm btn-danger" onClick={() => {
                if (!window.confirm(`${task.code} ochirilsinmi?`)) return;
                void run(async () => {
                  await api.delete(`/tasks/${task.id}/`);
                  nav(`/loyiha/${task.project}/vazifalar`);
                });
              }}>Ochirish</button>
            )}
          </>
        }
      />

      <div className="content">
        <ErrorMsg error={error} />

        <div className="row wrap mb">
          <StatusBadge task={task} />
          <Priority task={task} />
          <span className="badge">{task.type_display}</span>
          {task.specialty_label && <span className="badge badge-brand">{task.specialty_label}</span>}
          {task.due_date && (
            <span className={`badge ${task.is_overdue ? "badge-danger" : ""}`}>
              Muddat: {fmtDate(task.due_date)}
            </span>
          )}
          {task.review_round > 0 && (
            <span className="badge badge-info">{task.review_round}-tekshiruv aylanasi</span>
          )}
          {!!attachments.length && <span className="badge">{attachments.length} fayl</span>}
        </div>

        {task.status === "CHANGES_REQUESTED" && task.reviews?.[0] && (
          <div className="callout danger mb">
            <strong>Tuzatish talab qilingan:</strong> {task.reviews[0].comment}
            <br />
            <small className="muted">
              {task.reviews[0].reviewer?.full_name} · {timeAgo(task.reviews[0].created_at)}
            </small>
          </div>
        )}
        {task.status === "BLOCKED" && task.blocked_reason && (
          <div className="callout warn mb"><strong>Toxtab qolgan:</strong> {task.blocked_reason}</div>
        )}

        <div className="split">
          <div>
            <Card title="Nima qilish kerak">
              {task.description ? (
                <div className="pre-wrap">{task.description}</div>
              ) : <p className="muted">Tavsif kiritilmagan.</p>}
            </Card>

            {task.acceptance_criteria && (
              <Card title="Tayyorlik mezoni">
                <div className="callout ok pre-wrap">{task.acceptance_criteria}</div>
              </Card>
            )}

            {/* ------------------------------------------------ FAYLLAR */}
            <Card
              title="Fayllar"
              badge={<span className="badge">{attachments.length}</span>}
              action={acc.can_work && (
                <button className="btn btn-sm" onClick={() => fileInput.current?.click()} disabled={busy}>
                  Fayl qoshish
                </button>
              )}
            >
              <input ref={fileInput} type="file" multiple hidden
                     onChange={(e) => { void uploadFiles(e.target.files || []); e.target.value = ""; }} />

              {acc.can_work && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void uploadFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInput.current?.click()}
                  style={{
                    border: `1px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                    background: dragOver ? "var(--accent-soft)" : "transparent",
                    borderRadius: 8, padding: "18px 14px", textAlign: "center",
                    cursor: "pointer", marginBottom: attachments.length ? 14 : 0,
                  }}
                >
                  <div className="muted" style={{ fontSize: 13 }}>
                    Fayllarni shu yerga tashlang yoki bosing
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Skrinshot, hujjat, log, arxiv — har biri 25 MB gacha
                  </div>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="grid grid-3">
                  {attachments.map((a) => (
                    <div key={a.id} className="card" style={{ background: "var(--canvas-inset)" }}>
                      {a.is_image ? (
                        <a href={a.url} target="_blank" rel="noreferrer">
                          <img src={a.url} alt={a.original_name}
                               style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                        </a>
                      ) : (
                        <a href={a.url} target="_blank" rel="noreferrer"
                           style={{ height: 120, display: "grid", placeItems: "center",
                                    background: "var(--surface)", color: "var(--muted)" }}>
                          <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>
                            {FILE_ICON[a.extension] || a.extension.toUpperCase() || "FILE"}
                          </span>
                        </a>
                      )}
                      <div className="card-body tight">
                        <a href={a.url} target="_blank" rel="noreferrer"
                           style={{ fontSize: 13, wordBreak: "break-all" }}>
                          {a.original_name}
                        </a>
                        <div className="row" style={{ marginTop: 6 }}>
                          <small className="muted">{a.size_display}</small>
                          <span className="spacer" />
                          {(acc.can_manage || a.uploaded_by?.id === user?.id) && (
                            <button className="btn btn-sm btn-ghost" title="Ochirish"
                                    onClick={() => {
                                      if (!window.confirm(`${a.original_name} ochirilsinmi?`)) return;
                                      void run(() => api.delete(`/tasks/${task.id}/attachments/${a.id}/`));
                                    }}>×</button>
                          )}
                        </div>
                        <small className="muted">
                          {a.uploaded_by?.full_name} · {timeAgo(a.created_at)}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!attachments.length && !acc.can_work && <p className="muted">Fayl biriktirilmagan.</p>}
            </Card>

            {/* ------------------------------------------------ IZOHLAR */}
            <Card title="Izohlar" badge={<span className="badge">{task.comments?.length || 0}</span>}>
              <ul className="list-plain">
                {(task.comments || []).map((c) => (
                  <li key={c.id}>
                    <div className="row">
                      <Avatar user={c.author} size="sm" />
                      <strong style={{ fontSize: 13 }}>{c.author?.full_name}</strong>
                      <span className="spacer" />
                      <small className="muted">{timeAgo(c.created_at)}</small>
                    </div>
                    <div className="pre-wrap" style={{ marginTop: 6 }}>{c.body}</div>
                  </li>
                ))}
                {!(task.comments || []).length && <li className="muted">Izoh yoq.</li>}
              </ul>
              <form className="mt" onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                void run(async () => {
                  await api.post(`/tasks/${task.id}/comments/`, { body: comment });
                  setComment("");
                });
              }}>
                <textarea rows={3} value={comment} placeholder="Izoh yozing..."
                          onChange={(e) => setComment(e.target.value)} />
                <div className="form-actions">
                  <button className="btn btn-primary btn-sm" disabled={busy || !comment.trim()}>
                    Izoh qoldirish
                  </button>
                </div>
              </form>
            </Card>

            {/* ------------------------------------------------ ISH JURNALI */}
            {acc.can_work && (
              <Card title="Ish jurnali" badge={<span className="badge">{task.logged_hours} soat</span>}>
                <p className="muted" style={{ fontSize: 13 }}>
                  Nima qilganingizni yozing — keyingi dasturchi shuni oqib kontekstga kiradi.
                </p>
                <ul className="list-plain">
                  {(task.worklogs || []).map((w) => (
                    <li key={w.id}>
                      <div className="row">
                        <Avatar user={w.user} size="sm" />
                        <strong style={{ fontSize: 13 }}>{w.user.full_name}</strong>
                        <span className="badge">{w.hours} soat</span>
                        <span className="spacer" />
                        <small className="muted">{fmtDate(w.work_date)}</small>
                      </div>
                      <div className="pre-wrap" style={{ marginTop: 6 }}>{w.note}</div>
                    </li>
                  ))}
                  {!(task.worklogs || []).length && <li className="muted">Yozuv yoq.</li>}
                </ul>
                <form className="mt" onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api.post(`/tasks/${task.id}/worklogs/`, log);
                    setLog({ ...log, note: "", hours: "1" });
                  });
                }}>
                  <div className="row">
                    <div className="field" style={{ width: 110 }}>
                      <label>Soat</label>
                      <input type="number" step="0.5" min="0" value={log.hours}
                             onChange={(e) => setLog({ ...log, hours: e.target.value })} />
                    </div>
                    <div className="field" style={{ width: 170 }}>
                      <label>Sana</label>
                      <input type="date" value={log.work_date}
                             onChange={(e) => setLog({ ...log, work_date: e.target.value })} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Nima qildingiz</label>
                    <textarea rows={3} value={log.note} required
                              placeholder="Qaysi yechim tanlandi va nima uchun?"
                              onChange={(e) => setLog({ ...log, note: e.target.value })} />
                  </div>
                  <button className="btn btn-sm btn-primary" disabled={busy}>Jurnalga yozish</button>
                </form>
              </Card>
            )}

            <Card title="Vazifa tarixi">
              <Timeline items={history} showProject={false} />
            </Card>
          </div>

          {/* ------------------------------------------------ ONG USTUN */}
          <div>
            {transitions.length > 0 && (
              <Card title="Holatni ozgartirish">
                <div className="stack">
                  {transitions.map((t) => (
                    <button key={t.value} className="btn btn-block" disabled={busy}
                            onClick={() => void run(() => api.post(`/tasks/${task.id}/status/`, {
                              status: t.value,
                              blocked_reason: t.value === "BLOCKED" ? blockReason : "",
                            }))}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {transitions.some((t) => t.value === "BLOCKED") && (
                  <div className="field mt">
                    <label>Toxtash sababi</label>
                    <input value={blockReason} onChange={(e) => setBlockReason(e.target.value)}
                           placeholder="Nega davom eta olmayapsiz?" />
                  </div>
                )}
              </Card>
            )}

            {acc.can_review && task.status === "IN_REVIEW" && (
              <Card title="Tekshiruv">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => api.post(`/tasks/${task.id}/review/`, review));
                }}>
                  <div className="field">
                    <label>Qaror</label>
                    <div className="check-list">
                      {(meta?.review_verdict || []).map((v) => (
                        <label key={v.value} className={review.verdict === v.value ? "on" : ""}>
                          <input type="radio" checked={review.verdict === v.value}
                                 onChange={() => setReview({ ...review, verdict: String(v.value) })} />
                          {v.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label>Izoh</label>
                    <textarea rows={4} value={review.comment}
                              placeholder="Nimani tuzatish kerak - aniq yozing"
                              onChange={(e) => setReview({ ...review, comment: e.target.value })} />
                    <div className="help">Qaytarayotgan bolsangiz izoh majburiy</div>
                  </div>
                  <button className="btn btn-primary btn-block" disabled={busy}>Qarorni saqlash</button>
                </form>
              </Card>
            )}

            <Card title="Maʼlumotlar">
              <ul className="list-plain" style={{ fontSize: 13 }}>
                <li className="row">
                  <span className="muted">Ijrochilar</span><span className="spacer" />
                  <AvatarStack users={task.assignees} />
                </li>
                <li className="row">
                  <span className="muted">Tekshiruvchi</span><span className="spacer" />
                  <span>{task.reviewer?.full_name || "Menejer"}</span>
                </li>
                <li className="row">
                  <span className="muted">Yaratgan</span><span className="spacer" />
                  <span>{task.created_by?.full_name || "—"}</span>
                </li>
                <li className="row">
                  <span className="muted">Yaratilgan</span><span className="spacer" />
                  <span>{fmtDateTime(task.created_at)}</span>
                </li>
                {task.completed_at && (
                  <li className="row">
                    <span className="muted">Yakunlangan</span><span className="spacer" />
                    <span>{fmtDateTime(task.completed_at)}</span>
                  </li>
                )}
                {task.branch_name && (
                  <li className="row">
                    <span className="muted">Branch</span><span className="spacer" />
                    <code>{task.branch_name}</code>
                  </li>
                )}
                {task.pr_url && (
                  <li className="row">
                    <span className="muted">Pull request</span><span className="spacer" />
                    <a href={task.pr_url} target="_blank" rel="noreferrer">ochish</a>
                  </li>
                )}
              </ul>
            </Card>

            {!!task.quality_checklist?.length && (
              <Card title="Topshirishdan oldin tekshiring">
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {task.quality_checklist.map((c: string) => <li key={c}>{c}</li>)}
                </ul>
              </Card>
            )}

            {!!task.mismatched_assignees?.length && acc.can_manage && (
              <Card title="Diqqat">
                <div className="callout warn">
                  Quyidagi ijrochilar mutaxassisligi vazifa talabiga mos emas:{" "}
                  {task.mismatched_assignees.map((u: any) => u.full_name).join(", ")}
                </div>
              </Card>
            )}

            {!!task.reviews?.length && (
              <Card title="Tekshiruvlar tarixi">
                <ul className="list-plain">
                  {task.reviews.map((r) => (
                    <li key={r.id}>
                      <div className="row">
                        <span className={`badge ${r.verdict === "APPROVED" ? "badge-ok" : "badge-warn"}`}>
                          {r.verdict_display}
                        </span>
                        <span className="muted">{r.round_no}-aylana</span>
                        <span className="spacer" />
                        <small className="muted">{timeAgo(r.created_at)}</small>
                      </div>
                      {r.comment && <div className="pre-wrap" style={{ marginTop: 6 }}>{r.comment}</div>}
                      <small className="muted">{r.reviewer?.full_name}</small>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
