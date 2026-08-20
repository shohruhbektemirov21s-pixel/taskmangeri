import { Fragment, useId, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  AvatarStack, Card, Empty, ErrorMsg, Loading, Priority, StatusBadge, fmtDate,
} from "@/components/ui";
import { useLive } from "@/realtime/RealtimeContext";
import { toTask } from "@/nav";
import { tx } from "@/i18n";

/** «Qaytarish» uchun qaror kodi - serverdagi ro'yxatdan qidiriladi. */
const REJECT_HINTS = ["CHANGES_REQUESTED", "REJECTED", "RETURNED"];

export default function ReviewQueue() {
  const fid = useId();
  const { meta } = useAuth();
  const [open, setOpen] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("APPROVED");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  // Amal (tekshiruvni saqlash) xatosi - yuklash xatosidan alohida turadi.
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: tasks, error: loadError, loading, reload } =
    useFetch<Task[]>("/tasks/review-queue/");
  const error = actionError || loadError;

  // Ish topshirilsa navbat darrov to'ldiriladi.
  useLive((d) => { if (d.event === "task.update") reload(); });

  const verdicts = meta?.review_verdict || [];
  const rejectValue = String(
    verdicts.find((v) => REJECT_HINTS.includes(String(v.value)))?.value
    ?? verdicts.find((v) => String(v.value) !== "APPROVED")?.value
    ?? "CHANGES_REQUESTED",
  );

  /**
   * Qaror paneli qatorning ostida ochiladi.
   *
   * Dizaynda har qatorda ikkita tugma turadi, lekin qaror izohsiz
   * yuborilmasligi kerak - ayniqsa qaytarishda: "nimani tuzatish kerak"
   * degan savol javobsiz qolsa, ish yana o'sha holida qaytib keladi.
   * Shuning uchun tugma qarorni **tanlaydi** va panelni ochadi.
   */
  function begin(taskId: number, value: string) {
    setActionError(null);
    setVerdict(value);
    setOpen(open === taskId && verdict === value ? null : taskId);
  }

  async function submit(taskId: number) {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${taskId}/review/`, { verdict, comment });
      setOpen(null);
      setComment("");
      setVerdict("APPROVED");
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tx("review_queue.tekshiruvni_saqlab_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title={<strong>{tx("common.tekshiruv_navbati")}</strong>}
        subtitle={tx("review_queue.tasdiqlanishi_kutilayotgan_loyiha_topshiriql")}
        actions={!!tasks?.length && (
          <span className="badge badge-danger">{tasks.length} {tx("review_queue.ta_kutmoqda")}</span>
        )}
      />
      <div className="content">
        <ErrorMsg error={error} />
        {loading ? <Loading /> : tasks?.length ? (
          <div className="card">
            <div className="table-wrap"><table className="table table-review">
              <thead>
                <tr>
                  <th>{tx("review_queue.vazifa_nomi")}</th>
                  {/* Dizaynda ustun «Yaratuvchi» deb nomlangan, lekin navbatda
                      tekshiruvchiga kerak bo'ladigan odam - ishni TOPSHIRGAN
                      ijrochi. Vazifani ochgan odam vazifa sahifasida ko'rinadi. */}
                  <th>{tx("review_queue.topshirdi")}</th>
                  <th>{tx("common.loyiha")}</th>
                  <th>{tx("common.sana")}</th>
                  <th>{tx("common.holat")}</th>
                  <th className="right">{tx("common.amallar")}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <Fragment key={t.id}>
                    <tr>
                      <td>
                        <Link {...toTask(t.id)} style={{ fontWeight: 600 }}>{t.title}</Link>
                        <div className="row" style={{ gap: 6, marginTop: 3 }}>
                          <span className="mono muted" style={{ fontSize: 11.5 }}>{t.code}</span>
                          <Priority task={t} />
                          {t.specialty_label && (
                            <span className="badge badge-brand">{t.specialty_label}</span>
                          )}
                          {!!t.attachment_count && (
                            <span className="badge">{t.attachment_count} {tx("review_queue.fayl")}</span>
                          )}
                        </div>
                      </td>
                      <td><AvatarStack users={t.assignees} /></td>
                      <td className="muted">{t.project_name}</td>
                      <td className="muted nowrap">{fmtDate(t.submitted_at)}</td>
                      <td><StatusBadge task={t} /></td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-sm btn-ok"
                                  onClick={() => begin(t.id, "APPROVED")}>{tx("common.qabul_qilish")}</button>
                          <button className="btn btn-sm btn-danger"
                                  onClick={() => begin(t.id, rejectValue)}>{tx("review_queue.qaytarish")}</button>
                        </div>
                      </td>
                    </tr>

                    {open === t.id && (
                      <tr className="review-panel-row">
                        <td colSpan={6}>
                          <div className="review-panel">
                            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                              {t.review_round}{tx("review_queue.aylana")} {t.logged_hours} {tx("review_queue.soat_sarflangan")}
                            </div>
                            {t.acceptance_criteria && (
                              <>
                                <strong style={{ fontSize: 13 }}>{tx("common.tayyorlik_mezoni")}</strong>
                                <div className="tl-detail">{t.acceptance_criteria}</div>
                              </>
                            )}
                            <div className="field mt">
                              <span className="lbl">{tx("review_queue.qaror")}</span>
                              <div className="check-list">
                                {verdicts.map((v) => (
                                  <label key={v.value} className={verdict === String(v.value) ? "on" : ""}>
                                    <input type="radio" checked={verdict === String(v.value)}
                                           onChange={() => setVerdict(String(v.value))} />
                                    {v.label}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="field">
                              <label htmlFor={`${fid}-${t.id}`}>{tx("review_queue.izoh")}</label>
                              <textarea id={`${fid}-${t.id}`} rows={3} value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder={tx("review_queue.nimani_tuzatish_kerak_aniq_yozing")} />
                            </div>
                            <div className="row">
                              <button className="btn btn-primary" disabled={busy}
                                      onClick={() => void submit(t.id)}>{tx("review_queue.qarorni_saqlash")}</button>
                              <Link className="btn" {...toTask(t.id)}>{tx("review_queue.vazifani_toliq_korish")}</Link>
                              <button className="btn btn-ghost" onClick={() => setOpen(null)}>
                                {tx("common.bekor_qilish")}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table></div>
          </div>
        ) : (
          <Card>
            <Empty icon="✓" title={tx("review_queue.navbat_bosh")}
                   text={tx("review_queue.hozircha_tekshirishga_yuborilgan_ish_yoq")} />
          </Card>
        )}
      </div>
    </>
  );
}
