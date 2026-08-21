import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Access, Project, ProjectFile, Task, TaskStatusValue } from "@/api/types";
import { IconFile } from "@/components/icons";
import { useRealtime } from "@/realtime/RealtimeContext";
import { ErrorMsg, Loading, STATUS_DOT, TaskCard, TaskScopeNote } from "@/components/ui";
import { toProject } from "@/nav";
import { tx } from "@/i18n";

interface Column {
  status: TaskStatusValue;
  label: string;
  count: number;
  tasks: Task[];
}

/* Ranglar `components/ui.tsx` da - «Mening ishim» sahifasi ham shu ro'yxatdan
   oladi, ya'ni bir holat ikki joyda bir xil ko'rinadi. */
const DOT = STATUS_DOT;

export default function Board({ project }: { project: Project }) {
  const fid = useId();
  const { subscribe } = useRealtime();
  const [assignee, setAssignee] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  /**
   * Sudralayotgan kartaning raqami - REF da, holatda emas.
   *
   * `dragstart` va `drop` bir-biriga juda yaqin kelsa (tez sudralganda,
   * sensorli ekranda, sinov vositasida) React holatni oradan ULGURMAY
   * yangilaydi va `drop` ichidagi `dragId` hali `null` bo'ladi: karta
   * qimirlamaydi, xato ham chiqmaydi - odam "ishlamayapti" deb qoladi.
   * Ref esa o'sha zahoti yoziladi. Holat baribir kerak: ustunning
   * yonishi (`drag-over`) qayta chizishga bog'liq.
   */
  const dragRef = useRef<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Ko'chirish xatosi - yuklash xatosidan alohida.
  const [actionError, setActionError] = useState<string | null>(null);
  // Menejer hamma uchun yuklagan hujjatlar - doskaning tepasida turadi.
  const [files, setFiles] = useState<ProjectFile[]>([]);

  // Ilgari bu yerda `catch` yo'q edi: server xato bersa doska abadiy
  // «Yuklanmoqda» da qolardi va odam sababini bilmasdi.
  const { data: board, error: loadError, loading, reload } =
    useFetch<{ columns: Column[]; access: Access }>("/tasks/board/", {
      project: project.id, assignee,
    });
  const columns = board?.columns ?? null;
  const access = board?.access ?? null;
  const error = actionError || loadError;

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
    if (d.event === "task.update" && Number(d.project) === project.id) reload();
  }), [subscribe, reload, project.id]);

  // Karta shu ustunga tashlanishi mumkinmi. «Bajarildi» - alohida holat:
  // uni qo'lda qo'yib bo'lmaydi, faqat TEKSHIRUVDAGI ishni tekshiruvchi
  // tasdiqlaganda qo'yiladi (server ham shu qoidada). Shuning uchun ustun
  // ijrochiga qabul qilmaydigan qilib ko'rsatiladi - u kartani sudrab
  // borib, keyin xato xabarini o'qimasin.
  function accepts(status: TaskStatusValue) {
    if (!access?.can_work) return false;
    if (status !== "DONE") return true;
    if (!access?.can_review) return false;
    const task = columns?.flatMap((c) => c.tasks).find((t) => t.id === dragRef.current);
    return task?.status === "IN_REVIEW";
  }

  /** Vazifani boshqa ustunga o'tkazish - sudrash ham, menyu ham shu yerdan. */
  async function move(taskId: number, status: string) {
    setActionError(null);
    try {
      await api.post(`/tasks/${taskId}/status/`, { status });
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tx("project_board.holatni_ozgartirib_bolmadi"));
    }
  }

  async function drop(status: TaskStatusValue) {
    setOver(null);
    const id = dragRef.current;
    if (id == null || !accepts(status)) { dragRef.current = null; setDragId(null); return; }
    dragRef.current = null;
    setDragId(null);
    await move(id, status);
  }

  if (loading) return <Loading />;
  if (!columns) return <ErrorMsg error={error || tx("project_board.doskani_yuklab_bolmadi")} />;

  return (
    <>
      <ErrorMsg error={error} />
      <TaskScopeNote access={access} />
      <div className="filters">
        <div className="f">
          <label htmlFor={`${fid}-0`}>{tx("project_board.ijrochi")}</label>
          <select id={`${fid}-0`} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            <option value="me">{tx("project_board.faqat_meniki")}</option>
            {(project.members || []).map((m) => (
              <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
            ))}
          </select>
        </div>
        <span className="spacer" />
      </div>

      {files.length > 0 && (
        <div className="board-files">
          <span className="muted nowrap"><IconFile size={13} /> {tx("project_board.loyiha_fayllari")}</span>
          {files.slice(0, 5).map((f) => (
            <a key={f.id} className="chip" href={f.url || "#"} target="_blank" rel="noreferrer"
               title={f.description || f.original_name}>
              {f.original_name}
            </a>
          ))}
          {files.length > 5 && (
            <Link className="chip" {...toProject(project.id, "fayllar")}>
              {tx("common.yana")} {files.length - 5} {tx("common.ta")}
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
              if (dragRef.current != null && !accepts(col.status)) return;
              e.preventDefault();
              setOver(col.status);
            }}
            onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
            onDrop={() => void drop(col.status)}
          >
            <div className="column-head">
              <span className="dot" style={{ background: DOT[col.status] || "var(--subtle)" }} />
              {col.label}
              <span className="n">{col.count}</span>
            </div>
            {col.status === "DONE" && access?.can_review && (
              <p className="muted" style={{ fontSize: 11, padding: "0 12px 8px" }}>
                {tx("project_board.tekshiruvdagi_ishni_shu_yerga_tashlab")}
              </p>
            )}
            <div className="column-body">
              {col.tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  draggable={Boolean(access?.can_work)}
                  dragging={dragId === t.id}
                  onDragStart={() => { dragRef.current = t.id; setDragId(t.id); }}
                  onDragEnd={() => { dragRef.current = null; setDragId(null); setOver(null); }}
                  /* Sudrab bo'lmaydigan joylar uchun (telefon, klaviatura)
                     kartaning o'zida tanlash maydoni chiqadi. */
                  onMove={access?.can_work ? (task, status) => void move(task.id, status) : undefined}
                />
              ))}
              {!col.tasks.length && (
                <p className="muted center" style={{ fontSize: 12, padding: "16px 0" }}>{tx("project_board.bosh")}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
