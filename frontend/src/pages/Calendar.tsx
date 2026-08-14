/**
 * Taqvim — shu oyda nima ishda turgani.
 *
 * Loyiha bitta sanada emas, BUTUN DAVRI bo'yicha tasma bo'lib cho'ziladi:
 * boshlanishdan muddatgacha. Shuning uchun har kunning ostida "o'sha kuni
 * nechta loyiha ishda" degan sanoq turadi — oyning qaysi yeri tig'iz,
 * qaysi yeri bo'sh ekani bir qarashda ko'rinadi.
 *
 * Vazifalar ham shu yerda, lekin ajratilgan: har biri ijrochisi bilan.
 * Muddat qo'yilmagan vazifa taqvimda umuman turmaydi — uni qo'yadigan joy
 * yo'q, oy oxirigacha cho'zish esa yolg'on bo'lardi.
 *
 * Sana hisobi UTC da yuritiladi (`Date.UTC`): server "YYYY-MM-DD" yuboradi,
 * uni mahalliy `new Date()` ga bersak mintaqa tufayli kun surilib ketardi.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import type { CalendarMonth, CalendarProject, CalendarTask } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, Empty, ErrorMsg, Loading } from "@/components/ui";

const WEEKDAYS = ["dushanba", "seshanba", "chorshanba", "payshanba",
                  "juma", "shanba", "yakshanba"];
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
                "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

/** "2026-08-14" -> UTC kun raqami (mintaqa aralashmasin). */
const dayNo = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};
const isoOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
/** Dushanba = 0 */
const weekday = (n: number) => (new Date(n * 86400000).getUTCDay() + 6) % 7;
const dayOfMonth = (n: number) => new Date(n * 86400000).getUTCDate();

/** Oyni bir qadam suradi: "2026-08" -> "2026-09". */
function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

interface Bar {
  key: string;
  kind: "project" | "task";
  from: number;
  to: number;
  label: string;
  color: string;
  overdue: boolean;
  done?: boolean;
  openEnded?: boolean;
  startsHere: boolean;
  endsHere: boolean;
  to_: string;
  people?: string;
}

/**
 * Tasmalarni qatorlarga (lane) taqsimlaydi: ustma-ust tushmasin.
 * Ochko'z usul — bo'sh birinchi qatorga qo'yiladi.
 */
