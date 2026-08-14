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
import { ApiError, api, tokens } from "@/api/client";
import type { Submission, Task } from "@/api/types";
import { IconCheck, IconClose, IconFile, IconHistory } from "./icons";
import { Avatar, Card, ErrorMsg, OkMsg, fmtDateTime, timeAgo } from "./ui";

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
      setError("Qilingan ishni qisqacha bo'lsa ham yozing.");
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
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "/api"}/tasks/${task.id}/submissions/`,
        { method: "POST", headers: { Authorization: `Bearer ${tokens.access}` }, body }
      );
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
      const saved = await res.json().catch(() => null);
      setText("");
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      setOk(saved?.moved_to_review
        ? "Ish topshirildi — vazifa tekshiruvga o'tdi, menejer tasdiqlashini kuting."
        : `Ish topshirildi. Vazifa holati: ${saved?.task_status_display || "o'zgarmadi"}.`);
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Topshirib bo'lmadi");
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
      setError(err instanceof ApiError ? err.message : "Tahrirlab bo'lmadi");
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await api.delete(`/tasks/${task.id}/submissions/${id}/`);
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "O'chirib bo'lmadi");
    }
  }

  return (
    <Card
      title="Topshirilgan ish"
      badge={<span className="badge">{items.length}</span>}
    >
      <ErrorMsg error={error} />
      <OkMsg text={ok} />

      {canWork && (
        <form onSubmit={submit} className="mb">
          <div className="field">
            <label htmlFor={`${fid}-0`}>Nima qilindi</label>
            <textarea id={`${fid}-0`}
              rows={3}
              value={text}
              placeholder="Qaysi fayllar o'zgardi, qanday yechim tanlandi, nimaga e'tibor berish kerak"
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${fid}-1`}>Fayl biriktirish (ixtiyoriy)</label>
            <input id={`${fid}-1`}
              ref={fileInput}
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            {!!files.length && (
              <div className="help">{files.map((f) => f.name).join(", ")}</div>
            )}
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Topshirilmoqda..." : "Ishni topshirish"}
          </button>
          <span className="muted" style={{ marginLeft: 10, fontSize: 12.5 }}>
            Vazifa tekshiruvga o'tadi va menejer tasdiqlamaguncha shunday turadi.
          </span>
        </form>
      )}

      {!items.length && <p className="muted">Hali ish topshirilmagan.</p>}

      <div className="stack">
        {items.map((s) => (
          <div className="submission" key={s.id}>
            <div className="row wrap">
              <Avatar user={s.author} size="sm" />
              <div style={{ minWidth: 0 }}>
                <strong>{s.author.full_name}</strong>{" "}
                <span className="badge">{s.round_no}-aylana</span>{" "}
                {s.is_edited && (
                  <span className="badge badge-warn">{s.edited_count} marta tahrirlangan</span>
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
                    Tahrirlash
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => void remove(s.id)}>
                    <IconClose size={13} /> O'chirish
                  </button>
                </>
              )}
            </div>

            {editing === s.id ? (
              <div className="mt">
                <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => void saveEdit(s.id)}>
                    <IconCheck size={13} /> Saqlash
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditing(null)}>Bekor qilish</button>
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
                  {openHistory === s.id ? "Tahrir tarixini yashirish" : "Tahrir tarixi"}
                </button>
                {openHistory === s.id && (
                  <div className="edit-history">
                    {s.edits.map((e) => (
                      <div className="edit-row" key={e.id}>
                        <div className="row" style={{ gap: 6 }}>
                          <strong>{e.editor?.full_name || "Kimdir"}</strong>
                          <span className="tl-time">{fmtDateTime(e.edited_at)}</span>
                        </div>
                        <div className="edit-old">− {e.old_text}</div>
                        <div className="edit-new">+ {e.new_text}</div>
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
        Vazifa: <Link to={`/vazifa/${task.id}`}>{task.code}</Link> · holat: {task.status_display}
      </p>
    </Card>
  );
}
