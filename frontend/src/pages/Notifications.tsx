import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import type { AppNotification } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { IconBell } from "@/components/icons";
import { Avatar, Card, Empty, safePath, timeAgo } from "@/components/ui";
import { useRealtime } from "@/realtime/RealtimeContext";

export default function Notifications() {
  const { notifications, unread, connected, markRead, markAllRead, reload } = useRealtime();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const nav = useNavigate();

  const items = onlyUnread ? notifications.filter((n) => !n.is_read) : notifications;

  function open(n: AppNotification) {
    if (!n.is_read) void markRead(n.id);
    if (n.url) nav(safePath(n.url));
  }

  async function clearRead() {
    await api.post("/notifications/clear/", {});
    await reload();
  }

  return (
    <>
      <PageHead
        title={<><IconBell size={18} /> <strong>Bildirishnomalar</strong></>}
        actions={
          <>
            <span className={`live-tag ${connected ? "on" : ""}`}>
              {connected ? "jonli" : "ulanmoqda…"}
            </span>
            <label className="row" style={{ fontWeight: 400, gap: 6 }}>
              <input type="checkbox" checked={onlyUnread} style={{ width: "auto", minHeight: 0 }}
                     onChange={(e) => setOnlyUnread(e.target.checked)} />
              Faqat o'qilmagan
            </label>
            {!!unread && (
              <button className="btn btn-sm" onClick={() => void markAllRead()}>
                Hammasini o'qildi
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => void clearRead()}>
              O'qilganlarini tozalash
            </button>
          </>
        }
      />

      <div className="content" style={{ maxWidth: 820 }}>
        {!items.length ? (
          <Empty icon="🔕" title="Bildirishnoma yo'q"
                 text="Taklif, vazifa yoki suhbatdagi yangilik shu yerda paydo bo'ladi." />
        ) : (
          <Card padded={false}>
            <div className="card-list">
              {items.map((n) => (
                <button key={n.id} className={`notif wide ${n.is_read ? "" : "unread"}`}
                        onClick={() => open(n)}>
                  <Avatar user={n.actor} size="sm" />
                  <span className="notif-text">
                    <span className="row" style={{ gap: 6 }}>
                      <strong>{n.title}</strong>
                      <span className="badge">{n.kind_display}</span>
                    </span>
                    {n.body && <span className="muted">{n.body}</span>}
                    <span className="tl-time">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
