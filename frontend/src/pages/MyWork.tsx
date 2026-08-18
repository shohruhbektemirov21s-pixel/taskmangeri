import { useId } from "react";
import { Link } from "react-router-dom";
import { useFetch } from "@/api/useFetch";
import type { MyWorkData } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { IconCalendar } from "@/components/icons";
import {
  Empty, ErrorMsg, Loading, Priority, STATUS_DOT, fmtDate,
} from "@/components/ui";
import { toTask, useNavParams } from "@/nav";

/**
 * «Mening ishim» — holatlar bo'yicha ustunlar.
 *
 * Ilgari har holat alohida karta va jadval edi: to'rtta holat ekranni
 * to'rtta uzun ro'yxatga bo'lib yuborardi va "menda umuman nima bor"
 * degan savolga javob berish uchun pastga surish kerak bo'lardi. Endi
 * ustunlar yonma-yon turadi — loyiha doskasidagi ko'rinishning o'zi
 * (`pages/project/Board.tsx`), faqat bu yerda barcha loyihalar bo'yicha
 * va sudrash yo'q: bu ro'yxat, boshqaruv paneli emas.
 */
export default function MyWork() {
  const fid = useId();
  const { meta } = useAuth();
  // Loyiha ham, holat ham URL da: bosh paneldagi kataklar shu yerga
  // tayyor filtr bilan olib keladi (holat orqali). Ilgari ular filtrsiz
  // olib kelardi - odam «Tuzatish kerak 2» ni bosib, oltita ustunni
  // ko'rar va o'sha ikkitasini o'zi qidirib topishi kerak edi.
  const [params, setParams] = useNavParams();
  const project = params.get("project") || "";
  const status = params.get("status") || "";
  const { data, error } = useFetch<MyWorkData>("/my-work/", { project });

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const groups = (data?.groups || []).filter((g) => !status || g.status === status);
  // Holat nomi `meta` dan olinadi, ro'yxatdan emas: bo'sh ustunni backend
  // umuman qaytarmaydi, ya'ni "bu holatda ish yo'q" holatida guruh ham,
  // uning nomi ham bo'lmaydi - yorliq esa nima filtrlanganini aytib tursin.
  const statusLabel = meta?.task_status?.find((s) => String(s.value) === status)?.label;

  return (
    <>
      <PageHead
        title={<strong>Mening ishim</strong>}
        subtitle="Menga biriktirilgan barcha shaxsiy vazifalar"
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
                <label htmlFor={`${fid}-0`}>Loyiha</label>
                <select id={`${fid}-0`} value={project} onChange={(e) => set("project", e.target.value)}>
                  <option value="">Barcha loyihalar</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <span className="spacer" />
              {status && (
                <button className="btn btn-accent" onClick={() => set("status", "")}>
                  Faqat: {statusLabel || "tanlangan holat"} ✕
                </button>
              )}
            </div>

            {groups.length ? (
              /* `plain`: ustunlarning ramkasi yo'q - dizaynda sarlavha
                 to'g'ridan-to'g'ri tuvalda turadi, kartalar esa oq. */
              <div className="board plain">
                {groups.map((g) => (
                  <div className="column" key={g.status}>
                    <div className="column-head">
                      <span className="dot" style={{ background: STATUS_DOT[g.status] || "var(--subtle)" }} />
                      {g.label}
                      <span className="n">{g.count}</span>
                    </div>
                    <div className="column-body">
                      {g.tasks.map((t) => (
                        <Link className={`tcard ${t.is_overdue ? "overdue" : ""}`}
                              {...toTask(t.id)} key={t.id}>
                          <div className="title" style={{ margin: 0 }}>{t.title}</div>
                          <div className="code">{t.project_name}</div>
                          <div className="foot" style={{ marginTop: 9 }}>
                            <Priority task={t} />
                            <span className="spacer" />
                            {t.due_date && (
                              <span className="tcard-due">
                                <IconCalendar size={12} /> {fmtDate(t.due_date)}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                      {!g.tasks.length && (
                        <p className="muted center" style={{ fontSize: 12.5, padding: "14px 6px" }}>
                          Bu ustun bo'sh.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card">
                {status ? (
                  <Empty icon="☐" title="Bu holatda ishingiz yoq"
                         text="Tanlangan holat boyicha sizga biriktirilgan vazifa topilmadi.">
                    <button className="btn" onClick={() => set("status", "")}>
                      Hammasini korish
                    </button>
                  </Empty>
                ) : (
                <Empty icon="☐" title="Sizga hali vazifa biriktirilmagan"
                       text="Loyihaga qoshiling - menejer mutaxassisligingizga mos vazifa beradi." />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
