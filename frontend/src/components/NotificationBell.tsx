import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AppNotification } from "@/api/types";
import { useRealtime } from "@/realtime/RealtimeContext";
import { IconBell } from "./icons";
import { Avatar, safePath, timeAgo } from "./ui";

const TONE: Record<string, string> = {
  "invite.received": "badge-info",
  "invite.accepted": "badge-ok",
  "invite.declined": "badge-danger",
  "join.request": "badge-warn",
  "task.assigned": "badge-info",
  "task.review": "badge-brand",
  "task.decided": "badge-ok",
  "chat.message": "badge",
};

export default function NotificationBell() {
  const { notifications, unread, connected, markRead, markAllRead } = useRealtime();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(n: AppNotification) {
    setOpen(false);
    if (!n.is_read) void markRead(n.id);
    if (n.url) nav(safePath(n.url));
  }

  return (
    <div className="popover-wrap" ref={box}>
      <button
        className="top-icon"
        onClick={() => setOpen((v) => !v)}
        title={connected ? "Bildirishnomalar" : "Bildirishnomalar (ulanish yo'q)"}
        aria-expanded={open}
      >
        <IconBell size={17} />
        {!!unread && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
        <span className={`live ${connected ? "on" : ""}`} />
      </button>

      {open && (
        <div className="popover">
          <div className="popover-head">
            <strong>Bildirishnomalar</strong>
            <span className="spacer" />
            {!!unread && (
              <button className="btn btn-sm btn-ghost" onClick={() => void markAllRead()}>
                Hammasini o'qildi
              </button>
            )}
          </div>

          <div className="popover-body">
            {notifications.length === 0 && (
              <div className="empty" style={{ padding: "28px 16px" }}>
                <div className="ico">🔕</div>
                Hozircha bildirishnoma yo'q
              </div>
            )}

            {notifications.map((n) => (
              <button
                key={n.id}
                className={`notif ${n.is_read ? "" : "unread"}`}
                onClick={() => go(n)}
              >
                <Avatar user={n.actor} size="sm" />
                <span className="notif-text">
                  <span className="row" style={{ gap: 6 }}>
                    <strong>{n.title}</strong>
                    <span className={`badge ${TONE[n.kind] || ""}`}>{n.kind_display}</span>
                  </span>
                  {n.body && <span className="muted">{n.body}</span>}
                  <span className="tl-time">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="popover-foot">
            <Link to="/bildirishnomalar" onClick={() => setOpen(false)}>Hammasini ko'rish</Link>
            <span className="spacer" />
            <Link to="/takliflar" onClick={() => setOpen(false)}>Takliflar</Link>
          </div>
        </div>
      )}
    </div>
  );
}
