/**
 * Taqvim — shu oyda NIMANING MUDDATI qachon tugashi.
 *
 * Taqvimda faqat TUGASH sanalari turadi: loyiha ham, vazifa ham o'z muddati
 * kunida ko'rinadi. Ilgari har biri boshlanishdan muddatgacha tasma bo'lib
 * cho'zilardi — oy tasmalar bilan to'lib ketar, "shu kuni nima topshirilishi
 * kerak" degan savolga esa javob topib bo'lmasdi.
 *
 * Muddat qo'yilmagan loyiha va vazifa taqvimda umuman turmaydi — uni
 * qo'yadigan kun yo'q.
 *
 * Vazifalar ijrochisi bilan ko'rsatiladi va alohida yoqib-o'chiriladi.
 *
 * Sana hisobi UTC da yuritiladi (`Date.UTC`): server "YYYY-MM-DD" yuboradi,
 * uni mahalliy `new Date()` ga bersak mintaqa tufayli kun surilib ketardi.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { CalendarMonth, CalendarProject, CalendarTask } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, Empty, ErrorMsg, Loading, fmtDate } from "@/components/ui";
import { toProject, toTask, useNavParams } from "@/nav";
import { tx } from "@/i18n";

const WEEKDAYS = ["dushanba", "seshanba", "chorshanba", "payshanba",
                  "juma", "shanba", "yakshanba"];
const MONTHS = [tx("calendar.yanvar"), tx("calendar.fevral"), tx("calendar.mart"), tx("calendar.aprel"), tx("calendar.may"), tx("calendar.iyun"),
                tx("calendar.iyul"), tx("calendar.avgust"), tx("calendar.sentabr"), tx("calendar.oktabr"), tx("calendar.noyabr"), tx("calendar.dekabr")];

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
  /** Vazifa holati - tasma rangi shunga qarab tanlanadi. */
  status?: string;
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
 * Bitta kunda ko'rinadigan tasmalar soni.
 *
 * NEGA CHEGARA KERAK. Har tasma o'z qatorini oladi, hafta balandligi esa eng
 * band kunga qarab o'sadi: bitta kunga 33 ta vazifa muddati tushsa o'sha
 * hafta 660 piksel bo'lib cho'ziladi va oy setkasi ekranga sig'may qoladi -
 * qolgan kunlar bo'm-bo'sh turgani holda. Endi kun uchta tasmadan keyin
 * yig'iladi, qolgani «+N ta» tugmasiga aylanadi va bosilganda o'sha kunning
 * to'liq ro'yxati CHETDAGI panelda ochiladi (`aside.cal-day`).
 */
