import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { AvatarStack, Card, Empty, ErrorMsg, Loading, Priority, timeAgo } from "@/components/ui";
import { useLive } from "@/realtime/RealtimeContext";

export default function ReviewQueue() {
  const fid = useId();
  const { meta } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("APPROVED");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setTasks(await api.get<Task[]>("/tasks/review-queue/"));
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Ish topshirilsa navbat darrov to'ldiriladi.
  useLive((d) => { if (d.event === "task.update") void load(); });

  async function submit(taskId: number) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/tasks/${taskId}/review/`, { verdict, comment });
      setOpen(null);
      setComment("");
      setVerdict("APPROVED");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tekshiruvni saqlab bolmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title={<strong>Tekshiruv navbati</strong>}
        actions={tasks && <span className="badge badge-danger">{tasks.length} ta kutmoqda</span>}
      />
      <div className="content">
        <ErrorMsg error={error} />
        {!tasks ? <Loading /> : tasks.length ? (
          <div className="card">
            <div className="card-list">
              {tasks.map((t) => (
                <div className="card-body" key={t.id}>
                  <div className="row wrap">
                    <span className="mono muted">{t.code}</span>
                    <Link to={`/vazifa/${t.id}`} style={{ fontWeight: 600 }}>{t.title}</Link>
                    <Priority task={t} />
                    {t.specialty_label && <span className="badge badge-brand">{t.specialty_label}</span>}
                    {!!t.attachment_count && <span className="badge">{t.attachment_count} fayl</span>}
                    <span className="spacer" />
                    <AvatarStack users={t.assignees} />
                    <small className="muted">{timeAgo(t.submitted_at)}</small>
                    <button className="btn btn-sm btn-primary"
                            onClick={() => setOpen(open === t.id ? null : t.id)}>
                      {open === t.id ? "Yopish" : "Tekshirish"}
                    </button>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {t.project_name} · {t.review_round}-aylana · {t.logged_hours} soat sarflangan
                  </div>

                  {open === t.id && (
                    <div className="card" style={{ marginTop: 12, background: "var(--canvas-inset)" }}>
                      <div className="card-body">
                        {t.acceptance_criteria && (
                          <>
                            <strong style={{ fontSize: 13 }}>Tayyorlik mezoni</strong>
                            <div className="tl-detail">{t.acceptance_criteria}</div>
                          </>
                        )}
                        <div className="field mt">
                          <span className="lbl">Qaror</span>
                          <div className="check-list">
                            {(meta?.review_verdict || []).map((v) => (
                              <label key={v.value} className={verdict === v.value ? "on" : ""}>
                                <input type="radio" checked={verdict === v.value}
                                       onChange={() => setVerdict(String(v.value))} />
                                {v.label}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="field">
                          <label htmlFor={`${fid}-0`}>Izoh</label>
                          <textarea id={`${fid}-0`} rows={3} value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Nimani tuzatish kerak - aniq yozing" />
                        </div>
                        <div className="row">
                          <button className="btn btn-primary" disabled={busy}
                                  onClick={() => void submit(t.id)}>Qarorni saqlash</button>
                          <Link className="btn" to={`/vazifa/${t.id}`}>Vazifani toliq korish</Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <Empty icon="✓" title="Navbat bosh"
                   text="Hozircha tekshirishga yuborilgan ish yoq." />
          </Card>
        )}
      </div>
    </>
  );
}
