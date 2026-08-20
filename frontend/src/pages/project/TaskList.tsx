import { useEffect, useId, useMemo } from "react";
import { Link } from "react-router-dom";
import { listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Project, Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { useRealtime } from "@/realtime/RealtimeContext";
import { Empty, ErrorMsg, Loading, TaskRow, TaskScopeNote } from "@/components/ui";
import { toNewTask, useNavParams } from "@/nav";
import { tx } from "@/i18n";

/**
 * Filtr URL da turadi, komponent ichidagi holatda emas.
 *
 * Sababi: «Umumiy» va «Muddatlar» sahifalaridagi raqamli kataklar shu
 * ro'yxatga tayyor filtr bilan olib keladi. Filtr faqat
 * `useState` da bo'lganda havola ochilardi-yu, ro'yxat baribir to'liq
 * chiqardi - odam "1 ta nazoratda" ni bosib, 40 ta vazifani ko'rardi.
 * URL da turgani uchun havolani ulashsa ham, orqaga qaytsa ham ro'yxat
 * o'sha ko'rinishda ochiladi.
 */
const FILTER_KEYS = ["status", "assignee", "task_type", "search", "open", "overdue"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

export default function TaskList({ project }: { project: Project }) {
  const fid = useId();
  const { meta } = useAuth();
  const { subscribe } = useRealtime();
  const [params, setParams] = useNavParams();

  // `params` obyekti har renderda yangi bo'ladi - matnga qarab eslab qolamiz.
  const qs = params.toString();
  const f = useMemo(() => {
    const source = new URLSearchParams(qs);
    return Object.fromEntries(
      FILTER_KEYS.map((k) => [k, source.get(k) || ""]),
    ) as Record<FilterKey, string>;
  }, [qs]);
  const filtered = FILTER_KEYS.some((k) => f[k]);

  // Ilgari qidiruv maydoniga yozilgan HAR HARF uchun 200 tagacha vazifa
  // so'ralardi, ustiga `setTasks(null)` ro'yxatni har harfda "Yuklanmoqda" ga
  // almashtirardi - ekran pirillardi. Endi so'rov yozish to'xtagach ketadi,
  // eskisi bekor qilinadi va ro'yxat joyida turadi.
  const { data, error, loading, reload } = useFetch<any>(
    "/tasks/", { project: project.id, ...f, page_size: 200 }, { debounceMs: 300 });
  const tasks = useMemo(() => (data ? listOf<Task>(data) : null), [data]);

  useEffect(() => subscribe((d) => {
    if (d.event === "task.update" && Number(d.project) === project.id) reload();
  }), [subscribe, reload, project.id]);

  // `replace`: filtrni o'zgartirish tarixga yangi qadam qo'shmasin - aks
  // holda «orqaga» tugmasi har harfni birma-bir qaytarardi.
  const set = (k: FilterKey, v: string) => {
    const next = new URLSearchParams(qs);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <>
      <TaskScopeNote access={project.access} />
      <div className="filters">
        <div className="f">
          <label htmlFor={`${fid}-0`}>{tx("common.holat")}</label>
          <select id={`${fid}-0`} value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            {(meta?.task_status || []).map((s) => (
              <option key={s.value} value={String(s.value)}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor={`${fid}-1`}>{tx("project_task_list.ijrochi")}</label>
          <select id={`${fid}-1`} value={f.assignee} onChange={(e) => set("assignee", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            <option value="me">{tx("project_task_list.faqat_meniki")}</option>
            {(project.members || []).map((m) => (
              <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor={`${fid}-2`}>{tx("common.turi")}</label>
          <select id={`${fid}-2`} value={f.task_type} onChange={(e) => set("task_type", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            {(meta?.task_type || []).map((s) => (
              <option key={s.value} value={String(s.value)}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="f grow">
          <label htmlFor={`${fid}-3`}>{tx("common.qidiruv")}</label>
          <input id={`${fid}-3`} value={f.search} onChange={(e) => set("search", e.target.value)}
                 placeholder={tx("project_task_list.sarlavha_yoki_tavsif")} />
        </div>
        <button className={`btn ${f.open ? "btn-accent" : ""}`}
                onClick={() => set("open", f.open ? "" : "1")}>
          {tx("project_task_list.faqat_ochiqlar")}
        </button>
        {/* «Muddatlar» sahifasidagi «Muddati otgan» katagi shu filtr bilan
            keladi - tugma bo'lmasa odam uni o'chira olmasdi. */}
        <button className={`btn ${f.overdue ? "btn-accent" : ""}`}
                onClick={() => set("overdue", f.overdue ? "" : "1")}>
          {tx("common.muddati_otgan")}
        </button>
        {filtered && (
          <button className="btn" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            {tx("common.tozalash")}
          </button>
        )}
      </div>

      <div className="card">
        <ErrorMsg error={error} />
        {loading ? <Loading /> : tasks?.length ? (
          <div className="table-wrap"><table className="table">
            <thead>
              <tr>
                <th>{tx("project_task_list.kod")}</th><th>{tx("common.vazifa")}</th><th>{tx("common.holat")}</th>
                <th>{tx("common.muhimlik")}</th><th>{tx("common.ijrochilar")}</th><th>{tx("common.muddat")}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
            </tbody>
          </table></div>
        ) : (
          <Empty icon="☐" title={tx("project_task_list.vazifa_topilmadi")}
                 text={filtered
                   ? tx("project_task_list.tanlangan_filtrga_mos_vazifa_yoq")
                   : tx("project_task_list.bu_loyihada_hali_vazifa_yoq")}>
            {filtered && (
              <button className="btn" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                {tx("common.filtrni_tozalash")}
              </button>
            )}
            {project.access.can_create_task && (
              <Link className="btn btn-primary" {...toNewTask(project.id)}>
                {tx("common.yangi_vazifa")}
              </Link>
            )}
          </Empty>
        )}
      </div>
    </>
  );
}
