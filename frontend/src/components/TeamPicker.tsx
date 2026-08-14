/**
 * Loyiha yaratilishidan OLDIN jamoaga kimni chaqirishni va kimga qaysi
 * vazifa tegishini belgilash.
 *
 * A'zolik ham, vazifa ham mavjud loyihaga yoziladi — ya'ni id kerak, yangi
 * loyiha esa hali yaratilmagan. Shuning uchun bu yerda hammasi faqat ro'yxatga
 * yig'iladi; forma saqlangach yangi id bilan yuboriladi (`addPickedMembers`,
 * `createPickedTasks`).
 *
 * Odam qidiruvi umumiy foydalanuvchi katalogidan (`/users/?search=`) boradi:
 * yangi loyihada hali a'zo yo'q, shuning uchun `/team/candidates/` dan
 * foydalanib bo'lmaydi — u mavjud loyihani talab qiladi.
 */
import { useCallback, useRef, useState } from "react";
import { api, listOf } from "@/api/client";
import type { Choice, Task, UserBrief } from "@/api/types";
import { MAX_FILE_BYTES, fileSize, uploadFiles } from "./FilePicker";
import UserSearch from "./UserSearch";
import { IconClose, IconFile, IconPlus } from "./icons";
import { Avatar, SpecialtyTag, fromDateTimeInput } from "./ui";

/** Odamga atab yozilgan, hali yaratilmagan vazifa. */
export interface PickTask {
  title: string;
  priority: number;
  /** "YYYY-MM-DD" yoki bo'sh — ish oynasi, ikkalasi ham ixtiyoriy */
  start_date: string;
  due_date: string;
  /** Vazifa yaratilgandan keyin biriktiriladigan fayllar */
  files: File[];
}

export interface Pick {
  user: UserBrief;
  role: string;
  tasks: PickTask[];
  /** Yozilayotgan, lekin hali «Qoshish» bosilmagan vazifa.
      Shu yerda turgani uchun forma saqlanganda ham yo'qolmaydi. */
  draft: PickTask;
}

export const emptyTask = (): PickTask => ({
  title: "", priority: 2, start_date: "", due_date: "", files: [],
});

/** Odamga tegishli hamma vazifa: qo'shilganlar + to'ldirilgan qoralama. */
export function tasksOf(p: Pick) {
  return p.draft.title.trim()
    ? [...p.tasks, { ...p.draft, title: p.draft.title.trim() }]
    : p.tasks;
}

/** Ekranda yangisi tepada turadi; serverga esa qo'shilgan tartibda boradi. */
const inAddedOrder = (picks: Pick[]) => [...picks].reverse();

/**
 * Yig'ilgan odamlarni jamoaga qo'shadi — darrov, tasdiq kutmasdan.
 * Qo'shib bo'lmaganlarning ismini qaytaradi — chaqiruvchi shuni aytadi.
 */
export async function addPickedMembers(projectId: number, picks: Pick[]) {
  const failed: string[] = [];
  // Ro'yxat yangisi tepada bo'lib ko'rsatiladi, qo'shish esa qo'shilgan
  // tartibda boradi - vazifa raqamlari kiritilish tartibiga mos tushsin.
  for (const p of inAddedOrder(picks)) {
    try {
      await api.post("/team/add/", {
        project: projectId,
        user_id: p.user.id,
        role: p.role,
      });
    } catch {
      failed.push(p.user.full_name);
    }
  }
  return failed;
}

/**
 * Yig'ilgan vazifalarni yaratadi, egasiga biriktiradi va fayllarini yuklaydi.
 *
 * Odam allaqachon a'zo bo'lgani uchun vazifa darrov uning «Mening ishlarim»
 * ro'yxatida va doskada ko'rinadi.
 *
 * Fayl vazifa yaratilgandan keyin biriktiriladi - avval id kerak. Fayl
 * yuklanmasa vazifa o'chirilmaydi: qaysi vazifaning fayli qolib ketgani
 * alohida qaytariladi, odam uni vazifa sahifasidan qayta yuklaydi.
 */
