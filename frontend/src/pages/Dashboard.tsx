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
import { useFetch } from "@/api/useFetch";
import type {
  DashboardData, DashboardPeriod, DashboardPeriodRow, DashboardScope,
} from "@/api/types";
import { useLive } from "@/realtime/RealtimeContext";
import { ErrorMsg, Loading, fmtDate } from "@/components/ui";

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

function Band({ p }: { p: DashboardPeriodRow }) {
  return (
    <section className="stat-band">
      <header className="stat-band-head">
        <h2 className="stat-band-title">{LABELS[p.key]}</h2>
        {/* Qaysi sanadan sanalayotgani ko'rinib tursin - «yil boshidan»
            degani odamga aniq kunni aytmaydi. */}
        <p className="stat-band-since">{fmtDate(p.since)} — bugun</p>
      </header>

      <div className="stat-band-row">
        {COLUMNS.map((col) => (
          <div className="stat-band-cell" key={col.key} title={col.hint}>
            {/* Nol - so'ngan rangda: bo'sh katak ko'zni tortmasin,
                haqiqiy son esa darrov ajralib tursin. */}
            <span className={`v ${p[col.key] ? "" : "zero"}`}>{p[col.key]}</span>
            <span className="k">{col.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Deadlines({ d }: { d: DashboardData["deadlines"] }) {
  return (
    <div className="deadline-grid">
      {DEADLINE_CARDS.map((c) => (
        <div className="deadline-card" key={c.key} title={c.hint}>
          <span className="k">{c.label}</span>
          <span className={`v ${d[c.key] ? "" : "zero"}`}>{d[c.key]}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
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
        {d.periods.map((p) => <Band p={p} key={p.key} />)}
      </div>
      <Deadlines d={d.deadlines} />
    </div>
  );
}