const LANE_LIMIT = 3;


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
  const [params, setParams] = useNavParams();
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
      setError(tx("calendar.taqvimni_yuklab_bolmadi"));
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
      done: t.done, status: t.status, startsHere: t.starts_here, endsHere: t.ends_here,
      to_: `/vazifa/${t.id}`,
      people: t.assignees.map((u) => u.full_name).join(", ") || "biriktirilmagan",
    }));
    return [...fromProjects, ...fromTasks];
  }, [data, showTasks]);

  /** Kun -> o'sha kungi sanoqlar (loyihalar va vazifalar holat bo'yicha). */
  const byDay = useMemo(() => {
    const map: Record<string, CalendarMonth["days"][number]> = {};
    for (const d of data?.days || []) map[d.date] = d;
    return map;
  }, [data]);

  const title = data
    ? `${MONTHS[Number(data.month.split("-")[1]) - 1]} ${data.month.split("-")[0]}`
    : tx("calendar.taqvim");

  // Tanlangan kunda nima ishda turgani
  const pickedDay = picked ? dayNo(picked) : null;
  const dayProjects = (data?.projects || []).filter(
    (p) => pickedDay !== null && dayNo(p.from) <= pickedDay && pickedDay <= dayNo(p.to));
  const dayTasks = (data?.tasks || []).filter(
    (t) => pickedDay !== null && dayNo(t.from) <= pickedDay && pickedDay <= dayNo(t.to));

  return (
    <>
      <PageHead
        title={<strong>{tx("calendar.taqvim")}</strong>}
      />

      <div className="content">
        <ErrorMsg error={error} />
        {!data ? <Loading /> : (
          <>
            {/* Taqvim chapda, tanlangan kun O'NGDA. Ilgari kun ro'yxati
                taqvimning ostida ochilardi: uni ko'rish uchun sahifani
                pastga aylantirish kerak edi va o'sha payt taqvimning o'zi
                ekrandan chiqib ketardi - qaysi kun tanlanganini ko'rib
                bo'lmasdi. Endi ikkovi bir ekranda turadi. */}
            <div className={`cal-layout ${picked ? "with-day" : ""}`}>
            <div className="card">
              {/* Oy nomi, sanoq va boshqaruv - taqvimning o'z ustida turadi:
                  odam bir joyga qarab turib oyni almashtiradi. */}
              <div className="cal-bar-top">
                <h3>{title}</h3>
                <span className="badge">{data.total}</span>
                {showTasks && !!data.task_total && (
                  <span className="badge badge-info">{data.task_total} {tx("calendar.vazifa")}</span>
                )}
                {/* Ro'yxat qirqilgan bo'lsa aytib qo'yamiz - ijrochi
                    "nega jamoaning muddatlari ko'rinmayapti" deb
                    o'ylamasin. Cheklovsiz odamga bu satr chizilmaydi. */}
                {showTasks && data.tasks_limited && (
                  <small className="muted">
                    {tx("calendar.ijrochi_bolgan_loyihalarda_faqat_sizning")}
                  </small>
                )}
                <span className="spacer" />
                <label className="cal-check" title={tx("calendar.vazifalarni_ham_korsatish")}>
                  <input type="checkbox" checked={showTasks}
                         onChange={() => setShowTasks((v) => !v)} />
                  {tx("common.vazifalar")}
                </label>
                {/* Rang izohi: rangni ko'rgan odam nimani anglatishini
                    taxmin qilib o'tirmasin. */}
                {showTasks && (
                  <div className="cal-legend">
                    <span><i className="cal-st-TODO" /> {tx("common.nazoratda")}</span>
                    <span><i className="cal-st-IN_PROGRESS" /> {tx("common.jarayonda")}</span>
                    <span><i className="cal-st-DONE" /> {tx("common.bajarildi")}</span>
                    <span><i className="cal-legend-late" /> {tx("calendar.muddati_otgan")}</span>
                  </div>
                )}
                <div className="cal-nav">
                  <button type="button" title={tx("calendar.oldingi_oy")}
                          onClick={() => set("oy", shiftMonth(data.month, -1))}>‹</button>
                  <button type="button" title={tx("calendar.joriy_oy")}
                          onClick={() => set("oy", "")}>{tx("common.bugun")}</button>
                  <button type="button" title={tx("calendar.keyingi_oy")}
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

                  // Chegaradan oshgani chizilmaydi - kun bo'yicha sanaladi va
                  // «+N ta» bo'lib ko'rinadi. Tasma bir necha kunga cho'zilishi
                  // mumkin, shuning uchun har bir kuni alohida hisoblanadi.
                  const visible = placed.filter((x) => x.lane < LANE_LIMIT);
                  const moreByDay = new Map<number, number>();
                  for (const { bar, lane } of placed) {
                    if (lane < LANE_LIMIT) continue;
                    for (let d = bar.from; d <= bar.to; d += 1) {
                      moreByDay.set(d, (moreByDay.get(d) || 0) + 1);
                    }
                  }
                  // `repeat(0, ...)` yaroqsiz CSS - tasmasiz haftada ham kamida
                  // bitta qator qoldiramiz.
                  const laneRows = Math.max(Math.min(laneCount, LANE_LIMIT), 1);
                  const rows = laneRows + (moreByDay.size ? 1 : 0);

                  return (
                    <div className="cal-week" key={wFrom}
                         style={{ gridTemplateRows: `auto repeat(${rows}, 20px)` }}>
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
                        const day = byDay[iso];
                        const tasksToday = day
                          ? day.todo + day.in_progress + day.done : 0;
                        return (
                          <div className={`cal-daynum ${outside ? "out" : ""}`
                                          + (iso === data.today ? " today" : "")} key={`n${d}`}
                               style={{ gridColumn: i + 1, gridRow: 1 }}>
                            {/* Kun raqami chapda, o'ng chetda esa o'sha kungi UCHTA
                                raqam: nazoratda / jarayonda / bajarilgan. Tasmalarni
                                sanab chiqmasdan turib "shu kun qanday ketyapti"
                                ko'rinib tursin - ayniqsa kun uchta tasmadan keyin
                                yig'ilganda.

                                Loyihalar sanog'i (ko'k doiradagi raqam) bu yerdan
                                olib tashlandi: kun katagida ikkita boshqa-boshqa
                                narsani sanaydigan raqamlar yonma-yon turardi va
                                qaysi biri nima ekani tushunarsiz edi. Loyiha
                                muddati o'z tasmasi bo'lib ko'rinib turibdi. */}
                            <span className="cal-d">{dayOfMonth(d)}</span>
                            <span className="spacer" />
                            {!outside && showTasks && !!tasksToday && (
                              <span className="cal-mini"
                                    title={`Nazoratda ${day.todo} · Jarayonda ${day.in_progress}`
                                           + ` · Bajarildi ${day.done}`}>
                                <b className="st-todo">{day.todo}</b>
                                <i>/</i>
                                <b className="st-prog">{day.in_progress}</b>
                                <i>/</i>
                                <b className="st-done">{day.done}</b>
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Tasmalar */}
                      {visible.map(({ bar, lane }) => (
                        <Link
                          key={bar.key + bar.from}
                          to={bar.to_}
                          title={bar.kind === "task"
                            ? `${bar.label} — ${bar.people}`
                            : `${bar.label}${bar.openEnded ? tx("calendar.muddat_qoyilmagan_2") : ""}`}
                          className={`cal-bar ${bar.kind}`
                                     + (bar.status ? ` cal-st-${bar.status}` : "")
                                     + (bar.overdue ? " overdue" : "")
                                     + (bar.done ? " done" : "")
                                     + (bar.startsHere ? " starts" : "")
                                     + (bar.endsHere ? " ends" : "")}
                          style={{
                            gridColumn: `${weekday(bar.from) + 1} / ${weekday(bar.to) + 2}`,
                            gridRow: lane + 2,
                            // Rang FAQAT loyiha tasmasiga inline beriladi.
                            // Vazifada u holatga qarab CSS dan keladi, inline
                            // qiymat esa har qanday sinfni bosib qo'yardi -
                            // shuning uchun bu yerda umuman yozilmaydi.
                            ...(bar.kind === "project"
                              ? { ["--bar" as string]: bar.color }
                              : {}),
                          }}
                        >
                          {bar.label}
                          {bar.kind === "task" && bar.people && (
                            <span className="cal-who"> · {bar.people}</span>
                          )}
                        </Link>
                      ))}

                      {/* Sig'magani - «+N ta». Bosilganda o'sha kunning to'liq
                          ro'yxati chetdagi panelda ochiladi: kun katagi
                          cho'zilmaydi, ma'lumot esa yo'qolmaydi. */}
                      {week.map((d, i) => {
                        const extra = moreByDay.get(d) || 0;
                        if (!extra) return null;
                        const iso = isoOf(d);
                        return (
                          <button type="button" key={`m${d}`} className="cal-more"
                                  style={{ gridColumn: i + 1, gridRow: laneRows + 2 }}
                                  title={tx("calendar.yana_nechta_ochish", { n: extra })}
                                  onClick={() => set("kun", iso)}>
                            +{extra} {tx("common.ta")}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {picked && (
              <aside className="cal-day">
              <Card title={`${dayOfMonth(dayNo(picked))}-${MONTHS[Number(picked.split("-")[1]) - 1].toLowerCase()}`}
                    badge={<button className="btn btn-sm" onClick={() => set("kun", "")}>{tx("common.yopish")}</button>}
                    padded={false}>
                {!dayProjects.length && !dayTasks.length ? (
                  <Empty title={tx("calendar.bu_kuni_hech_narsa_yoq")} text={tx("calendar.boshqa_kunni_tanlang")} />
                ) : (
                  <div className="card-list">
                    {dayProjects.map((p) => (
                      <div className="card-body tight row wrap" key={`dp${p.id}`}>
                        <span className="lang-dot" style={{ background: p.color }} />
                        <Link {...toProject(p.id)}><strong>{p.name}</strong></Link>
                        <span className="badge">{p.status_display}</span>
                        {p.overdue && <span className="badge badge-danger">{tx("calendar.kechikkan")}</span>}
                        <span className="spacer" />
                        <small className="muted nowrap">
                          {fmtDate(p.start_date)} → {p.due_date ? fmtDate(p.due_date) : tx("calendar.muddat_qoyilmagan")}
                          {p.manager_name && ` · PM: ${p.manager_name}`}
                        </small>
                      </div>
                    ))}
                    {showTasks && dayTasks.map((t) => (
                      <div className="card-body tight row wrap" key={`dt${t.id}`}>
                        <span className="badge mono">{t.code}</span>
                        <Link {...toTask(t.id)}>{t.title}</Link>
                        <span className="badge">{t.status_display}</span>
                        {t.overdue && <span className="badge badge-danger">{tx("calendar.kechikkan")}</span>}
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
                        ) : <small className="muted">{tx("calendar.biriktirilmagan")}</small>}
                        <small className="muted nowrap">
                          {" · "}{fmtDate(t.due_date || t.start_date)}
                        </small>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              </aside>
            )}
            </div>

            {!picked && !data.total && !data.task_total && (
              <Empty icon="🗓" title={tx("calendar.bu_oyda_tugaydigan_ish_yoq")}
                     text={tx("calendar.boshqa_oyni_koring_yoki_loyiha")} />
            )}
          </>
        )}
      </div>
    </>
  );
}
