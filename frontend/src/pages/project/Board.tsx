import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Access, Project, ProjectFile, Task, TaskStatusValue } from "@/api/types";
import { IconFile } from "@/components/icons";
import { useRealtime } from "@/realtime/RealtimeContext";
import { ErrorMsg, Loading, TaskCard } from "@/components/ui";

interface Column {
  status: TaskStatusValue;
  label: string;
  count: number;
  tasks: Task[];
}

const DOT: Record<string, string> = {
  BACKLOG: "#8b949e", TODO: "#2f81f7", IN_PROGRESS: "#d29922",
  CHANGES_REQUESTED: "#db6d28", IN_REVIEW: "#a371f7", DONE: "#3fb950",
};

export default function Board({ project }: { project: Project }) {
  const fid = useId();
  const { subscribe } = useRealtime();
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [assignee, setAssignee] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Menejer hamma uchun yuklagan hujjatlar - doskaning tepasida turadi.
  const [files, setFiles] = useState<ProjectFile[]>([]);

  const load = useCallback(async () => {
    const d = await api.get<{ columns: Column[]; access: Access }>("/tasks/board/", {
      project: project.id, assignee,
    });
    setColumns(d.columns);
    setAccess(d.access);
  }, [project.id, assignee]);

  useEffect(() => { void load(); }, [load]);

  // Fayllar faqat jamoa a'zolariga ko'rinadi - begonaga 403 keladi, o'shanda
  // tasma umuman chizilmaydi.
  useEffect(() => {
    let alive = true;
    void api.get<any>(`/projects/${project.id}/files/`)
      .then((d) => { if (alive) setFiles(listOf<ProjectFile>(d)); })
      .catch(() => { if (alive) setFiles([]); });
    return () => { alive = false; };
  }, [project.id]);

  // Boshqa odam kartani ko'chirsa yoki yangi vazifa qo'shsa, doska o'zi
  // yangilanadi - sahifani qayta yuklab o'tirmaymiz.
  useEffect(() => subscribe((d) => {
    if (d.event === "task.update" && Number(d.project) === project.id) void load();
  }), [subscribe, load, project.id]);

  // Karta shu ustunga tashlanishi mumkinmi. «Bajarildi» - alohida holat:
  // uni qo'lda qo'yib bo'lmaydi, faqat TEKSHIRUVDAGI ishni tekshiruvchi
  // tasdiqlaganda qo'yiladi (server ham shu qoidada). Shuning uchun ustun
  // ijrochiga qabul qilmaydigan qilib ko'rsatiladi - u kartani sudrab
  // borib, keyin xato xabarini o'qimasin.
  function accepts(status: TaskStatusValue) {
    if (!access?.can_work) return false;
    if (status !== "DONE") return true;
    if (!access?.can_review) return false;
    const task = columns?.flatMap((c) => c.tasks).find((t) => t.id === dragId);
    return task?.status === "IN_REVIEW";
  }

  async function drop(status: TaskStatusValue) {
    setOver(null);
    if (dragId == null) return;
    if (!accepts(status)) {
      setDragId(null);
      return;
    }
    setError(null);
    try {
      await api.post(`/tasks/${dragId}/status/`, { status });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Holatni ozgartirib bolmadi");
    } finally {
      setDragId(null);
    }
  }

  if (!columns) return <Loading />;

  return (
    <>
      <ErrorMsg error={error} />
      <div className="filters">
        <div className="f">
          <label htmlFor={`${fid}-0`}>Ijrochi</label>
          <select id={`${fid}-0`} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Hammasi</option>
            <option value="me">Faqat meniki</option>
            {(project.members || []).map((m) => (
              <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
            ))}
          </select>
        </div>
        <span className="spacer" />
      </div>

      {files.length > 0 && (
        <div className="board-files">
          <span className="muted nowrap"><IconFile size={13} /> Loyiha fayllari:</span>
          {files.slice(0, 5).map((f) => (
            <a key={f.id} className="chip" href={f.url || "#"} target="_blank" rel="noreferrer"
               title={f.description || f.original_name}>
              {f.original_name}
            </a>
          ))}
          {files.length > 5 && (
            <Link className="chip" to={`/loyiha/${project.id}/fayllar`}>
              yana {files.length - 5} ta
            </Link>
          )}
        </div>
      )}

      <div className="board">
        {columns.map((col) => (
          <div
            key={col.status}
            className={`column ${over === col.status ? "drag-over" : ""}`}
            onDragOver={(e) => {
              if (dragId != null && !accepts(col.status)) return;
              e.preventDefault();
              setOver(col.status);
            }}
            onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
            onDrop={() => void drop(col.status)}
          >
            <div className="column-head">
              <span className="dot" style={{ background: DOT[col.status] || "#8b949e" }} />
              {col.label}
              <span className="n">{col.count}</span>
            </div>
            {col.status === "DONE" && access?.can_review && (
              <p className="muted" style={{ fontSize: 11, padding: "0 12px 8px" }}>
                Tekshiruvdagi ishni shu yerga tashlab tasdiqlaysiz.
              </p>
            )}
            <div className="column-body">
              {col.tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  draggable={Boolean(access?.can_work)}
                  onDragStart={() => setDragId(t.id)}
                />
              ))}
              {!col.tasks.length && (
                <p className="muted center" style={{ fontSize: 12, padding: "16px 0" }}>bo'sh</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