export async function createPickedTasks(projectId: number, picks: Pick[]) {
  const failedTasks: string[] = [];
  const failedFiles: string[] = [];
  for (const p of inAddedOrder(picks)) {
    for (const t of tasksOf(p)) {
      let task: Task;
      try {
        task = await api.post<Task>("/tasks/", {
          project: projectId,
          title: t.title,
          priority: t.priority,
          status: "TODO",
          assignee_ids: [p.user.id],
          // Boshlanish - kunning boshi, muddat esa oxiri: aks holda ish
          // boshlanadigan kuni ertalab "kechikdi" bo'lib turardi.
          start_date: t.start_date ? fromDateTimeInput(`${t.start_date}T00:00`) : null,
          due_date: t.due_date ? fromDateTimeInput(`${t.due_date}T23:59`) : null,
        });
      } catch {
        failedTasks.push(t.title);
        continue;
      }
      if (t.files.length) {
        try {
          await uploadFiles(`/tasks/${task.id}/attachments/`, t.files);
        } catch {
          failedFiles.push(t.title);
        }
      }
    }
  }
  return { failedTasks, failedFiles };
}

export function taskCount(picks: Pick[]) {
  return picks.reduce((n, p) => n + tasksOf(p).length, 0);
}

/** "2026-08-20" -> "20.08.2026". Maydon qiymati mintaqasiz — shunday
    o'giramiz, `new Date` orqali o'tkazsak kun surilib ketishi mumkin. */
const dmy = (value: string) => value.split("-").reverse().join(".");

interface Props {
  picks: Pick[];
  onChange: (picks: Pick[]) => void;
  roles: Choice[];
  priorities: Choice[];
  defaultRole?: string;
  /** O'zini qo'sha olmaydi — ro'yxatdan chiqarib tashlanadi. */
  excludeId?: number;
}

