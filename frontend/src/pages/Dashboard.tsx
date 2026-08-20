/**
 * Bosh panel — davr kesimi va muddat holati, boshqa hech narsa.
 *
 * Panel ilgari hamma narsani bir ekranga sig'dirardi: salomlashuv, bugungi
 * kesim, olti-yettita katak, ogohlantirish, menejer kesimi, tekshiruv
 * navbati, jamoa jadvali, loyihalar ro'yxati va jamoa yig'gich. Har biri
 * alohida foydali edi-yu, birga turganda asosiy savol — «qancha ish bor va
 * qanchasi bajarildi» — ekranning pastiga tushib ketardi.
 *
 * Endi yuqorida yil, oy va hafta kesimi BIRVARAKAYIGA ko'rinadi — tanlagich
 * bo'lsa, odam yillik sonni oylik bilan solishtirish uchun tugmani u yoq-bu
 * yoqqa bosib turishi kerak bo'lardi. Pastda esa muddat holati.
 *
 * Hamma raqam `/api/dashboard/` dan keladi va u Db2 ni ORM orqali o'qiydi:
 * bu yerda hech qanday hisob-kitob ham, namuna qiymat ham yo'q.
 */
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type {
  DashboardData, DashboardPeriod, DashboardPeriodRow, DashboardScope, Task,
} from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { useLive } from "@/realtime/RealtimeContext";
import { PageHead } from "@/components/Layout";
import {
  Card, Empty, ErrorMsg, Loading, Pager, Priority, StatusBadge, fmtDate,
} from "@/components/ui";
import { toTask } from "@/nav";
import { tx } from "@/i18n";

// Davr sarlavhalari. Kalitlar serverdagi `PERIODS` bilan bir xil, tartibni
// esa server beradi - bu yerda faqat o'zbekcha nomi turadi.
const LABELS: Record<DashboardPeriod, string> = {
  year: "Yil boshidan",
  month: "Oy boshidan",
  week: tx("dashboard.hafta_boshidan"),
};

/**
 * Raqamlar KIMNIKI ekani yozib qo'yiladi.
 *
 * Ilgari panel faqat odamning o'ziga biriktirilgan ishlarini sanardi va
 * menejer loyihasida ikkita ochiq ish tursa ham «0» ko'rardi. Endi qamrov
 * rolga qarab kengayadi - lekin buni AYTIB qo'ymasak, «bu mening ishimmi
 * yoki jamoanikimi» degan savol javobsiz qolardi.
 */
const SCOPE_LABELS: Record<DashboardScope, string> = {
  all: tx("dashboard.butun_tizim_boyicha"),
  managed: tx("dashboard.boshqaruvingizdagi_loyihalar_boyicha"),
  mine: tx("dashboard.sizga_biriktirilgan_ishlar_boyicha"),
};

/** Taxtadagi uchta ustun: nomi, kaliti va nimani sanashi. */
const COLUMNS = [
  { key: "todo", label: tx("common.nazoratda"),
    hint: tx("dashboard.shu_davrda_ochilgan_va_hamon") },
  { key: "overdue", label: tx("dashboard.muddati_otgan"),
    hint: tx("dashboard.muddati_shu_davrga_tushgan_va") },
  { key: "done", label: tx("dashboard.bajarilganlar"),
    hint: tx("dashboard.shu_davrda_yakunlangan_ishlaringiz") },
] as const;

/**
 * Muddat holati — pastki qator.
 *
 * Uchovi butun tarix bo'yicha va bir-birini takrorlamaydi: yopilmagan ish
 * yo kechikkan, yo hali kutilmoqda.
 */
const DEADLINE_CARDS = [
  { key: "late_done", label: tx("dashboard.muddati_buzib_bajarilgan"),
    hint: tx("dashboard.yakunlangan_lekin_muddatidan_keyin_yopilgan") },
  { key: "overdue", label: tx("dashboard.muddati_otgan"),
    hint: tx("dashboard.hali_yopilmagan_va_muddati_otib") },
  { key: "waiting", label: tx("dashboard.kutilmoqda"),
    hint: tx("dashboard.yopilmagan_muddati_hali_kelmagan_yoki") },
] as const;

