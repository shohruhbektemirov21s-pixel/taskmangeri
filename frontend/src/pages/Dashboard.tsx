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
import { useState } from "react";
import { Link } from "react-router-dom";
import { listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type {
  DashboardData, DashboardPeriod, DashboardPeriodRow, DashboardScope, Task,
} from "@/api/types";
import { useLive } from "@/realtime/RealtimeContext";
import {
  Card, Empty, ErrorMsg, Loading, Priority, StatusBadge, fmtDate,
} from "@/components/ui";
import { toTask } from "@/nav";

// Davr sarlavhalari. Kalitlar serverdagi `PERIODS` bilan bir xil, tartibni
// esa server beradi - bu yerda faqat o'zbekcha nomi turadi.
const LABELS: Record<DashboardPeriod, string> = {
  year: "Yil boshidan",
  month: "Oy boshidan",
  week: "Hafta boshidan",
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
  all: "Butun tizim bo'yicha",
  managed: "Boshqaruvingizdagi loyihalar bo'yicha",
  mine: "Sizga biriktirilgan ishlar bo'yicha",
};

/** Taxtadagi uchta ustun: nomi, kaliti va nimani sanashi. */
const COLUMNS = [
  { key: "todo", label: "Nazoratda",
    hint: "Shu davrda ochilgan va hamon yopilmagan ishlaringiz" },
  { key: "overdue", label: "Muddati o'tgan",
    hint: "Muddati shu davrga tushgan va o'tib ketgan ishlaringiz" },
  { key: "done", label: "Bajarilganlar",
    hint: "Shu davrda yakunlangan ishlaringiz" },
] as const;

/**
 * Muddat holati — pastki qator.
 *
 * Uchovi butun tarix bo'yicha va bir-birini takrorlamaydi: yopilmagan ish
 * yo kechikkan, yo hali kutilmoqda.
 */
const DEADLINE_CARDS = [
  { key: "late_done", label: "Muddati buzib bajarilgan",
    hint: "Yakunlangan, lekin muddatidan keyin yopilgan ishlaringiz" },
  { key: "overdue", label: "Muddati o'tgan",
    hint: "Hali yopilmagan va muddati o'tib ketgan ishlaringiz" },
  { key: "waiting", label: "Kutilmoqda",
    hint: "Yopilmagan, muddati hali kelmagan yoki qo'yilmagan ishlaringiz" },
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
  return (
    <section className="stat-band">
      <header className="stat-band-head">
        <h2 className="stat-band-title">{LABELS[p.key]}</h2>
        {/* Qaysi sanadan sanalayotgani ko'rinib tursin - «yil boshidan»
            degani odamga aniq kunni aytmaydi. */}
        <p className="stat-band-since">{fmtDate(p.since)} — bugun</p>
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

/** Bosilgan katakdagi ishlar - panelning ostida. */
function PickedTasks({ picked, onClose }: { picked: Picked; onClose: () => void }) {
  const { data, loading } = useFetch<any>("/dashboard/tasks/",
    { period: picked.period || "", metric: picked.metric });
  const tasks = data ? listOf<Task>(data) : null;

  return (
    <Card title={picked.title} padded={false}
          badge={data ? <span className="badge">{data.count}</span> : undefined}
          action={<button type="button" className="btn btn-sm" onClick={onClose}>Yopish</button>}>
      {loading ? <Loading /> : !tasks?.length ? (
        <Empty title="Ish yo'q" text="Bu katakka kirgan vazifa topilmadi." />
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
      {/* Ro'yxat yuztada cheklangan - jimgina qirqilmasin. */}
      {data && data.count > tasks!.length && (
        <div className="card-body muted" style={{ fontSize: 12.5 }}>
          {data.count} tadan {tasks!.length} tasi ko'rsatildi — qolganini
          «Mening ishim» yoki loyiha ro'yxatidan ko'ring.
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

  if (loading) return <div className="content"><Loading text="Panel yuklanmoqda..." /></div>;
  if (!d) return <div className="content"><ErrorMsg error={error || "Panelni yuklab bo'lmadi."} /></div>;

  return (
    <div className="content">
      <p className="scope-note">{SCOPE_LABELS[d.scope]}</p>

      <div className="period-grid">
        {d.periods.map((p) => (
          <Band p={p} key={p.key} picked={picked} onPick={setPicked} />
        ))}
      </div>
      <Deadlines d={d.deadlines} picked={picked} onPick={setPicked} />

      {picked && (
        <div className="mt">
          <PickedTasks picked={picked} onClose={() => setPicked(null)} />
        </div>
      )}
    </div>
  );
}
