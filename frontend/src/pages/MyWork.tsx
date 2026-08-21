import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { DueColumnKey, MyWorkData, Task } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { IconCalendar } from "@/components/icons";
import {
  Empty, ErrorMsg, Loading, Pager, StatusBadge, fmtDate,
} from "@/components/ui";
import { toTask, useNavParams } from "@/nav";
import { tx } from "@/i18n";

/**
 * Doska ustunlari — MUDDAT bo'yicha, chapdan o'ngga torayib boradi.
 *
 * Kalit serverdan keladi (`/my-work/?board=due`), nom esa bazadan: ustun
 * nomlari holat nomlari EMAS, ya'ni ularni `meta.task_status` dan olib
 * bo'lmaydi.
 *
 * Nuqta rangi shoshilinchlikni aytadi: kulrangdan (hammasi) sariqqacha
 * (bugun), bajarilgani esa yashil.
 */
const COLUMNS: { key: DueColumnKey; label: string; dot: string }[] = [
  { key: "ALL", label: tx("my_work.ustun_barchasi"), dot: "var(--subtle)" },
  { key: "WEEK", label: tx("my_work.ustun_shu_haftalik"), dot: "var(--accent)" },
  { key: "TODAY", label: tx("my_work.ustun_bugun"), dot: "var(--attention)" },
  { key: "DONE", label: tx("my_work.ustun_bajarilganlar"), dot: "var(--success)" },
];

const COLUMN = new Map(COLUMNS.map((c) => [c.key as string, c]));

/**
 * «Muddat» tanlagichi. Qiymatlar SERVER tushunadigan kalitlar
 * (`due_span`): kalendar hafta, oy va yil - «oxirgi 7 kun» emas. Shu
 * sababdan chegara bu yerda hisoblanmaydi, faqat kalit yuboriladi.
 */
const TERMS = [
  { value: "week", label: tx("my_work.muddat_1_haftalik") },
  { value: "month", label: tx("my_work.muddat_1_oylik") },
  { value: "year", label: tx("my_work.muddat_1_yillik") },
];

/**
 * «Mening ishim» — muddat bo'yicha ustunlar.
 *
 * Ilgari ustunlar HOLAT edi («Jarayonda», «Bajarildi»). U ish oqimini
 * ko'rsatardi, lekin odam ertalab boshqa savol bilan keladi: "bugun nima
 * qilaman, shu haftada nima bor". Holat esa vazifaning o'zida ham,
 * loyiha doskasida ham (`pages/project/Board.tsx`) turibdi.
 *
 * USTUNLAR BIR-BIRINI INKOR QILMAYDI: bugungi ish shu haftalikda ham,
 * «barchasi» da ham ko'rinadi. Bu Kanban emas — kesimlar to'plami, ya'ni
 * bitta kartani ikki joyda ko'rish kutilgan holat.
 *
 * Kesimni SERVER hisoblaydi (`due_span`): «shu hafta» bu yerda ham,
 * «Vazifalar» ro'yxatida ham, bosh panelda ham bir xil hafta bo'lsin.
 */
