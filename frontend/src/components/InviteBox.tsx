/**
 * "A'zo qo'shish" - ro'yxatdan o'tgan foydalanuvchini jamoaga taklif qilish.
 *
 * Muhim: bu yerda hech kim to'g'ridan-to'g'ri qo'shilmaydi. Taklif yuboriladi,
 * odam bildirishnoma oladi va **o'zi tasdiqlagandan keyin** a'zo bo'ladi.
 * Shuning uchun pastda "javob kutilmoqda" ro'yxati ham turadi.
 *
 * Nomzodlar, rollar va cheklovlar - hammasi backenddan keladi.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, listOf } from "@/api/client";
import type { Choice, Invitation, UserBrief } from "@/api/types";
import UserSearch from "./UserSearch";
import { IconClose, IconUserPlus } from "./icons";
import { Avatar, Card, ErrorMsg, OkMsg, SpecialtyTag, timeAgo } from "./ui";

interface Props {
  /** Loyihaga taklif qilinsa - loyiha id si */
  projectId?: number;
  /** Ish maydoniga taklif qilinsa: id yaratishda, slug ro'yxat filtrlarida */
  workspaceId?: number;
  workspaceSlug?: string;
  roles: Choice[];
  defaultRole?: string;
  /** Qiymati o'zgarganda nomzodlar ro'yxati qayta so'raladi */
  refreshKey?: number;
  onChange?: () => void;
}

export default function InviteBox({
  projectId, workspaceId, workspaceSlug, roles, defaultRole, refreshKey = 0, onChange,
}: Props) {
  const [picked, setPicked] = useState<UserBrief | null>(null);
  const [pending, setPending] = useState<Invitation[]>([]);
  const [role, setRole] = useState(defaultRole || String(roles[0]?.value || ""));
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scope = projectId ? { project: projectId } : { workspace: workspaceSlug };

  const loadPending = useCallback(async () => {
    try {
      setPending(listOf<Invitation>(await api.get<any>("/invitations/", {
        box: "sent", pending: 1, ...scope,
      })));
    } catch { /* ro'yxat yuklanmasa ham taklif yuborish ishlayveradi */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workspaceSlug, refreshKey]);

  useEffect(() => { void loadPending(); }, [loadPending]);

  // Faqat taklif qilish mumkin bo'lganlar: a'zolar va javob kutayotganlar
  // backendning o'zida chiqarib tashlangan.
  const search = useCallback(
    (q: string) => api.get<UserBrief[]>("/invitations/candidates/", { ...scope, q }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, workspaceSlug, refreshKey]
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.post("/invitations/", {
        project: projectId ?? null,
        workspace: projectId ? null : workspaceId ?? null,
        user_id: picked.id,
        role,
        message,
      });
      setOk(`${picked.full_name} ga taklif yuborildi — endi javobini kutamiz.`);
      setPicked(null);
      setMessage("");
      await loadPending();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Taklif yuborib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: number) {
    setError(null);
    try {
      await api.post(`/invitations/${id}/cancel/`, {});
      await loadPending();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bekor qilib bo'lmadi");
    }
  }

  return (
    <Card title={<span className="row" style={{ gap: 8 }}><IconUserPlus size={15} /> A'zo qo'shish</span>}>
      <ErrorMsg error={error} />
      <OkMsg text={ok} />

      {!picked ? (
        <UserSearch
          search={search}
          onPick={setPicked}
          placeholder="Email yoki ism bo'yicha qidiring"
          emptyText="Mos odam topilmadi"
        />
      ) : (
        <form onSubmit={send}>
          <div className="picked-user">
            <Avatar user={picked} />
            <div style={{ minWidth: 0 }}>
              <strong>{picked.full_name}</strong> <SpecialtyTag user={picked} compact />
              <br />
              <small className="muted mono">{picked.email}</small>
            </div>
            <span className="spacer" />
            <button type="button" className="btn btn-sm btn-ghost" title="Boshqasini tanlash"
                    onClick={() => setPicked(null)}>
              <IconClose size={14} />
            </button>
          </div>

          <div className="field mt">
            <label>Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={String(r.value)} value={String(r.value)}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Xabar (ixtiyoriy)</label>
            <textarea rows={2} value={message} placeholder="Nima uchun taklif qilyapsiz"
                      onChange={(e) => setMessage(e.target.value)} />
          </div>

          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Yuborilmoqda..." : "Taklif yuborish"}
          </button>
        </form>
      )}

      {pending.length > 0 && (
        <>
          <div className="divider" />
          <div className="muted mb" style={{ fontSize: 13 }}>
            Javob kutilmoqda — {pending.length} ta
          </div>
          <div className="stack">
            {pending.map((i) => (
              <div className="row wrap" key={i.id}>
                <Avatar user={i.user} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <strong>{i.user.full_name}</strong> <SpecialtyTag user={i.user} compact />
                  <br />
                  <small className="muted">{i.role_display} · {timeAgo(i.created_at)}</small>
                </div>
                <span className="spacer" />
                <button className="btn btn-sm btn-danger" onClick={() => void cancel(i.id)}>
                  Bekor qilish
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
