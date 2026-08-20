import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AppNotification } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { useRealtime } from "@/realtime/RealtimeContext";
import { IconBell } from "./icons";
import { Avatar, safePath, timeAgo } from "./ui";
import { tx } from "@/i18n";

const TONE: Record<string, string> = {
  "join.request": "badge-warn",
  "project.deadline": "badge-danger",
  "task.assigned": "badge-info",
  "task.review": "badge-brand",
  "task.decided": "badge-ok",
  "task.comment": "badge",
  "chat.message": "badge",
  "chat.direct": "badge",
};

export default function NotificationBell() {
  const { notifications, unread, connected, markRead, markAllRead } = useRealtime();
  const { user } = useAuth();
  // Tekshiruv navbatiga havola faqat ishni qabul qiladigan odamga -
  // yon paneldagi yozuv bilan bir xil qoida.
  const manages = Boolean(user?.can_create_project || user?.manages_projects);
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
        title={connected ? tx("common.bildirishnomalar") : tx("notification_bell.bildirishnomalar_ulanish_yoq")}
        aria-expanded={open}
      >
        <IconBell size={17} />
        {!!unread && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
        {/* Ulanish nishoni faqat ulanish YO'Q bo'lganda chiziladi. Ilgari u
            doim turardi: hammasi joyida bo'lgan holatda ham qo'ng'iroq
            ostida yashil nuqta osilib, dizaynni chalkashtirardi. Nuqta -
            ogohlantirish, tasdiq emas; "jonli" ekani bildirishnomalar
            sahifasidagi yorliqda yozilgan. */}
        {!connected && <span className="live" title={tx("notification_bell.jonli_ulanish_yoq")} />}
      </button>

      {open && (
        <div className="popover">
          <div className="popover-head">
            <strong>{tx("common.bildirishnomalar")}</strong>
            <span className="spacer" />
            {!!unread && (
              <button className="btn btn-sm btn-ghost" onClick={() => void markAllRead()}>
                {tx("notification_bell.hammasini_oqildi")}
              </button>
            )}
          </div>

          <div className="popover-body">
            {notifications.length === 0 && (
              <div className="empty" style={{ padding: "28px 16px" }}>
                <div className="ico">🔕</div>
                {tx("notification_bell.hozircha_bildirishnoma_yoq")}
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
            <Link to="/bildirishnomalar" onClick={() => setOpen(false)}>{tx("notification_bell.hammasini_korish")}</Link>
            <span className="spacer" />
            {manages && (
              <Link to="/tekshiruv" onClick={() => setOpen(false)}>{tx("common.tekshiruv_navbati")}</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