export default function MyWork() {
  const fid = useId();
  // Sudralayotgan karta va ustidagi ustun. Ko'chirish xatosi yuklash
  // xatosidan alohida turadi - biri ikkinchisini o'chirib yubormasin.
  const [dragId, setDragId] = useState<number | null>(null);
  /**
   * Sudralayotgan karta - REF da, holatda emas.
   *
   * `dragstart` va `drop` ketma-ket, bir zumda kelsa React holatni oradan
   * ULGURMAY yangilaydi va `drop` ichida raqam hali `null` bo'ladi: karta
   * qimirlamaydi, xato ham chiqmaydi - odam "sudrash ishlamayapti" deb
   * qoladi. Ref o'sha zahoti yoziladi. Holat baribir kerak: ustunning
   * yonishi qayta chizishga bog'liq.
   */
  const dragRef = useRef<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Loyiha ham, holat ham URL da: bosh paneldagi kataklar shu yerga
  // tayyor filtr bilan olib keladi (holat orqali). Ilgari ular filtrsiz
  // olib kelardi - odam «Tuzatish kerak 2» ni bosib, oltita ustunni
  // ko'rar va o'sha ikkitasini o'zi qidirib topishi kerak edi.
  const [params, setParams] = useNavParams();
  const period = params.get("period") || "";

  // HAR USTUN O'Z SAHIFASIDA turadi: ular uzunligi bilan bir-biriga
  // o'xshamaydi va bitta umumiy raqam «bajarilganlar» ni uchinchi
  // sahifaga olib chiqqanda «bugun» ni bo'shatib qo'yardi. Raqamlar ham
  // manzilda - orqaga qaytish tugmasi ishlashi uchun.
  const pageOf = (key: string) => Number(params.get(`page_${key.toLowerCase()}`)) || 1;

  // KESISH SERVERDA. Ro'yxat to'liq kelib, mijozda kesilmaydi: ilgari
  // ustun 100 tada jimgina qirqilardi va yuz birinchi ish yo'qolardi.
  const { data, error: loadError, reload } = useFetch<MyWorkData>("/my-work/", {
    board: "due",
    period,
    ...Object.fromEntries(COLUMNS.map((c) => [`page_${c.key.toLowerCase()}`, String(pageOf(c.key))])),
  });

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  /** Muddat o'zgardi - ustunlar boshqacha to'ladi, hamma sahifa boshiga qaytadi. */
  const setPeriod = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set("period", v);
    else next.delete("period");
    COLUMNS.forEach((c) => next.delete(`page_${c.key.toLowerCase()}`));
    setParams(next, { replace: true });
  };

  const error = actionError || loadError;
  const groups = data?.groups || [];
  const managed = data?.managed_projects || [];

  /**
   * Kartani SHU ustunga tashlab bo'ladimi.
   *
   * KO'CHIRISH IKKI TOMONLAMA. «Bugun» va «Shu haftalik» muddatni qo'yadi,
   * «Barchasi» esa uni OLIB TASHLAYDI - ya'ni ish rejadan chiqib, muddatsiz
   * ro'yxatda qoladi. Shu sababdan «Barchasi» faqat muddati BOR kartani
   * qabul qiladi: muddatsiz ishni unga tashlash hech nimani o'zgartirmasdi.
   *
   * Muddatni ODDIY IJROCHI ham suradi - u o'z ishini rejalashtiradi. Buning
   * uchun tor eshik bor (`/tasks/<id>/due/`): u faqat `due_date` ni
   * o'zgartiradi va loyiha a'zosiga ochiq. Vazifani TAHRIRLASH esa
   * avvalgidek menejer va adminda qoladi - sarlavha, ijrochi, prioritet
   * shu bilan birga ochilib ketmasin.
   *
   * «Bajarilganlar» esa MUDDAT emas, HOLAT: «Bajarildi» ni qo'lda qo'yib
   * bo'lmaydi, u faqat TEKSHIRUVDAGI ishni tekshiruvchi tasdiqlaganda
   * qo'yiladi (qoida serverda - `DEVELOPER_TRANSITIONS` va `move_status`).
   * Shuning uchun u yagona ustun bo'lib, boshqaruv huquqini talab qiladi.
   *
   * Yopilgan ish umuman sudralmaydi: uning muddati endi hech nimani
   * anglatmaydi va muddat ustunlari faqat OCHIQ ishni oladi - karta o'z
   * joyidan qimirlamasdi.
   */
  function accepts(key: string, task?: Task) {
    if (!task) return false;
    if (key === "DONE") {
      return managed.includes(task.project) && task.status === "IN_REVIEW";
    }
    if (task.status === "DONE" || task.status === "CANCELLED") return false;
    if (key === "ALL") return Boolean(task.due_date);
    return key === "WEEK" || key === "TODAY";
  }

  /** Ayni damda sudralayotgan vazifa. FUNKSIYA, o'zgaruvchi emas: ref
      qayta chizishni tug'dirmaydi va render paytida hisoblangan qiymat
      `drop` ga eskirib yetib borardi - ya'ni yuqoridagi poyganing o'zi. */
  const draggedTask = () => groups.flatMap((g) => g.tasks).find((t) => t.id === dragRef.current);

  /** Ko'chirish - sudrash ham, kartadagi menyu ham shu yerdan o'tadi. */
  async function move(task: Task, key: string) {
    const column = groups.find((g) => g.status === key);
    setActionError(null);
    try {
      if (key === "DONE") {
        await api.post(`/tasks/${task.id}/status/`, { status: "DONE" });
      } else {
        // Sana SERVERDAN kelgan (`due_target`): «hafta oxiri» qaysi kun
        // ekanini mijoz qayta hisoblamaydi, aks holda karta o'zi tushgan
        // ustunda turmay qolishi mumkin edi. «Barchasi» da nishon yo'q -
        // u muddatni bo'shatadi.
        await api.post(`/tasks/${task.id}/due/`,
                       { due_date: key === "ALL" ? null : column?.due_target });
      }
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tx("my_work.kochirib_bolmadi"));
    }
  }

  async function drop(key: string) {
    setOver(null);
    const task = draggedTask();
    dragRef.current = null;
    setDragId(null);
    if (!task || !accepts(key, task)) return;
    await move(task, key);
  }
  // Doska HAR DOIM to'rt ustunli - bo'sh ustun ham qaytadi. Shuning uchun
  // "ish bormi" degan savolga ustunlar soni javob bera olmaydi: kartalar
  // sanaladi. Aks holda hech vazifasi yo'q odam to'rtta bo'sh ustunni
  // ko'rib, sahifa buzuq deb o'ylardi.
  const hasAny = groups.some((g) => g.count > 0);

  return (
    <>
      <PageHead
        title={<strong>{tx("my_work.mening_ishim")}</strong>}
      />
      <div className="content">
        {error ? (
          <ErrorMsg error={error} />
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <div className="filters">
              <div className="f">
                <label htmlFor={`${fid}-0`}>{tx("common.muddat")}</label>
                <select id={`${fid}-0`} value={period} onChange={(e) => setPeriod(e.target.value)}>
                  <option value="">{tx("my_work.barcha_muddatlar")}</option>
                  {TERMS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {hasAny ? (
              /* `fit`: ko'rinish loyiha doskasi bilan bir xil (ustun o'z
                 qutisida), faqat to'rt ustun ekranga bo'linib sig'adi. */
              <div className="board fit">
                {groups.map((g) => (
                  <div
                    key={g.status}
                    className={`column ${over === g.status ? "drag-over" : ""}`}
                    /* Qabul qilmaydigan ustun `preventDefault` qilmaydi -
                       brauzer «bu yerga bo'lmaydi» kursorini o'zi
                       ko'rsatadi va odam kartani tortib borib, keyin xato
                       o'qimaydi. */
                    onDragOver={(e) => {
                      if (dragRef.current != null && !accepts(g.status, draggedTask())) return;
                      e.preventDefault();
                      setOver(g.status);
                    }}
                    onDragLeave={() => setOver((o) => (o === g.status ? null : o))}
                    onDrop={() => void drop(g.status)}
                  >
                    <div className="column-head">
                      <span className="dot"
                            style={{ background: COLUMN.get(g.status)?.dot || "var(--subtle)" }} />
                      {COLUMN.get(g.status)?.label || g.label}
                      <span className="n">{g.count}</span>
                    </div>
                    <div className="column-body">
                      {g.tasks.map((t) => {
                        // Boshqa ustunga o'tkazsa bo'ladimi. Bo'lmasa karta
                        // umuman sudralmaydi - qo'l bejiz tortmasin.
                        const movable = COLUMNS.some(
                          (c) => c.key !== g.status && accepts(c.key, t));
                        return (
                          <Link className={`tcard ${t.is_overdue ? "overdue" : ""} ${dragId === t.id ? "dragging" : ""}`}
                                {...toTask(t.id)} key={t.id}
                                draggable={movable}
                                onDragStart={() => { dragRef.current = t.id; setDragId(t.id); }}
                                onDragEnd={() => {
                                  dragRef.current = null; setDragId(null); setOver(null);
                                }}>
                            <div className="title" style={{ margin: 0 }}>{t.title}</div>
                            <div className="code">{t.project_name}</div>
                            <div className="foot" style={{ marginTop: 9 }}>
                              {/* HOLAT, prioritet emas. Bu doskada ustun -
                                  muddat kesimi, ya'ni ish qaysi bosqichda
                                  ekani boshqa hech qayerda ko'rinmaydi.
                                  Prioritet esa ro'yxatning yarmida bir xil
                                  bo'lib chiqadi va kartalarni ajratmaydi.
                                  Loyiha doskasida teskarisi: u yerda ustunning
                                  O'ZI holat, shuning uchun u yerda prioritet
                                  qoladi. */}
                              <StatusBadge task={t} />
                              <span className="spacer" />
                              {t.due_date && (
                                <span className="tcard-due">
                                  <IconCalendar size={12} /> {fmtDate(t.due_date)}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                      {!g.tasks.length && (
                        <p className="muted center" style={{ fontSize: 12.5, padding: "14px 6px" }}>
                          {tx("my_work.bu_ustun_bosh")}
                        </p>
                      )}
                      {/* Sahifa raqamlari - faqat bo'linadigan ustunda.
                          Sarlavhadagi son JAMI ishni aytadi, ya'ni u
                          sahifadan sahifaga o'zgarmaydi. */}
                      {(g.pages || 1) > 1 && (
                        <Pager page={g.page || 1} pages={g.pages || 1}
                               onPick={(n) => set(`page_${g.status.toLowerCase()}`, String(n))} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card">
                <Empty icon="☐" title={tx("my_work.sizga_hali_vazifa_biriktirilmagan")}
                       text={tx("my_work.loyihaga_qoshiling_menejer_mutaxassisligingi")} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
