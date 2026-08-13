/**
 * Takliflar - "sizni jamoaga chaqirishdi" sahifasi.
 *
 * Foydalanuvchi tasdiqlamaguncha hech qanday a'zolik paydo bo'lmaydi.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Invitation } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { IconCheck, IconClose, IconMail } from "@/components/icons";
import { Avatar, Card, Empty, ErrorMsg, Loading, safePath, timeAgo } from "@/components/ui";
import { useRealtime } from "@/realtime/RealtimeContext";

const STATUS_TONE: Record<string, string> = {
  PENDING: "badge-warn",
  ACCEPTED: "badge-ok",
  DECLINED: "badge-danger",
  CANCELLED: "",
};

export default function Invitations() {
  const nav = useNavigate();
  const { subscribe, reload: reloadBell } = useRealtime();
  const [box, setBox] = useState<"incoming" | "sent">("incoming");
  const [items, setItems] = useState<Invitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);

  const load = useCallback(async () => {
    try {
      setItems(listOf<Invitation>(await api.get<any>("/invitations/", { box })));
      setError(null);
    } catch (err) {
      setItems([]);
      setError(err instanceof ApiError ? err.message : "Takliflarni yuklab bo'lmadi");
    }
  }, [box]);

  useEffect(() => { void load(); }, [load]);

  // Yangi taklif kelsa ro'yxat o'zi yangilanadi.
  useEffect(() => subscribe((data) => {
    if (data.event === "notification" && String(data.notification?.kind || "").startsWith("invite.")) {
      void load();
    }
  }), [subscribe, load]);

  async function respond(inv: Invitation, action: "accept" | "decline") {
    setBusy(inv.id);
    setError(null);
    try {
      await api.post(`/invitations/${inv.id}/respond/`, { action });
      await load();
      await reloadBell();
      if (action === "accept" && inv.url) nav(safePath(inv.url, "/takliflar"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Javob berib bo'lmadi");
    } finally {
      setBusy(0);
    }
  }

  async function cancel(inv: Invitation) {
    setBusy(inv.id);
    try {
      await api.post(`/invitations/${inv.id}/cancel/`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bekor qilib bo'lmadi");
    } finally {
      setBusy(0);
    }
  }

  const pending = (items || []).filter((i) => i.status === "PENDING");
  const done = (items || []).filter((i) => i.status !== "PENDING");

  return (
    <>
      <PageHead
        title={<><IconMail size={18} /> <strong>Takliflar</strong></>}
        tabs={
          <>
            <button className={`tab ${box === "incoming" ? "active" : ""}`}
                    onClick={() => setBox("incoming")}>
              Menga kelgan {!!pending.length && box === "incoming" && <span className="n">{pending.length}</span>}
            </button>
            <button className={`tab ${box === "sent" ? "active" : ""}`}
                    onClick={() => setBox("sent")}>
              Men yuborgan
            </button>
          </>
        }
      />

      <div className="content" style={{ maxWidth: 860 }}>
        <ErrorMsg error={error} />
        {items === null && <Loading />}

        {items !== null && !items.length && (
          <Empty
            title={box === "incoming" ? "Taklif yo'q" : "Hali taklif yubormagansiz"}
            text={box === "incoming"
              ? "Sizni jamoaga chaqirishsa, shu yerda ko'rinadi va bildirishnoma keladi."
              : "Loyihaning «Jamoa» bolimidagi «A'zo qo'shish» orqali taklif yuboring."}
          />
        )}

        {pending.length > 0 && (
          <Card title="Javob kutilmoqda" padded={false}
                badge={<span className="badge badge-warn">{pending.length}</span>}>
            <div className="card-list">
              {pending.map((inv) => (
                <div className="card-body" key={inv.id}>
                  <div className="row wrap">
                    <Avatar user={box === "incoming" ? inv.invited_by : inv.user} />
                    <div style={{ minWidth: 0 }}>
                      <strong>{inv.target_name}</strong>{" "}
                      <span className="badge badge-info">{inv.role_display}</span>{" "}
                      <span className="badge">
                        {inv.scope === "project" ? "loyiha" : "ish maydoni"}
                      </span>
                      <br />
                      <small className="muted">
                        {box === "incoming"
                          ? `${inv.invited_by?.full_name || "Kimdir"} taklif qildi`
                          : `${inv.user.full_name} javobini kutmoqda`}
                        {" · "}{timeAgo(inv.created_at)}
                      </small>
                    </div>
                    <span className="spacer" />
                    {box === "incoming" ? (
                      <>
                        <button className="btn btn-sm btn-primary" disabled={busy === inv.id}
                                onClick={() => void respond(inv, "accept")}>
                          <IconCheck size={14} /> Qabul qilish
                        </button>
                        <button className="btn btn-sm btn-danger" disabled={busy === inv.id}
                                onClick={() => void respond(inv, "decline")}>
                          <IconClose size={14} /> Rad etish
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-sm btn-danger" disabled={busy === inv.id}
                              onClick={() => void cancel(inv)}>
                        Bekor qilish
                      </button>
                    )}
                  </div>
                  {inv.message && <div className="tl-detail" style={{ marginTop: 10 }}>{inv.message}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {done.length > 0 && (
          <Card title="Tarix" padded={false}>
            <div className="card-list">
              {done.map((inv) => (
                <div className="card-body tight row wrap" key={inv.id}>
                  <Avatar user={box === "incoming" ? inv.invited_by : inv.user} size="sm" />
                  <div style={{ minWidth: 0 }}>
                    <strong>{inv.target_name}</strong>{" "}
                    <small className="muted">{inv.role_display}</small>
                  </div>
                  <span className="spacer" />
                  <span className={`badge ${STATUS_TONE[inv.status] || ""}`}>{inv.status_display}</span>
                  <small className="muted">{timeAgo(inv.responded_at || inv.created_at)}</small>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
