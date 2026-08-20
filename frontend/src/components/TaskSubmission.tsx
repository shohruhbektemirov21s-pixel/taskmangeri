/**
 * Ish topshirig'i — dasturchi vazifani yakunlab, nima qilganini yozadi va
 * xohlasa fayl biriktiradi.
 *
 * Topshirilgach vazifa TEKSHIRUVGA o'tadi va **menejer tasdiqlamaguncha**
 * shunday turadi. Topshiriqni tahrirlash va o'chirish mumkin, lekin har bir
 * tahrir tarixda qoladi — kim, qachon, nimadan nimaga o'zgartirgani ko'rinadi.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Submission, Task } from "@/api/types";
import { IconCheck, IconClose, IconFile, IconHistory } from "./icons";
import { Avatar, Card, DiffView, ErrorMsg, OkMsg, fmtDateTime, timeAgo } from "./ui";
import { toTask } from "@/nav";
import { tx } from "@/i18n";

interface Props {
  task: Task;
  canWork: boolean;
  onChange: () => void;
}

export default function TaskSubmission({ task, canWork, onChange }: Props) {
  const fid = useId();
  const [items, setItems] = useState<Submission[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [openHistory, setOpenHistory] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.get<Submission[]>(`/tasks/${task.id}/submissions/`));
    } catch {
      setItems([]);
    }
  }, [task.id]);

  useEffect(() => { void load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 3) {
      setError(tx("task_submission.qilingan_ishni_qisqacha_bolsa_ham"));
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);

    // Fayl bilan birga yuborilishi kerak — shuning uchun FormData.
    const body = new FormData();
    body.append("text", text.trim());
    files.forEach((f) => body.append("file", f));

    try {
      // `api.post` - xom `fetch` emas: 401 da token o'zi yangilanadi.
      const saved = await api.post<any>(`/tasks/${task.id}/submissions/`, body);
      setText("");
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      setOk(saved?.moved_to_review
        ? tx("task_submission.ish_topshirildi_vazifa_tekshiruvga_otdi")
        : tx("task_submission.ish_topshirildi_holat", {
            holat: saved?.task_status_display || tx("task_submission.ozgarmadi"),
          }));
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("task_submission.topshirib_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: number) {
    setError(null);
    try {
      await api.patch(`/tasks/${task.id}/submissions/${id}/`, { text: editText });
      setEditing(null);
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("task_submission.tahrirlab_bolmadi"));
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await api.delete(`/tasks/${task.id}/submissions/${id}/`);
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("task_submission.ochirib_bolmadi"));
    }
  }

  return (
    <Card
      title={tx("task_submission.topshirilgan_ish")}
      badge={<span className="badge">{items.length}</span>}
    >
      <ErrorMsg error={error} />
      <OkMsg text={ok} />

      {canWork && (
        <form onSubmit={submit} className="mb">
          <div className="field">
            <label htmlFor={`${fid}-0`}>{tx("task_submission.nima_qilindi")}</label>
            <textarea id={`${fid}-0`}
              rows={3}
              value={text}
              placeholder={tx("task_submission.qaysi_fayllar_ozgardi_qanday_yechim")}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${fid}-1`}>{tx("task_submission.fayl_biriktirish_ixtiyoriy")}</label>
            {/* Xom input yashirin: uning tugmasi brauzer tilida chiqardi
                (masalan ruscha "Vybrat fayly"). Ochish o'zbekcha tugma
                orqali - loyihadagi boshqa yuklash joylari bilan bir xil. */}
            <input id={`${fid}-1`}
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            <button type="button" className="btn btn-sm"
                    onClick={() => fileInput.current?.click()}>
              {tx("task_submission.fayl_tanlash")}
            </button>
            {!!files.length && (
              <div className="help">{files.map((f) => f.name).join(", ")}</div>
            )}
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? tx("task_submission.topshirilmoqda") : tx("task_submission.ishni_topshirish")}
          </button>
          <span className="muted" style={{ marginLeft: 10, fontSize: 12.5 }}>
            {tx("task_submission.vazifa_tekshiruvga_otadi_va_menejer")}
          </span>
        </form>
      )}

      {!items.length && <p className="muted">{tx("task_submission.hali_ish_topshirilmagan")}</p>}

      <div className="stack">
        {items.map((s) => (
          <div className="submission" key={s.id}>
            <div className="row wrap">
              <Avatar user={s.author} size="sm" />
              <div style={{ minWidth: 0 }}>
                <strong>{s.author.full_name}</strong>{" "}
                <span className="badge">{s.round_no}{tx("task_submission.aylana")}</span>{" "}
                {s.is_edited && (
                  <span className="badge badge-warn">{s.edited_count} {tx("task_submission.marta_tahrirlangan")}</span>
                )}
                <br />
                <small className="muted" title={fmtDateTime(s.created_at)}>
                  {timeAgo(s.created_at)}
                </small>
              </div>
              <span className="spacer" />
              {s.can_edit && editing !== s.id && (
                <>
                  <button className="btn btn-sm btn-ghost"
                          onClick={() => { setEditing(s.id); setEditText(s.text); }}>
                    {tx("common.tahrirlash")}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => void remove(s.id)}>
                    <IconClose size={13} /> {tx("common.ochirish")}
                  </button>
                </>
              )}
            </div>

            {editing === s.id ? (
              <div className="mt">
                <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => void saveEdit(s.id)}>
                    <IconCheck size={13} /> {tx("common.saqlash")}
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditing(null)}>{tx("common.bekor_qilish")}</button>
                </div>
              </div>
            ) : (
              <div className="pre-wrap" style={{ marginTop: 8 }}>{s.text}</div>
            )}

            {!!s.files.length && (
              <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
                {s.files.map((f) => (
                  <a key={f.id} className="chip" href={f.url || "#"} target="_blank" rel="noreferrer">
                    <IconFile size={13} /> {f.original_name}
                    <span className="muted">{f.size_display}</span>
                  </a>
                ))}
              </div>
            )}

            {s.is_edited && (
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-sm btn-ghost"
                        onClick={() => setOpenHistory(openHistory === s.id ? null : s.id)}>
                  <IconHistory size={13} />{" "}
                  {openHistory === s.id ? tx("task_submission.tahrir_tarixini_yashirish") : tx("task_submission.tahrir_tarixi")}
                </button>
                {openHistory === s.id && (
                  <div className="edit-history">
                    {s.edits.map((e) => (
                      <div className="edit-row" key={e.id}>
                        <div className="row" style={{ gap: 6 }}>
                          <strong>{e.editor?.full_name || tx("task_submission.kimdir")}</strong>
                          <span className="tl-time">{fmtDateTime(e.edited_at)}</span>
                        </div>
                        {/* Yonma-yon solishtirish: o'zgargan bo'laklar ajratilgan.
                            Bo'laklarni server beradi (`diff`). */}
                        <DiffView diff={e.diff} oldLabel={tx("task_submission.tahrirdan_oldin")}
                                  newLabel={tx("task_submission.tahrirdan_keyin")} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
        {tx("task_submission.vazifa")} <Link {...toTask(task.id)}>{task.code}</Link> {tx("task_submission.holat")} {task.status_display}
      </p>
    </Card>
  );
}