function assignLanes(bars: Bar[]) {
  const lanes: Bar[][] = [];
  const placed: { bar: Bar; lane: number }[] = [];
  for (const bar of bars) {
    let lane = lanes.findIndex((row) => row.every((b) => b.to < bar.from || b.from > bar.to));
    if (lane === -1) { lanes.push([]); lane = lanes.length - 1; }
    lanes[lane].push(bar);
    placed.push({ bar, lane });
  }
  return { placed, laneCount: lanes.length };
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTasks, setShowTasks] = useState(true);

  const month = params.get("oy") || "";
  const picked = params.get("kun") || "";

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      setData(await api.get<CalendarMonth>("/projects/calendar/", { month }));
    } catch {
      setError("Taqvimni yuklab bo'lmadi");
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  function set(k: string, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
  }

  /** Oy setkasi: to'liq haftalar (dushanbadan yakshanbagacha). */
  const weeks = useMemo(() => {
    if (!data) return [];
    const first = dayNo(data.first_day);
    const last = dayNo(data.last_day);
    const gridStart = first - weekday(first);
    const gridEnd = last + (6 - weekday(last));
    const out: number[][] = [];
    for (let d = gridStart; d <= gridEnd; d += 7) {
      out.push(Array.from({ length: 7 }, (_, i) => d + i));
    }
    return out;
  }, [data]);

  const bars = useMemo<Bar[]>(() => {
    if (!data) return [];
    const fromProjects: Bar[] = data.projects.map((p: CalendarProject) => ({
      key: `p${p.id}`, kind: "project", from: dayNo(p.from), to: dayNo(p.to),
      label: p.name, color: p.color, overdue: p.overdue, openEnded: p.open_ended,
      startsHere: p.starts_here, endsHere: p.ends_here, to_: `/loyiha/${p.id}`,
    }));
    if (!showTasks) return fromProjects;
    const fromTasks: Bar[] = data.tasks.map((t: CalendarTask) => ({
      key: `t${t.id}`, kind: "task", from: dayNo(t.from), to: dayNo(t.to),
      label: `${t.code} · ${t.title}`, color: t.project.color, overdue: t.overdue,
      done: t.done, startsHere: t.starts_here, endsHere: t.ends_here,
      to_: `/vazifa/${t.id}`,
      people: t.assignees.map((u) => u.full_name).join(", ") || "biriktirilmagan",
    }));
    return [...fromProjects, ...fromTasks];
  }, [data, showTasks]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of data?.days || []) map[d.date] = d.count;
    return map;
  }, [data]);

  const title = data
    ? `${MONTHS[Number(data.month.split("-")[1]) - 1]} ${data.month.split("-")[0]}`
    : "Taqvim";

  // Tanlangan kunda nima ishda turgani
  const pickedDay = picked ? dayNo(picked) : null;
  const dayProjects = (data?.projects || []).filter(
    (p) => pickedDay !== null && dayNo(p.from) <= pickedDay && pickedDay <= dayNo(p.to));
  const dayTasks = (data?.tasks || []).filter(
    (t) => pickedDay !== null && dayNo(t.from) <= pickedDay && pickedDay <= dayNo(t.to));

  return (
    <>
      <PageHead
        title={<strong>Taqvim</strong>}
        subtitle="Loyiha butun davri bo'yicha ko'rinadi — boshlanishdan muddatgacha"
      />

      <div className="content">
        <ErrorMsg error={error} />
        {!data ? <Loading /> : (
          <>
            <div className="card mb">
              {/* Oy nomi, sanoq va boshqaruv - taqvimning o'z ustida turadi:
                  odam bir joyga qarab turib oyni almashtiradi. */}
              <div className="cal-bar-top">
                <h3>{title}</h3>
                <span className="badge">{data.total}</span>
                {showTasks && !!data.task_total && (
                  <span className="badge badge-info">{data.task_total} vazifa</span>
                )}
                <span className="spacer" />
                <label className="cal-check" title="Vazifalarni ham ko'rsatish">
                  <input type="checkbox" checked={showTasks}
                         onChange={() => setShowTasks((v) => !v)} />
                  Vazifalar
                </label>
                <div className="cal-nav">
                  <button type="button" title="Oldingi oy"
                          onClick={() => set("oy", shiftMonth(data.month, -1))}>‹</button>
                  <button type="button" title="Joriy oy"
                          onClick={() => set("oy", "")}>Bugun</button>
                  <button type="button" title="Keyingi oy"
                          onClick={() => set("oy", shiftMonth(data.month, 1))}>›</button>
                </div>
              </div>

              <div className="cal">
                <div className="cal-head">
                  {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
                </div>

                {weeks.map((week) => {
                  const wFrom = week[0];
                  const wTo = week[6];
                  // Shu haftaga tegadigan tasmalar, hafta chegarasiga qirqilgan
                  const inWeek = bars
                    .filter((b) => b.to >= wFrom && b.from <= wTo)
                    .map((b) => ({ ...b, from: Math.max(b.from, wFrom), to: Math.min(b.to, wTo) }));
                  const { placed, laneCount } = assignLanes(inWeek);

                  return (
                    <div className="cal-week" key={wFrom}
                         /* `repeat(0, ...)` yaroqsiz CSS - tasmasiz haftada ham kamida
                            bitta qator qoldiramiz. */
                         style={{ gridTemplateRows: `auto repeat(${Math.max(laneCount, 1)}, 20px)` }}>
                      {/* Ustun foni - butun hafta balandligiga cho'ziladi */}
                      {week.map((d, i) => {
                        const iso = isoOf(d);
                        const outside = iso < data.first_day || iso > data.last_day;
                        return (
                          <div key={`c${d}`}
                               className={`cal-col ${outside ? "out" : ""}`
                                          + (iso === data.today ? " today" : "")
                                          + (iso === picked ? " picked" : "")}
                               style={{ gridColumn: i + 1 }}
                               onClick={() => set("kun", iso === picked ? "" : iso)} />
                        );
                      })}

                      {/* Kun raqami va o'sha kungi loyiha sanog'i */}
                      {week.map((d, i) => {
                        const iso = isoOf(d);
                        const outside = iso < data.first_day || iso > data.last_day;
                        const n = counts[iso] || 0;
                        return (
                          <div className={`cal-daynum ${outside ? "out" : ""}`
                                          + (iso === data.today ? " today" : "")} key={`n${d}`}
                               style={{ gridColumn: i + 1, gridRow: 1 }}>
                            {/* Faqat loyiha boshlangan kunda - har kunda
                                turgan raqam ma'no bermasdi. */}
                            {!outside && !!n && (
                              <span className="cal-count"
                                    title={`${n} ta loyiha shu kuni boshlangan`}>{n}</span>
                            )}
                            <span className="spacer" />
                            <span className="cal-d">{dayOfMonth(d)}</span>
                          </div>
                        );
                      })}

                      {/* Tasmalar */}
                      {placed.map(({ bar, lane }) => (
                        <Link
                          key={bar.key + bar.from}
                          to={bar.to_}
                          title={bar.kind === "task"
                            ? `${bar.label} — ${bar.people}`
                            : `${bar.label}${bar.openEnded ? " (muddat qo'yilmagan)" : ""}`}
                          className={`cal-bar ${bar.kind}`
                                     + (bar.overdue ? " overdue" : "")
                                     + (bar.done ? " done" : "")
                                     + (bar.startsHere ? " starts" : "")
                                     + (bar.endsHere ? " ends" : "")}
                          style={{
                            gridColumn: `${weekday(bar.from) + 1} / ${weekday(bar.to) + 2}`,
                            gridRow: lane + 2,
                            ["--bar" as string]: bar.color,
                          }}
                        >
                          {bar.label}
                          {bar.kind === "task" && bar.people && (
                            <span className="cal-who"> · {bar.people}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {picked ? (
              <Card title={`${dayOfMonth(dayNo(picked))}-${MONTHS[Number(picked.split("-")[1]) - 1].toLowerCase()}`}
                    badge={<button className="btn btn-sm" onClick={() => set("kun", "")}>Yopish</button>}
                    padded={false}>
                {!dayProjects.length && !dayTasks.length ? (
                  <Empty title="Bu kuni hech narsa yo'q" text="Boshqa kunni tanlang." />
                ) : (
                  <div className="card-list">
                    {dayProjects.map((p) => (
                      <div className="card-body tight row wrap" key={`dp${p.id}`}>
                        <span className="lang-dot" style={{ background: p.color }} />
                        <Link to={`/loyiha/${p.id}`}><strong>{p.name}</strong></Link>
                        <span className="badge">{p.status_display}</span>
                        {p.overdue && <span className="badge badge-danger">kechikkan</span>}
                        <span className="spacer" />
                        <small className="muted nowrap">
                          {p.start_date} → {p.due_date || "muddat qo'yilmagan"}
                          {p.manager_name && ` · PM: ${p.manager_name}`}
                        </small>
                      </div>
                    ))}
                    {showTasks && dayTasks.map((t) => (
                      <div className="card-body tight row wrap" key={`dt${t.id}`}>
                        <span className="badge mono">{t.code}</span>
                        <Link to={`/vazifa/${t.id}`}>{t.title}</Link>
                        <span className="badge">{t.status_display}</span>
                        {t.overdue && <span className="badge badge-danger">kechikkan</span>}
                        <span className="spacer" />
                        {t.assignees.length ? (
                          <span className="row" style={{ gap: 6 }}>
                            {t.assignees.map((u) => (
                              <span className="row" style={{ gap: 4 }} key={u.id}>
                                <Avatar user={u} size="sm" />
                                <small>{u.full_name}</small>
                              </span>
                            ))}
                          </span>
                        ) : <small className="muted">biriktirilmagan</small>}
                        <small className="muted nowrap">
                          {" · "}{t.due_date || t.start_date}
                        </small>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : (
              !data.total && !data.task_total && (
                <Empty icon="🗓" title="Bu oyda hech narsa yo'q"
                       text="Boshqa oyni ko'ring yoki loyihaga muddat qo'ying." />
              )
            )}
          </>
        )}
      </div>
    </>
  );
}