export default function TeamPicker({
  picks, onChange, roles, priorities, defaultRole = "DEVELOPER", excludeId,
}: Props) {

  const search = useCallback(async (q: string) => {
    const data = await api.get<any>("/users/", { search: q, page_size: 8 });
    return listOf<UserBrief>(data).filter(
      (u) => u.id !== excludeId && !picks.some((p) => p.user.id === u.id));
  }, [excludeId, picks]);

  /** Bitta odamning yozuvini yangilaydi — qolganlariga tegmaydi. */
  const patch = (i: number, part: Partial<Pick>) =>
    onChange(picks.map((x, n) => (n === i ? { ...x, ...part } : x)));

  const total = taskCount(picks);

  return (
    <>
      {/* Yangi qo'shilgan odam ro'yxat BOSHIGA tushadi: ishlanayotgan
          odam ko'z oldida tursin, pastga qarab surilib ketmasin. */}
      <UserSearch
        search={search}
        onPick={(u) => onChange([
          { user: u, role: defaultRole, tasks: [], draft: emptyTask() },
          ...picks,
        ])}
        placeholder="Email yoki ism-familiya"
        emptyText="Hech kim topilmadi"
        clearOnPick
      />

      {!!picks.length && (
        <div className="stack" style={{ marginTop: 12 }}>
          {picks.map((p, i) => (
            <div className="pick" key={p.user.id}>
              <div className="row">
                <Avatar user={p.user} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>{p.user.full_name}</strong>{" "}
                  <SpecialtyTag user={p.user} compact />
                  <br />
                  <small className="muted">{p.user.email}</small>
                </div>
                <span className="spacer" />
                <button type="button" className="btn btn-sm" title="Royxatdan olib tashlash"
                        onClick={() => onChange(picks.filter((_, n) => n !== i))}>
                  <IconClose size={13} />
                </button>
              </div>

              <select value={p.role} onChange={(e) => patch(i, { role: e.target.value })}>
                {roles.map((r) => (
                  <option key={r.value} value={String(r.value)}>{r.label}</option>
                ))}
              </select>

              <div className="pick-tasks">
                {p.tasks.map((t, n) => (
                  <div className="pick-task" key={n}>
                    <span className="pick-task-title" title={t.title}>{t.title}</span>
                    <span className={`pri pri-${t.priority}`}>
                      {priorities.find((x) => Number(x.value) === t.priority)?.label}
                    </span>
                    {(t.start_date || t.due_date) && (
                      <small className="muted nowrap">
                        {t.start_date && dmy(t.start_date)}
                        {t.start_date && t.due_date && " → "}
                        {t.due_date && dmy(t.due_date)}
                      </small>
                    )}
                    {!!t.files.length && (
                      <small className="muted nowrap" title={t.files.map((f) => f.name).join(", ")}>
                        <IconFile size={11} /> {t.files.length}
                      </small>
                    )}
                    <button type="button" className="chip-x" title="Vazifani olib tashlash"
                            onClick={() => patch(i, {
                              tasks: p.tasks.filter((_, k) => k !== n),
                            })}>
                      <IconClose size={9} />
                    </button>
                  </div>
                ))}

                <TaskAdder
                  priorities={priorities}
                  draft={p.draft}
                  onDraft={(d) => patch(i, { draft: d })}
                  onAdd={(t) => patch(i, { tasks: [...p.tasks, t], draft: emptyTask() })}
                />
              </div>
            </div>
          ))}

          <div className="muted" style={{ fontSize: 12 }}>
            {picks.length} ta a'zo
            {total > 0 && <> · {total} ta vazifa</>}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Bitta odamga vazifa yozish qatori.
 *
 * Qoralama bu yerda emas, `Pick.draft` da turadi: odam sarlavhani yozib
 * «Qoshish» ni bosmasa ham, forma saqlanganda vazifa yaratiladi. Avval
 * qoralama shu komponent ichida turardi va jimgina yo'qolib ketardi.
 */
function TaskAdder({ priorities, draft, onDraft, onAdd }: {
  priorities: Choice[];
  draft: PickTask;
  onDraft: (task: PickTask) => void;
  onAdd: (task: PickTask) => void;
}) {
  const [tooBig, setTooBig] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = (part: Partial<PickTask>) => onDraft({ ...draft, ...part });

  /** Tanlangan yoki sudrab tashlangan fayllarni qoralamaga qo'shadi. */
  function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const picked = Array.from(list);
    // Katta faylni shu yerdayoq to'samiz - server 400 qaytarguncha kutmaymiz.
    setTooBig(picked.filter((f) => f.size > MAX_FILE_BYTES).map((f) => f.name));
    const seen = new Set(draft.files.map((f) => `${f.name}:${f.size}`));
    set({ files: [...draft.files, ...picked.filter(
      (f) => f.size <= MAX_FILE_BYTES && !seen.has(`${f.name}:${f.size}`))] });
    if (fileInput.current) fileInput.current.value = "";
  }

  function add() {
    const clean = draft.title.trim();
    if (!clean) return;
    onAdd({ ...draft, title: clean });
    setTooBig([]);
  }

  return (
    <div className="pick-add"
         /* Faylni to'g'ridan-to'g'ri shu qatorga sudrab tashlash ham mumkin */
         onDragOver={(e) => e.preventDefault()}
         onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
      <input
        value={draft.title}
        placeholder="Vazifa: masalan «Login sahifasini yigish»"
        onChange={(e) => set({ title: e.target.value })}
        /* Enter forma yuborib yubormasin — u yerda vazifa qoshiladi */
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      {/* Ish oynasi: qachondan - qachongacha. Ikkalasi ham ixtiyoriy, lekin
          bir-birini cheklaydi - teskari oraliq tanlab bo'lmaydi. */}
      <div className="row wrap">
        <label className="pick-date">
          <small className="muted">Boshlanish</small>
          <input type="date" value={draft.start_date} max={draft.due_date || undefined}
                 onChange={(e) => set({ start_date: e.target.value })} />
        </label>
        <label className="pick-date">
          <small className="muted">Tugash</small>
          <input type="date" value={draft.due_date} min={draft.start_date || undefined}
                 onChange={(e) => set({ due_date: e.target.value })} />
        </label>
      </div>

      <div className="row wrap">
        <select value={draft.priority} style={{ flex: 1, minWidth: 110 }}
                onChange={(e) => set({ priority: Number(e.target.value) })}>
          {priorities.map((x) => (
            <option key={String(x.value)} value={String(x.value)}>{x.label}</option>
          ))}
        </select>
        <button type="button" className="btn btn-sm" title="Vazifaga fayl biriktirish"
                onClick={() => fileInput.current?.click()}>
          <IconFile size={13} /> Fayl
        </button>
        <input ref={fileInput} type="file" multiple style={{ display: "none" }}
               onChange={(e) => addFiles(e.target.files)} />
        <button type="button" className="btn btn-sm" disabled={!draft.title.trim()} onClick={add}>
          <IconPlus size={13} /> Qoshish
        </button>
      </div>

      {!!draft.files.length && (
        <div className="pick-files">
          {draft.files.map((f, i) => (
            <span className="chip" key={`${f.name}-${f.size}-${i}`} title={f.name}>
              <IconFile size={11} />
              <span className="pick-file-name">{f.name}</span>
              <small className="muted">{fileSize(f.size)}</small>
              <button type="button" className="chip-x" title="Faylni olib tashlash"
                      onClick={() => set({ files: draft.files.filter((_, n) => n !== i) })}>
                <IconClose size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!!tooBig.length && (
        <small className="err">
          25 MB dan katta bolgani uchun qoshilmadi: {tooBig.join(", ")}
        </small>
      )}
    </div>
  );
}
