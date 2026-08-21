/**
 * Vazifa paneli — o'ng chetdan chiqadigan tortma.
 *
 * NEGA SAHIFA EMAS. Bosh paneldagi ro'yxat kesim bo'yicha ochiladi
 * («Yil boshidan — Nazoratda»), ustiga qidiruv, muddat va holat filtri
 * qo'yiladi, keyin kerakli sahifaga o'tiladi. Vazifani ko'rish uchun
 * boshqa sahifaga sakralsa, qaytib kelgan odam o'sha kesimni ham,
 * filtrni ham, sahifa raqamini ham qaytadan tanlashi kerak bo'lardi —
 * ro'yxatni ko'zdan kechirish har safar uzilardi. Tortma esa ro'yxatni
 * joyida qoldiradi: yopilganda odam qayerda edi — o'sha yerda qoladi.
 *
 * MA'LUMOT QAYTA SO'RALMAYDI. Ro'yxat `TaskSerializer` ning to'liq
 * javobini oladi (`/dashboard/tasks/`) — ijrochi, tavsif, muddat,
 * tekshiruvchi va to'xtash sababi allaqachon qo'lda. Shuning uchun
 * tortma darrov ochiladi: na qo'shimcha so'rov, na yuklanish belgisi.
 * Bu yerda hech narsa qattiq yozilmagan — hammasi backenddan kelgan
 * yozuvdan olinadi.
 */
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { Task } from "@/api/types";
import { fmtDate } from "@/components/dates";
import { Avatar, Priority, StatusBadge } from "@/components/ui";
import { toProject, toTask } from "@/nav";
import { tx } from "@/i18n";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="drawer-row">
      <span className="muted">{label}</span>
      <span className="drawer-val">{children}</span>
    </div>
  );
}

export default function TaskDrawer({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!task) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // SAHIFANI FAQAT USTMA-UST HOLATDA QULFLAYMIZ. Keng ekranda panel
    // ro'yxatning yonida, oqim ichida turadi (`app.css`, 1101px dan
    // boshlab) - u yerda qulf ro'yxatni surib bo'lmaydigan qilib
    // qo'yardi, ya'ni panel ochilishi ro'yxatni ishlatib bo'lmaydigan
    // holatga tushirardi. Fokusni ko'chirish ham shu sababdan: yonma-yon
    // turgan panel modal emas, o'qishni bo'lmasin.
    const overlay = window.matchMedia("(max-width: 1100px)").matches;
    if (!overlay) return () => document.removeEventListener("keydown", onKey);

    closeBtn.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [task, onClose]);

  if (!task) return null;

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true"
             aria-label={tx("task_drawer.vazifa_paneli")}
             /* Panel ichidagi bosish tortmani yopmasin. */
             onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="mono muted">{task.code}</span>
          <h3>{task.title}</h3>
        </div>

        <div className="drawer-body">
          {/* Ro'yxatda joy tor bo'lgani uchun faqat bosh harflar turadi
              («TB»), bu yerda esa TO'LIQ ISM yoziladi: panel aynan «kim
              qilayapti» degan savolga javob berish uchun ochiladi va
              bosh harflardan ismni topib olish qiyin - jamoada bir xil
              harf bilan boshlanadigan odam bittadan ko'p. */}
          <Row label={tx("common.ijrochilar")}>
            {task.assignees.length ? (
              <span className="drawer-people">
                {task.assignees.map((u) => (
                  <span className="drawer-person" key={u.id}>
                    <Avatar user={u} size="sm" />
                    <b>{u.full_name}</b>
                  </span>
                ))}
              </span>
            ) : (
              <span className="muted">—</span>
            )}
          </Row>
          <Row label={tx("common.holat")}><StatusBadge task={task} /></Row>
          <Row label={tx("common.muhimlik")}><Priority task={task} /></Row>
          <Row label={tx("common.muddat")}>
            {task.due_date ? (
              <span className={task.is_overdue ? "badge badge-danger" : ""}>
                {fmtDate(task.due_date)}
              </span>
            ) : (
              <span className="muted">{tx("task_drawer.muddat_qoyilmagan")}</span>
            )}
          </Row>
          <Row label={tx("common.loyiha")}>
            {/* Loyihaga o'tish — tortmadagi yagona havola: bu ataylab
                boshqa sahifa, chunki loyiha ro'yxatdan kengroq narsa. */}
            <Link {...toProject(task.project)} onClick={onClose}>{task.project_name}</Link>
          </Row>
          {task.reviewer && (
            <Row label={tx("task_detail.tekshiruvchi")}>{task.reviewer.full_name}</Row>
          )}
          {task.specialty_label && (
            <Row label={tx("common.mutaxassislik")}>
              <span className="badge badge-brand">{task.specialty_label}</span>
            </Row>
          )}
          {!!task.attachment_count && (
            <Row label={tx("task_detail.fayllar")}>
              {tx("ui.nechta_fayl", { n: task.attachment_count })}
            </Row>
          )}

          {/* To'xtab qolgan ishda eng kerakli ma'lumot — SABABI. U ro'yxat
              ustunlariga sig'maydi, shuning uchun aynan shu yerda. */}
          {task.blocked_reason && (
            <div className="callout danger drawer-note">
              <strong>{tx("task_detail.toxtab_qolgan")}</strong> {task.blocked_reason}
            </div>
          )}

          <p className="drawer-desc">
            {task.description || <span className="muted">{tx("common.tavsif_kiritilmagan")}</span>}
          </p>
        </div>

        <div className="drawer-foot">
          <Link className="btn btn-primary" {...toTask(task.id)}>
            {tx("task_drawer.toliq_ochish")}
          </Link>
          <button ref={closeBtn} type="button" className="btn" onClick={onClose}>
            {tx("common.yopish")}
          </button>
        </div>
      </aside>
    </div>
  );
}
