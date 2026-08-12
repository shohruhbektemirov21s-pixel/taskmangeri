import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/api/client";
import type { Access, Project, Task, TaskStatusValue } from "@/api/types";
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
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [assignee, setAssignee] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api.get<{ columns: Column[]; access: Access }>("/tasks/board/", {
      project: project.id, assignee,
    });
    setColumns(d.columns);
    setAccess(d.access);
  }, [project.id, assignee]);

  useEffect(() => { void load(); }, [load]);

  async function drop(status: TaskStatusValue) {
    setOver(null);
    if (dragId == null) return;
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
          <label>Ijrochi</label>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Hammasi</option>
            <option value="me">Faqat meniki</option>
            {(project.members || []).map((m) => (
              <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
            ))}
          </select>
        </div>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
          Kartani surib boshqa ustunga oting — ruxsat bolmasa tizim toxtatadi
        </span>
      </div>

      <div className="board">
        {columns.map((col) => (
          <div
            key={col.status}
            className={`column ${over === col.status ? "drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(col.status); }}
            onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
            onDrop={() => void drop(col.status)}
          >
            <div className="column-head">
              <span className="dot" style={{ background: DOT[col.status] || "#8b949e" }} />
              {col.label}
              <span className="n">{col.count}</span>
            </div>
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
                <p className="muted center" style={{ fontSize: 12, padding: "16px 0" }}>bosh</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