/** Bosilgan katak: qaysi davr va qaysi ko'rsatkich. */
interface Picked {
  period?: DashboardPeriod;
  metric: string;
  title: string;
}

function Band({ p, onPick, picked }: {
  p: DashboardPeriodRow;
  onPick: (v: Picked) => void;
  picked: Picked | null;
}) {
  // Sarlavha bosilsa - BUTUN taxta: nazoratdagi, muddati o'tgan va
  // bajarilgan ishlar bitta ro'yxatda. Katakning o'zi bosilsa - faqat
  // o'sha ustun.
  //
  // Ya'ni «yil boshidan nima bo'ldi» degan savolga uchta katakni navbat
  // bilan bosmasdan javob olinadi. Shart serverda ham bitta joyda
  // (`panel_metric_q` dagi `period`) - sanoq bilan ro'yxat ajralib
  // ketmasin.
  //
  // Ro'yxatdagi son uchta katakning YIG'INDISI bo'lmasligi mumkin va bu
  // to'g'ri: bitta ish ham «nazoratda», ham «muddati o'tgan» bo'lishi
  // mumkin, ro'yxatda esa u bir marta turadi.
  const hasAny = Boolean(p.todo || p.overdue || p.done);

  const pickBand = () => {
    if (!hasAny) return;
    onPick({ period: p.key, metric: "period",
             title: `${LABELS[p.key]} — hammasi` });
  };

  return (
    <section className="stat-band">
      {/* `<header>` `<button>` ga aylantirilmadi: ichida `<h2>` va `<p>` bor,
          ular tugma ichida yaroqsiz. Shuning uchun tugma ROLI beriladi -
          klaviatura bilan ham ochiladi. */}
      <header className={`stat-band-head ${hasAny ? "pickable" : ""}`
                         + (picked?.period === p.key && picked?.metric === "period"
                            ? " picked" : "")}
              role={hasAny ? "button" : undefined}
              tabIndex={hasAny ? 0 : undefined}
              title={hasAny
                ? tx("dashboard.davr_kesimi_izohi", { davr: LABELS[p.key] })
                : tx("dashboard.bu_davrda_ish_yoq")}
              onClick={pickBand}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pickBand();
                }
              }}>
        <h2 className="stat-band-title">{LABELS[p.key]}</h2>
        {/* Qaysi sanadan sanalayotgani ko'rinib tursin - «yil boshidan»
            degani odamga aniq kunni aytmaydi. */}
        <p className="stat-band-since">{fmtDate(p.since)} {tx("dashboard.bugun")}</p>
      </header>

      <div className="stat-band-row">
        {COLUMNS.map((col) => {
          const active = picked?.period === p.key && picked?.metric === col.key;
          return (
            // Katak BOSILADI: raqamni ko'rgan odam "bu qaysi ishlar?" degan
            // savolni sahifani tark etmasdan ochadi. Nol bo'lsa bosilmaydi -
            // bo'sh ro'yxat ochish faqat chalg'itadi.
            <button type="button" key={col.key} title={col.hint}
                    className={`stat-band-cell ${p[col.key] ? "pickable" : ""}`
                               + (active ? " picked" : "")}
                    disabled={!p[col.key]}
                    onClick={() => onPick({
                      period: p.key, metric: col.key,
                      title: `${LABELS[p.key]} — ${col.label}`,
                    })}>
              {/* Nol - so'ngan rangda: bo'sh katak ko'zni tortmasin,
                  haqiqiy son esa darrov ajralib tursin. */}
              <span className={`v ${p[col.key] ? "" : "zero"}`}>{p[col.key]}</span>
              <span className="k">{col.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Muddat kartalari serverdagi ko'rsatkich nomiga moslanadi: kartaning
// kaliti «overdue», endpointda esa «overdue_now» (davr katagidagi
// «overdue» dan farqli - bu butun tarix bo'yicha).
const DEADLINE_METRIC: Record<string, string> = {
  late_done: "late_done", overdue: "overdue_now", waiting: "waiting",
};

function Deadlines({ d, onPick, picked }: {
  d: DashboardData["deadlines"];
  onPick: (v: Picked) => void;
  picked: Picked | null;
}) {
  return (
    <div className="deadline-grid">
      {DEADLINE_CARDS.map((c) => {
        const metric = DEADLINE_METRIC[c.key];
        const active = !picked?.period && picked?.metric === metric;
        return (
          <button type="button" key={c.key} title={c.hint}
                  className={`deadline-card ${d[c.key] ? "pickable" : ""}`
                             + (active ? " picked" : "")}
                  disabled={!d[c.key]}
                  onClick={() => onPick({ metric, title: c.label })}>
            <span className="k">{c.label}</span>
            <span className={`v ${d[c.key] ? "" : "zero"}`}>{d[c.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Ro'yxat ustidagi «Muddat» tanlagichi.
 *
 * Kalitlar serverdagi `DUE_RANGES` bilan bir xil, oraliqni ham server
 * hisoblaydi: «shu hafta» dushanbadan yakshanbagacha, «shu oy» oyning
 * birinchi kunidan oxirigacha - ya'ni KALENDAR davri, «oxirgi 7 kun»
 * emas. Chegara Toshkent kunidan yasalgani uchun tunda ham siljimaydi.
 */
const DUE_OPTIONS = [
  { value: "today", label: tx("common.bugun") },
  { value: "yesterday", label: tx("dashboard.kecha") },
  { value: "tomorrow", label: tx("dashboard.ertaga") },
  { value: "week", label: tx("dashboard.shu_hafta") },
  { value: "month", label: tx("dashboard.shu_oy") },
  { value: "year", label: tx("dashboard.shu_yil") },
] as const;

const EMPTY_FILTERS = {
  search: "", due: "", status: "", project: "",
};
type Filters = typeof EMPTY_FILTERS;
type FilterKey = keyof Filters;

/** `/dashboard/tasks/` javobi. */
interface PanelTasksData {
  count: number;
  /** Joriy sahifa (1 dan boshlanadi) va jami sahifalar soni. */
  page: number;
  pages: number;
  page_size: number;
  results: Task[];
  /**
   * Tanlagichlar uchun ro'yxatlar - SHU katakdagi ishlardan yig'ilgan.
   *
   * Server ularni filtrdan OLDINGI to'plamdan oladi: aks holda loyihani
   * tanlagan odam qolgan loyihalarni tanlagichdan yo'qotib qo'yardi va
   * tanlovini ortga qaytara olmasdi.
   */
  facets: {
    projects: { id: number; name: string }[];
  };
}

interface ComboOption {
  value: string;
  name: string;
}

/**
 * YOZIB qidiriladigan tanlagich.
 *
 * Oddiy `<select>` yigirmata odam bo'lganda ish bermay qoldi: ochilgan
 * ro'yxat butun ekranni to'ldirar, kerakli ismni topish uchun uni ko'z
 * bilan aylantirib chiqish kerak edi. Bu yerda maydonga YOZILADI -
 * ro'yxat harflar bo'yicha qisqaradi, sichqoncha bilan tanlash esa
 * joyida qoladi.
 *
 * Ro'yxat serverdan emas, TAYYOR massivdan elanadi: u allaqachon shu
 * katakdagi odamlar (yoki loyihalar) bilan cheklangan va o'nlab
 * yozuvdan oshmaydi - har harfga so'rov yuborishning hojati yo'q.
 */
function Combo({ id, label, options, value, onChange, placeholder }: {
  id: string;
  label: string;
  options: ComboOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const chosen = options.find((o) => o.value === value) || null;
  // Yopiq turganda maydonda TANLANGANI ko'rinadi, ochilganda - yozilgani.
  const text = open ? q : (chosen?.name || "");

  const needle = q.trim().toLowerCase();
  const hits = needle
    ? options.filter((o) => o.name.toLowerCase().includes(needle))
    : options;

  const pick = (v: string) => {
    onChange(v);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="f combo">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={text} placeholder={placeholder} autoComplete="off"
             role="combobox" aria-expanded={open} aria-controls={id + "-list"}
             onChange={(e) => { setQ(e.target.value); setOpen(true); }}
             // Fokus tushganda maydon bo'shaydi: tanlangan ismning ustiga
             // yozib o'tirmasdan darrov yangisini izlash mumkin bo'lsin.
             onFocus={() => { setQ(""); setOpen(true); }}
             onBlur={() => setOpen(false)}
             onKeyDown={(e) => {
               if (e.key === "Escape") { setQ(""); setOpen(false); }
             }} />
      {open && (
        // `mousedown` to'xtatiladi: aks holda bosish paytida maydon fokusni
        // yo'qotib, ro'yxat `click` yetib kelgunicha yopilib ketardi.
        <div className="combo-list" id={id + "-list"} role="listbox"
             onMouseDown={(e) => e.preventDefault()}>
          <button type="button" className={"combo-item " + (value ? "" : "on")}
                  onClick={() => pick("")}>{tx("common.hammasi")}</button>
          {hits.map((o) => (
            <button key={o.value} type="button"
                    className={"combo-item " + (o.value === value ? "on" : "")}
                    onClick={() => pick(o.value)}>{o.name}</button>
          ))}
          {hits.length === 0 && <div className="combo-empty muted">{tx("dashboard.topilmadi")}</div>}
        </div>
      )}
    </div>
  );
}

/** Bosilgan katakdagi ishlar - panelning ostida. */
function PickedTasks({ picked, onClose }: { picked: Picked; onClose: () => void }) {
  const fid = useId();
  const { meta } = useAuth();
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  // Sahifa filtrdan ALOHIDA holatda: filtr o'zgarganda u birinchi sahifaga
  // qaytadi (`set` da), aks holda odam beshinchi sahifada turib qidiruv
  // yozsa bo'sh ekranga urilardi - natija ikki sahifaga sig'ib qolgan.
  const [page, setPage] = useState(1);
  const filtered = Object.values(f).some(Boolean);

  // Qidiruv va sahifalash SERVERDA: ekrandagi qatorlar ustida emas.
  // Ro'yxat sahifalarga bo'lingan, ya'ni brauzerdagi filtr faqat joriy
  // o'n beshtasini elasa, qolgan sahifalarda turgan natija «topilmadi»
  // bo'lib ko'rinardi.
  //
  // `debounceMs` - har bosilgan harf uchun so'rov ketmasin: "arxitektura"
  // so'zi 12 ta so'rov tug'dirardi.
  const { data, loading } = useFetch<PanelTasksData>("/dashboard/tasks/",
    { period: picked.period || "", metric: picked.metric, page, ...f },
    { debounceMs: 300 });
  const tasks = data ? listOf<Task>(data) : null;

  const projectOptions: ComboOption[] = (data?.facets.projects || [])
    .map((p) => ({ value: String(p.id), name: p.name }));
  const set = (k: FilterKey, v: string) => {
    setPage(1);
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const clear = () => { setPage(1); setF(EMPTY_FILTERS); };

  return (
    <Card title={picked.title} padded={false}
          badge={data ? <span className="badge">{data.count}</span> : undefined}
          action={<button type="button" className="btn btn-sm" onClick={onClose}>{tx("common.yopish")}</button>}>
      {/* Filtr qatori kartaning ICHIDA: u shu ro'yxatga tegishli, sahifaga
          emas - katak yopilsa filtr ham u bilan ketadi. */}
      <div className="filters filters-inline">
        <div className="f grow">
          <label htmlFor={fid + "-q"}>{tx("common.qidiruv")}</label>
          <input id={fid + "-q"} value={f.search} placeholder={tx("dashboard.kod_yoki_sarlavha")}
                 onChange={(e) => set("search", e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor={fid + "-due"}>{tx("common.muddat")}</label>
          <select id={fid + "-due"} value={f.due}
                  onChange={(e) => set("due", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            {DUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor={fid + "-st"}>{tx("common.holat")}</label>
          <select id={fid + "-st"} value={f.status}
                  onChange={(e) => set("status", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            {(meta?.task_status || []).map((s) => (
              <option key={s.value} value={String(s.value)}>{s.label}</option>
            ))}
          </select>
        </div>
        {/* Loyiha tanlagichi faqat tanlanadigan narsa bo'lganda ko'rinadi:
            bitta loyihali ro'yxatda u hech nimani o'zgartirmasdi, joyni
            esa egallardi. */}
        {projectOptions.length > 1 && (
          <Combo id={fid + "-pr"} label={tx("common.loyiha")} options={projectOptions}
                 value={f.project} onChange={(v) => set("project", v)}
                 placeholder={tx("dashboard.loyiha_nomini_yozing")} />
        )}
        {/* IJROCHI tanlagichi yo'q. Ro'yxat odamning O'Z kesimida ochiladi:
            ijrochida u doim bitta ismdan - o'zinikidan - iborat bo'lardi.
            Menejerga «kim nima qilyapti» uchun alohida sahifa bor
            («Vazifalar»), u shu ish uchun ancha qulay. */}
        {filtered && (
          <button type="button" className="btn" onClick={clear}>{tx("common.tozalash")}</button>
        )}
      </div>

      {loading ? <Loading /> : !tasks?.length ? (
        <Empty title={tx("dashboard.ish_yoq")}
               text={filtered
                 ? tx("dashboard.tanlangan_filtrga_mos_vazifa_topilmadi")
                 : tx("dashboard.bu_katakka_kirgan_vazifa_topilmadi")}>
          {filtered && (
            <button type="button" className="btn" onClick={clear}>{tx("common.filtrni_tozalash")}</button>
          )}
        </Empty>
      ) : (
        <div className="table-wrap"><table className="table">
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td className="nowrap mono muted">{t.code}</td>
                <td>
                  <Link {...toTask(t.id)}>{t.title}</Link>
                  <br /><small className="muted">{t.project_name}</small>
                </td>
                <td className="nowrap"><StatusBadge task={t} /></td>
                <td className="nowrap"><Priority task={t} /></td>
                <td className="nowrap muted right">{fmtDate(t.due_date)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {/* Ro'yxat sahifalarga bo'lingan - qolgani jimgina qirqilmaydi. */}
      {data && data.pages > 1 && (
        <div className="card-body pager-bar">
          <span className="muted">
            {data.count} {tx("common.tadan")} {(data.page - 1) * data.page_size + 1}—
            {Math.min(data.page * data.page_size, data.count)} {tx("common.tasi")}
          </span>
          <Pager page={data.page} pages={data.pages} onPick={setPage} />
        </div>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const [picked, setPicked] = useState<Picked | null>(null);

  // Xato yutilmaydi: sabab ekranga chiqadi, aks holda sahifa abadiy
  // «Yuklanmoqda» da qolardi.
  const { data: d, error, loading, reload } = useFetch<DashboardData>("/dashboard/");

  // Jonli: vazifa yoki loyiha o'zgarsa raqamlar o'zini yangilaydi.
  useLive((e) => {
    if (e.event === "task.update" || e.event === "project.update") reload();
  });

  // Nom yuklanayotganda ham turadi: aks holda paneldagi joyi bo'sh qolib,
  // ma'lumot kelgach sakrab paydo bo'lardi.
  const name = <strong>{tx("layout.bosh_panel")}</strong>;

  if (loading) {
    return (
      <>
        <PageHead title={name} />
        <div className="content"><Loading text={tx("dashboard.panel_yuklanmoqda")} /></div>
      </>
    );
  }
  if (!d) {
    return (
      <>
        <PageHead title={name} />
        <div className="content">
          <ErrorMsg error={error || tx("dashboard.panelni_yuklab_bolmadi")} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title={name} />

      <div className="content">
        {/* Raqamlar KIMNIKI ekani - `d.scope` rolga qarab kengayadi va
            buni aytmasak, «bu mening ishimmi yoki jamoanikimi» degan
            savol javobsiz qolardi. */}
        <p className="scope-note">{SCOPE_LABELS[d.scope]}</p>

        <div className="period-grid">
          {d.periods.map((p) => (
            <Band p={p} key={p.key} picked={picked} onPick={setPicked} />
          ))}
        </div>
        <Deadlines d={d.deadlines} picked={picked} onPick={setPicked} />

        {picked && (
          <div className="mt">
            {/* `key` - boshqa katak bosilganda ro'yxat YANGIDAN
                yig'ilsin: aks holda oldingi katakda qo'yilgan filtr
                yangisiga o'tib, odam bo'sh ro'yxat ko'rardi. */}
            <PickedTasks key={`${picked.period || ""}:${picked.metric}`}
                         picked={picked} onClose={() => setPicked(null)} />
          </div>
        )}
      </div>
    </>
  );
}
