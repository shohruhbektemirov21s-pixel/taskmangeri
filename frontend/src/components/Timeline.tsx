import { Link } from "react-router-dom";
import type { Activity } from "@/api/types";
import { Avatar, fmtDateTime, timeAgo } from "./ui";
import { toProject, toTask } from "@/nav";

/**
 * Tarix lentasi.
 *
 * `compact` — panel uchun siqilgan ko'rinish: har yozuv bitta qatorda,
 * tafsilotsiz. Bosh sahifada tarix asosiy narsa emas, u yerda "nima
 * bo'layotgani" ko'rinib tursa yetadi; to'lig'i «Umumiy tarix» da.
 */
export default function Timeline({
  items, showProject = true, compact = false,
}: { items: Activity[]; showProject?: boolean; compact?: boolean }) {
  if (!items.length) return <p className="muted center">Hozircha yozuv yoq.</p>;
  return (
    <div className={`timeline ${compact ? "compact" : ""}`}>
      {items.map((a) => {
        const meta = (
          <>
            {showProject && a.project && (
              <Link {...toProject(a.project)}>{a.project_name}</Link>
            )}
            {a.task && (
              <>
                {showProject && a.project ? " · " : ""}
                <Link className="mono" {...toTask(a.task)}>{a.task_code}</Link>
              </>
            )}
          </>
        );
        return (
          <div key={a.id} className={`tl-item cat-${a.category}`}>
            <div className="tl-head">
              {a.actor && <Avatar user={a.actor} size="sm" />}
              <span className="tl-sum">{a.summary}</span>
              {/* Siqilgan ko'rinishda loyiha/vazifa alohida qatorga tushmaydi */}
              {compact && <small className="muted tl-meta">{meta}</small>}
              <span className="spacer" />
              <span className="tl-time" title={fmtDateTime(a.created_at)}>
                {timeAgo(a.created_at)}
              </span>
            </div>
            {!compact && <small className="muted">{meta}</small>}
            {!compact && a.detail && <div className="tl-detail">{a.detail}</div>}
          </div>
        );
      })}
    </div>
  );
}
