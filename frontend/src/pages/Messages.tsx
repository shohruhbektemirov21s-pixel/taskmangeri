/**
 * Shaxsiy yozishmalar - odamni email yoki ism bo'yicha topib, to'g'ridan-to'g'ri yozish.
 *
 * Chapda: qidiruv va ochiq suhbatlar ro'yxati (ikkalasi ham backenddan).
 * O'ngda: tanlangan odam bilan real vaqtdagi suhbat.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { Conversation, UserBrief } from "@/api/types";
import Chat from "@/components/Chat";
import UserSearch from "@/components/UserSearch";
import { PageHead } from "@/components/Layout";
import { IconChat } from "@/components/icons";
import { Avatar, Card, Empty, SpecialtyTag, timeAgo } from "@/components/ui";
import { useRealtime } from "@/realtime/RealtimeContext";

export default function Messages() {
  const { userId } = useParams();
  const nav = useNavigate();
  const { subscribe } = useRealtime();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [partner, setPartner] = useState<UserBrief | null>(null);

  const activeId = userId ? Number(userId) : 0;

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await api.get<Conversation[]>("/chat/messages/conversations/"));
    } catch { /* ro'yxat yuklanmasa ham yozish ishlayveradi */ }
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // Yangi shaxsiy xabar kelsa chapdagi ro'yxat o'zi yangilansin.
  useEffect(() => subscribe((data) => {
    if (data.event === "notification" && data.notification?.kind === "chat.direct") {
      void loadConversations();
    }
  }), [subscribe, loadConversations]);

  // Manzildagi id bo'yicha suhbatdoshni aniqlaymiz.
  useEffect(() => {
    if (!activeId) {
      setPartner(null);
      return;
    }
    const known = conversations.find((c) => c.partner.id === activeId);
    if (known) {
      setPartner(known.partner);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const u = await api.get<UserBrief>(`/users/${activeId}/`);
        if (alive) setPartner(u);
      } catch {
        if (alive) setPartner(null);
      }
    })();
    return () => { alive = false; };
  }, [activeId, conversations]);

  const search = useCallback(
    (q: string) => api.get<UserBrief[]>("/chat/messages/people/", { q }),
    []
  );

  return (
    <>
      <PageHead title={<><IconChat size={18} /> <strong>Xabarlar</strong></>} />

      <div className="content">
        <div className="dm-layout">
          <div className="dm-side">
            <Card title="Kimga yozamiz">
              <UserSearch
                search={search}
                onPick={(u) => nav(`/xabarlar/${u.id}`)}
                activeId={activeId}
                placeholder="Email yoki ism bo'yicha qidiring"
                emptyText="Hech kim topilmadi"
              />
            </Card>

            <Card title="Suhbatlar" padded={false}
                  badge={<span className="badge">{conversations.length}</span>}>
              <div className="card-list">
                {!conversations.length && (
                  <div className="muted center" style={{ padding: 18, fontSize: 13 }}>
                    Hali yozishma yo'q.
                  </div>
                )}
                {conversations.map((c) => (
                  <button
                    key={c.partner.id}
                    className={`conv ${activeId === c.partner.id ? "on" : ""}`}
                    onClick={() => nav(`/xabarlar/${c.partner.id}`)}
                  >
                    <Avatar user={c.partner} size="sm" />
                    <span className="conv-text">
                      <span className="row" style={{ gap: 6 }}>
                        <strong>{c.partner.full_name}</strong>
                        <span className="spacer" />
                        <span className="tl-time">{timeAgo(c.last_at)}</span>
                      </span>
                      <span className="muted">
                        {c.outgoing && "Siz: "}{c.last_message}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="dm-main">
            {partner ? (
              <>
                <div className="row mb">
                  <Avatar user={partner} />
                  <div>
                    <strong>{partner.full_name}</strong> <SpecialtyTag user={partner} compact />
                    <br />
                    <small className="muted mono">{partner.email}</small>
                  </div>
                  <span className="spacer" />
                  <button className="btn btn-sm" onClick={() => nav(`/profil/${partner.id}`)}>
                    Profil
                  </button>
                </div>
                <Chat
                  directUserId={partner.id}
                  title={`Suhbat — ${partner.full_name}`}
                  height={480}
                />
              </>
            ) : (
              <Card>
                <Empty
                  icon="✉️"
                  title="Suhbat tanlanmagan"
                  text="Chapdan odamni email yoki ism bo'yicha toping va yozing."
                />
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
