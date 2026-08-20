import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Activity, ProjectMember, Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import TaskSubmission from "@/components/TaskSubmission";
import Timeline from "@/components/Timeline";
import { useRealtime } from "@/realtime/RealtimeContext";
import { Avatar, AvatarStack, Card, DateField, DateTimeField, ErrorMsg, fmtDate, fmtDateTime, fromDateTimeInput, Loading, Priority, StatusBadge, timeAgo, toDateTimeInput, todayInTz } from "@/components/ui";
import { confirmDialog } from "@/components/Confirm";
import { toProject, toTaskEdit, useEntityId, useGo } from "@/nav";
import { tx } from "@/i18n";

const FILE_ICON: Record<string, string> = {
  pdf: "PDF", doc: "DOC", docx: "DOC", xls: "XLS", xlsx: "XLS",
  zip: "ZIP", rar: "ZIP", md: "MD", txt: "TXT", json: "JSON",
  log: "LOG", sql: "SQL", py: "PY", js: "JS", ts: "TS",
};

export default function TaskDetail() {
  const fid = useId();
  const taskId = useEntityId("task");
  const go = useGo();
  const { user, meta } = useAuth();
  const { subscribe } = useRealtime();

  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [comment, setComment] = useState("");
  const [log, setLog] = useState({ hours: "1", note: "", work_date: todayInTz() });
  const [review, setReview] = useState({ verdict: "APPROVED", comment: "" });
  const [blockReason, setBlockReason] = useState("");
  const [editDue, setEditDue] = useState(false);
  const [due, setDue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Ishni boshqa odamga o'tkazish: jamoa ro'yxati, kimga va nega.
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [handTo, setHandTo] = useState("");
  const [handNote, setHandNote] = useState("");

  const load = useCallback(async () => {
    try {
      const t = await api.get<Task>(`/tasks/${taskId}/`);
      setTask(t);
      setHistory(await api.get<Activity[]>(`/tasks/${taskId}/history/`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("task_detail.vazifani_ochib_bolmadi"));
    }
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  // Jamoa ro'yxati faqat vazifani boshqara oladigan odamga kerak - o'tkazish
  // kartasidagi tanlov uchun. Boshqalarga ortiqcha so'rov ketmaydi.
  const projectId = task?.project;
  const canReassign = Boolean(task?.access?.can_create_task);
  useEffect(() => {
    if (!projectId || !canReassign) return;
    let alive = true;
    void (async () => {
      try {
        const rows = listOf<ProjectMember>(await api.get<any>(`/projects/${projectId}/members/`));
        if (alive) setMembers(rows.filter((m) => m.is_active));
      } catch {
        // Ro'yxat kelmasa karta bo'sh turadi - vazifaning o'zi ochilaveradi.
      }
    })();
    return () => { alive = false; };
  }, [projectId, canReassign]);

  // Shu vazifaga tegilsa (izoh, holat, tekshiruv) - sahifa o'zi yangilanadi.
  useEffect(() => subscribe((d) => {
    if (d.event === "task.update" && String(d.task) === String(taskId)) void load();
  }), [subscribe, load, taskId]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("common.amalni_bajarib_bolmadi"));
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
      // `api.post` - xom `fetch` emas: 401 da token o'zi yangilanadi.
      await api.post(`/tasks/${taskId}/attachments/`, fd);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("task_detail.faylni_yuklab_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  if (error && !task) return <div className="content"><div className="msg msg-error">{error}</div></div>;
  if (!task) return <div className="content"><Loading /></div>;

  const acc = task.access!;
  // Muddatni menejer (yoki ijrochining o'zi) qo'yadi - tahrirlash huquqi bilan bir xil.
  // Vazifa mazmunini faqat menejer va admin o'zgartiradi (serverda ham shunday).
  const canEdit = acc.can_create_task;
  const transitions = task.allowed_transitions || [];
  const attachments = task.attachments || [];

  return (
    <>
      <PageHead
        title={
          <>
            <Link className="muted" {...toProject(task.project)}>{task.project_name}</Link>
            <span className="muted"> / </span>
            <span className="mono muted">{task.code}</span>{" "}
            <strong>{task.title}</strong>
          </>
        }
        actions={
          <>
            {canEdit && (
              <Link className="btn btn-sm" {...toTaskEdit(task.id)}>{tx("common.tahrirlash")}</Link>
            )}
            {acc.can_manage && (
              <button className="btn btn-sm btn-danger" onClick={() => void (async () => {
                const ok = await confirmDialog({
                  title: tx("task_detail.vazifa_ochirilsinmi", { kod: task.code }),
                  body: tx("task_detail.vazifa_ochirish_izohi", { nom: task.title }),
                  confirmText: tx("common.ochirish"),
                  danger: true,
                });
                if (!ok) return;
                await run(async () => {
                  await api.delete(`/tasks/${task.id}/`);
                  go(toProject(task.project, "vazifalar"));
                });
              })()}>{tx("common.ochirish_2")}</button>
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
          {task.start_date && (
            <span className="badge">{tx("task_detail.boshlanish")} {fmtDateTime(task.start_date)}</span>
          )}
          {task.due_date && !editDue && (
            <span className={`badge ${task.is_overdue ? "badge-danger" : ""}`}>
              {tx("task_detail.muddat")} {fmtDateTime(task.due_date)}
            </span>
          )}
          {/* Muddatni shu yerning o'zida qo'yish - vazifa formasiga o'tmasdan.
              Soat bilan: "13.08.2026 13:00 gacha tugatilsin". */}
          {canEdit && (editDue ? (
            <span className="row" style={{ gap: 6 }}>
              <DateTimeField style={{ width: 210 }} value={due} onChange={setDue} />
              <button className="btn btn-sm btn-primary" onClick={() => void run(async () => {
                await api.patch(`/tasks/${task.id}/`, { due_date: fromDateTimeInput(due) });
                setEditDue(false);
              })}>{tx("common.saqlash")}</button>
              <button className="btn btn-sm" onClick={() => setEditDue(false)}>{tx("task_detail.bekor")}</button>
            </span>
          ) : (
            <button className="btn btn-sm" onClick={() => {
              setDue(toDateTimeInput(task.due_date));
              setEditDue(true);
            }}>
              {task.due_date ? tx("task_detail.muddatni_ozgartirish") : tx("task_detail.muddat_qoyish")}
            </button>
          ))}
          {task.review_round > 0 && (
            <span className="badge badge-info">{task.review_round}{tx("task_detail.tekshiruv_aylanasi")}</span>
          )}
          {!!attachments.length && <span className="badge">{attachments.length} {tx("task_detail.fayl")}</span>}
        </div>

        {task.status === "CHANGES_REQUESTED" && task.reviews?.[0] && (
          <div className="callout danger mb">
            <strong>{tx("task_detail.tuzatish_talab_qilingan")}</strong> {task.reviews[0].comment}
            <br />
            <small className="muted">
              {task.reviews[0].reviewer?.full_name} · {timeAgo(task.reviews[0].created_at)}
            </small>
          </div>
        )}
        {task.status === "BLOCKED" && task.blocked_reason && (
          <div className="callout warn mb"><strong>{tx("task_detail.toxtab_qolgan")}</strong> {task.blocked_reason}</div>
        )}

        <div className="split">
          <div>
            <Card title={tx("task_detail.nima_qilish_kerak")}>
              {task.description ? (
                <div className="pre-wrap">{task.description}</div>
              ) : <p className="muted">{tx("common.tavsif_kiritilmagan")}</p>}
            </Card>

            {task.acceptance_criteria && (
              <Card title={tx("common.tayyorlik_mezoni")}>
                <div className="callout ok pre-wrap">{task.acceptance_criteria}</div>
              </Card>
            )}

            {/* ------------------------------------------------ FAYLLAR */}
            <Card
              title={tx("task_detail.fayllar")}
              badge={<span className="badge">{attachments.length}</span>}
              action={acc.can_work && (
                <button className="btn btn-sm" onClick={() => fileInput.current?.click()} disabled={busy}>
                  {tx("task_detail.fayl_qoshish")}
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
                    {tx("task_detail.fayllarni_shu_yerga_tashlang_yoki")}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {tx("task_detail.skrinshot_hujjat_log_arxiv_har")}
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
                            <button className="btn btn-sm btn-ghost" title={tx("common.ochirish_2")}
                                    onClick={() => void (async () => {
                                      const ok = await confirmDialog({
                                        title: `«${a.original_name}» o'chirilsinmi?`,
                                        body: "Fayl vazifadan butunlay olib tashlanadi.",
                                        confirmText: tx("common.ochirish"),
                                        danger: true,
                                      });
                                      if (!ok) return;
                                      await run(() => api.delete(
                                        `/tasks/${task.id}/attachments/${a.id}/`));
                                    })()}>×</button>
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
              {!attachments.length && !acc.can_work && <p className="muted">{tx("task_detail.fayl_biriktirilmagan")}</p>}
            </Card>

            {/* ------------------------------------------------ IZOHLAR */}
            <TaskSubmission task={task} canWork={acc.can_work} onChange={() => void load()} />

            <Card title={tx("task_detail.izohlar")} badge={<span className="badge">{task.comments?.length || 0}</span>}>
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
                {!(task.comments || []).length && <li className="muted">{tx("task_detail.izoh_yoq")}</li>}
              </ul>
              <form className="mt" onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                void run(async () => {
                  await api.post(`/tasks/${task.id}/comments/`, { body: comment });
                  setComment("");
                });
              }}>
                <textarea rows={3} value={comment} placeholder={tx("task_detail.izoh_yozing")}
                          onChange={(e) => setComment(e.target.value)} />
                <div className="form-actions">
                  <button className="btn btn-primary btn-sm" disabled={busy || !comment.trim()}>
                    {tx("task_detail.izoh_qoldirish")}
                  </button>
                </div>
              </form>
            </Card>

            {/* ------------------------------------------------ ISH JURNALI */}
            {acc.can_work && (
              <Card title={tx("task_detail.ish_jurnali")} badge={<span className="badge">{task.logged_hours} {tx("common.soat")}</span>}>
                <p className="muted" style={{ fontSize: 13 }}>
                  {tx("task_detail.nima_qilganingizni_yozing_keyingi_dasturchi")}
                </p>
                <ul className="list-plain">
                  {(task.worklogs || []).map((w) => (
                    <li key={w.id}>
                      <div className="row">
                        <Avatar user={w.user} size="sm" />
                        <strong style={{ fontSize: 13 }}>{w.user.full_name}</strong>
                        <span className="badge">{w.hours} {tx("common.soat")}</span>
                        <span className="spacer" />
                        <small className="muted">{fmtDate(w.work_date)}</small>
                      </div>
                      <div className="pre-wrap" style={{ marginTop: 6 }}>{w.note}</div>
                    </li>
                  ))}
                  {!(task.worklogs || []).length && <li className="muted">{tx("task_detail.yozuv_yoq")}</li>}
                </ul>
                <form className="mt" onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api.post(`/tasks/${task.id}/worklogs/`, log);
                    setLog({ ...log, note: "", hours: "1" });
                  });
                }}>
                  <div className="row">
                    <div className="field" style={{ width: 150 }}>
                      {/* "Soat" deb yozilsa muddat soati bilan chalkashardi */}
                      <label htmlFor={`${fid}-3`}>{tx("common.sarflangan_soat")}</label>
                      <input id={`${fid}-3`} type="number" step="0.5" min="0" value={log.hours}
                             onChange={(e) => setLog({ ...log, hours: e.target.value })} />
                    </div>
                    <div className="field" style={{ width: 170 }}>
                      <label htmlFor={`${fid}-0`}>{tx("common.sana")}</label>
                      <DateField id={`${fid}-0`} value={log.work_date}
                                 onChange={(v) => setLog({ ...log, work_date: v })} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`${fid}-1`}>{tx("task_detail.nima_qildingiz")}</label>
                    <textarea id={`${fid}-1`} rows={3} value={log.note} required
                              placeholder={tx("task_detail.qaysi_yechim_tanlandi_va_nima")}
                              onChange={(e) => setLog({ ...log, note: e.target.value })} />
                  </div>
                  <button className="btn btn-sm btn-primary" disabled={busy}>{tx("task_detail.jurnalga_yozish")}</button>
                </form>
              </Card>
            )}

            <Card title={tx("task_detail.vazifa_tarixi")}>
              <Timeline items={history} showProject={false} />
            </Card>
          </div>

          {/* ------------------------------------------------ ONG USTUN */}
          <div>
            {transitions.length > 0 && (
              <Card title={tx("task_detail.holatni_ozgartirish")}>
                {/* Tugmalar yonma-yon: oltita holat ustma-ust turganda panel
                    ekranning yarmini egallab, yonidagi «Tekshiruv» va boshqa
                    bo'limlarni pastga surib yuborardi. */}
                <div className="status-picker">
                  {transitions.map((t) => (
                    <button key={t.value} className="btn btn-sm" disabled={busy}
                            onClick={() => void run(() => api.post(`/tasks/${task.id}/status/`, {
                              status: t.value,
                              blocked_reason: t.value === "BLOCKED" ? blockReason : "",
                            }))}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {transitions.some((t) => t.value === "BLOCKED") && (
                  /* Sabab «To'xtab qolgan» tugmasidan OLDIN yoziladi - tugma
                     bosilishi bilanoq holat serverga ketadi. Shuning uchun
                     maydon ko'rinib turadi, lekin ixcham: yorlig'i yo'q,
                     tushuntirish o'rniga joy tutuvchi matn. */
                  <div className="status-reason">
                    <label className="sr-only" htmlFor={`${fid}-4`}>{tx("task_detail.toxtash_sababi")}</label>
                    <input id={`${fid}-4`} value={blockReason} onChange={(e) => setBlockReason(e.target.value)}
                           placeholder={tx("task_detail.toxtab_qolgan_uchun_sabab")} />
                  </div>
                )}
              </Card>
            )}

            {acc.can_review && task.status === "IN_REVIEW" && (
              <Card title={tx("task_detail.tekshiruv")}>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => api.post(`/tasks/${task.id}/review/`, review));
                }}>
                  <div className="field">
                    <span className="lbl">{tx("task_detail.qaror")}</span>
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
                    <label htmlFor={`${fid}-2`}>{tx("task_detail.izoh")}</label>
                    <textarea id={`${fid}-2`} rows={4} value={review.comment}
                              placeholder={tx("task_detail.nimani_tuzatish_kerak_aniq_yozing")}
                              onChange={(e) => setReview({ ...review, comment: e.target.value })} />
                  </div>
                  <button className="btn btn-primary btn-block" disabled={busy}>{tx("task_detail.qarorni_saqlash")}</button>
                </form>
              </Card>
            )}

            <Card title={tx("task_detail.malumotlar")}>
              <ul className="list-plain" style={{ fontSize: 13 }}>
                <li className="row">
                  <span className="muted">{tx("common.ijrochilar")}</span><span className="spacer" />
                  <AvatarStack users={task.assignees} />
                </li>
                <li className="row">
                  <span className="muted">{tx("task_detail.tekshiruvchi")}</span><span className="spacer" />
                  <span>{task.reviewer?.full_name || tx("task_detail.menejer")}</span>
                </li>
                <li className="row">
                  <span className="muted">{tx("task_detail.yaratgan")}</span><span className="spacer" />
                  <span>{task.created_by?.full_name || "—"}</span>
                </li>
                <li className="row">
                  <span className="muted">{tx("task_detail.yaratilgan")}</span><span className="spacer" />
                  <span>{fmtDateTime(task.created_at)}</span>
                </li>
                {task.completed_at && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.yakunlangan")}</span><span className="spacer" />
                    <span>{fmtDateTime(task.completed_at)}</span>
                  </li>
                )}
              </ul>
            </Card>

            {/* Ishni boshqa odamga O'TKAZISH. Vazifa formasida ham ijrochini
                almashtirsa bo'ladi, lekin u yerda butun topshiriq qaytadan
                ochiladi; bu yerda bitta amal: kimga va nega. Ish bitta odamga
                o'tadi, oldingisi xabar oladi (serverda ham shunday). */}
            {canEdit && task.status !== "DONE" && task.status !== "CANCELLED" && (
              <Card title={tx("task_detail.boshqa_odamga_otkazish")}>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!handTo) return;
                  void run(async () => {
                    await api.post(`/tasks/${task.id}/reassign/`,
                                   { user_id: Number(handTo), note: handNote.trim() });
                    setHandTo("");
                    setHandNote("");
                  });
                }}>
                  <div className="field">
                    <label htmlFor={`${fid}-5`}>{tx("task_detail.kimga")}</label>
                    <select id={`${fid}-5`} value={handTo} required
                            onChange={(e) => setHandTo(e.target.value)}>
                      <option value="">{tx("task_detail.jamoadan_tanlang")}</option>
                      {members.map((m) => {
                        const now = task.assignees.some((a) => a.id === m.user.id);
                        return (
                          <option key={m.id} value={m.user.id}>
                            {m.user.full_name} — {m.role_display}
                            {now ? tx("task_detail.hozirgi_ijrochi") : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`${fid}-6`}>{tx("task_detail.sabab_ixtiyoriy")}</label>
                    <input id={`${fid}-6`} value={handNote} placeholder={tx("task_detail.masalan_tatilga_chiqdi")}
                           onChange={(e) => setHandNote(e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-block" disabled={busy || !handTo}>
                    {tx("task_detail.otkazish")}
                  </button>
                  <small className="muted">
                    {tx("task_detail.ish_bitta_odamga_otadi_oldingi")}
                  </small>
                </form>
              </Card>
            )}

            {!!task.quality_checklist?.length && (
              <Card title={tx("task_detail.topshirishdan_oldin_tekshiring")}>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {task.quality_checklist.map((c: string) => <li key={c}>{c}</li>)}
                </ul>
              </Card>
            )}

            {!!task.mismatched_assignees?.length && acc.can_manage && (
              <Card title={tx("task_detail.diqqat")}>
                <div className="callout warn">
                  {tx("task_detail.quyidagi_ijrochilar_mutaxassisligi_vazifa_ta")}{" "}
                  {task.mismatched_assignees.map((u: any) => u.full_name).join(", ")}
                </div>
              </Card>
            )}

            {!!task.reviews?.length && (
              <Card title={tx("task_detail.tekshiruvlar_tarixi")}>
                <ul className="list-plain">
                  {task.reviews.map((r) => (
                    <li key={r.id}>
                      <div className="row">
                        <span className={`badge ${r.verdict === "APPROVED" ? "badge-ok" : "badge-warn"}`}>
                          {r.verdict_display}
                        </span>
                        <span className="muted">{r.round_no}{tx("task_detail.aylana")}</span>
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
