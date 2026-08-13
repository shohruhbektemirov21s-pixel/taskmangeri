import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf } from "@/api/client";
import type { Project, Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { useRealtime } from "@/realtime/RealtimeContext";
import { Empty, Loading, TaskRow } from "@/components/ui";

export default function TaskList({ project }: { project: Project }) {
  const { meta } = useAuth();
  const { subscribe } = useRealtime();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [f, setF] = useState({ status: "", assignee: "", task_type: "", search: "", open: "" });

  const load = useCallback(async () => {
    const d = await api.get<any>("/tasks/", { project: project.id, ...f, page_size: 200 });
    setTasks(listOf<Task>(d));
  }, [project.id, f]);

  useEffect(() => {
    // Filtr almashganda ro'yxat tozalanadi; jonli yangilanishda esa yo'q -
    // aks holda har o'zgarishda ro'yxat "sakrab" ketardi.
    setTasks(null);
    void load();
  }, [load]);

  useEffect(() => subscribe((d) => {
    if (d.event === "task.update" && Number(d.project) === project.id) void load();
  }), [subscribe, load, project.id]);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <>
      <div className="filters">
        <div className="f">
          <label>Holat</label>
          <select value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">Hammasi</option>
            {(meta?.task_status || []).map((s) => (
              <option key={s.value} value={String(s.value)}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label>Ijrochi</label>
          <select value={f.assignee} onChange={(e) => set("assignee", e.target.value)}>
            <option value="">Hammasi</option>
            <option value="me">Faqat meniki</option>
            {(project.members || []).map((m) => (
              <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label>Turi</label>
          <select value={f.task_type} onChange={(e) => set("task_type", e.target.value)}>
            <option value="">Hammasi</option>
            {(meta?.task_type || []).map((s) => (
              <option key={s.value} value={String(s.value)}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="f" style={{ flex: 1 }}>
          <label>Qidiruv</label>
          <input value={f.search} onChange={(e) => set("search", e.target.value)}
                 placeholder="Sarlavha yoki tavsif" />
        </div>
        <button className={`btn ${f.open ? "btn-accent" : ""}`}
                onClick={() => set("open", f.open ? "" : "1")}>
          Faqat ochiqlar
        </button>
      </div>

      <div className="card">
        {!tasks ? <Loading /> : tasks.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Kod</th><th>Vazifa</th><th>Holat</th>
                <th>Muhimlik</th><th>Ijrochilar</th><th>Muddat</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
            </tbody>
          </table>
        ) : (
          <Empty icon="☐" title="Vazifa topilmadi" text="Filtrlarni ozgartiring yoki yangi vazifa yarating.">
            {project.access.can_create_task && (
              <Link className="btn btn-primary" to={`/loyiha/${project.id}/vazifa-yaratish`}>
                Yangi vazifa
              </Link>
            )}
          </Empty>
        )}
      </div>
    </>
  );
}
