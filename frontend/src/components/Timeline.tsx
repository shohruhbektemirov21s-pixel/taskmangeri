import { Link } from "react-router-dom";
import type { Activity } from "@/api/types";
import { Avatar, timeAgo } from "./ui";

export default function Timeline({ items, showProject = true }: { items: Activity[]; showProject?: boolean }) {
  if (!items.length) return <p className="muted center">Hozircha yozuv yoq.</p>;
  return (
    <div className="timeline">
      {items.map((a) => (
        <div key={a.id} className={`tl-item cat-${a.category}`}>
          <div className="tl-head">
            {a.actor && <Avatar user={a.actor} size="sm" />}
            <span className="tl-sum">{a.summary}</span>
            <span className="spacer" />
            <span className="tl-time" title={new Date(a.created_at).toLocaleString("uz-UZ")}>
              {timeAgo(a.created_at)}
            </span>
          </div>
          <small className="muted">
            {showProject && a.project && (
              <Link to={`/loyiha/${a.project}`}>{a.project_name}</Link>
            )}
            {a.task && (
              <>
                {showProject && a.project ? " · " : ""}
                <Link className="mono" to={`/vazifa/${a.task}`}>{a.task_code}</Link>
              </>
            )}
          </small>
          {a.detail && <div className="tl-detail">{a.detail}</div>}
        </div>
      ))}
    </div>
  );
}
