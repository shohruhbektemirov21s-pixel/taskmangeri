/**
 * Shaxsiy yozishmalar - odamni email yoki ism bo'yicha topib, to'g'ridan-to'g'ri yozish.
 *
 * Chapda: qidiruv va ochiq suhbatlar ro'yxati (ikkalasi ham backenddan).
 * O'ngda: tanlangan odam bilan real vaqtdagi suhbat.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Conversation, UserBrief } from "@/api/types";
import Chat from "@/components/Chat";
import UserSearch from "@/components/UserSearch";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, Empty, SpecialtyTag, timeAgo } from "@/components/ui";
import { useRealtime } from "@/realtime/RealtimeContext";
import { toMessages, toUser, useEntityId, useGo } from "@/nav";
import { tx } from "@/i18n";

export default function Messages() {
  // Suhbatdosh manzilda emas: `/xabarlar/12` emas, `/xabarlar`.
  const userId = useEntityId("user");
  const go = useGo();
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
      <PageHead title={<strong>{tx("messages.xabarlar")}</strong>}
                subtitle={tx("messages.loyiha_jamoasi_va_azolari_bilan")} />

      <div className="content">
        <div className="dm-layout">
          <div className="dm-side">
            <Card title={tx("messages.kimga_yozamiz")}>
              <UserSearch
                search={search}
                onPick={(u) => go(toMessages(u.id))}
                activeId={activeId}
                placeholder={tx("common.email_yoki_ism_boyicha_qidiring")}
                emptyText={tx("common.hech_kim_topilmadi")}
              />
            </Card>

            <Card title={tx("messages.suhbatlar")} padded={false}
                  badge={<span className="badge">{conversations.length}</span>}>
              <div className="card-list">
                {!conversations.length && (
                  <div className="muted center" style={{ padding: 18, fontSize: 13 }}>
                    {tx("messages.hali_yozishma_yoq")}
                  </div>
                )}
                {conversations.map((c) => (
                  <button
                    key={c.partner.id}
                    className={`conv ${activeId === c.partner.id ? "on" : ""}`}
                    onClick={() => go(toMessages(c.partner.id))}
                  >
                    <Avatar user={c.partner} size="sm" />
                    <span className="conv-text">
                      <span className="row" style={{ gap: 6 }}>
                        <strong>{c.partner.full_name}</strong>
                        <span className="spacer" />
                        <span className="tl-time">{timeAgo(c.last_at)}</span>
                      </span>
                      <span className="muted">
                        {c.outgoing && tx("messages.siz")}{c.last_message}
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
                  <button className="btn btn-sm" onClick={() => go(toUser(partner.id))}>
                    {tx("messages.profil")}
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
                  title={tx("messages.suhbat_tanlanmagan")}
                  text={tx("messages.chapdan_odamni_email_yoki_ism")}
                />
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
