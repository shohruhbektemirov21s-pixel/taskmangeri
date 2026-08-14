/**
 * "A'zo qo'shish" — ro'yxatdan o'tgan foydalanuvchini jamoaga qo'shish.
 *
 * Qo'shish **darrov** ishlaydi: menejer odamni tanlaydi, rolini beradi va u
 * shu zahoti a'zo bo'ladi. Tasdiq kutilmaydi, "javob kutilmoqda" ro'yxati yo'q.
 *
 * Odam uzun ochiluvchi ro'yxatdan emas, **qidiruv** orqali topiladi: jamoa
 * kattalashganda ro'yxat ishlamay qoladi. Kimni qo'shsa bo'lishini backend
 * hal qiladi (`/team/candidates/`) — a'zolar ro'yxatga tushmaydi.
 */
import { useCallback, useState } from "react";
import { ApiError, api } from "@/api/client";
import type { Choice, UserBrief } from "@/api/types";
import UserSearch from "./UserSearch";
import { IconClose, IconUserPlus } from "./icons";
import { Avatar, Card, ErrorMsg, OkMsg, SpecialtyTag } from "./ui";

interface Props {
  /** Loyihaga qo'shilsa — loyiha id si */
  projectId?: number;
  /** Ish maydoniga qo'shilsa — maydon slug i */
  workspaceSlug?: string;
  roles: Choice[];
  defaultRole?: string;
  /** Qiymati o'zgarganda nomzodlar ro'yxati qayta so'raladi */
  refreshKey?: number;
  onChange?: () => void;
}

export default function AddMemberBox({
  projectId, workspaceSlug, roles, defaultRole, refreshKey = 0, onChange,
}: Props) {
  const [picked, setPicked] = useState<UserBrief | null>(null);
  const [role, setRole] = useState(defaultRole || String(roles[0]?.value || ""));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scope = projectId ? { project: projectId } : { workspace: workspaceSlug };

  // A'zolar backendning o'zida ro'yxatdan chiqarib tashlangan.
  const search = useCallback(
    (q: string) => api.get<UserBrief[]>("/team/candidates/", { ...scope, q }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, workspaceSlug, refreshKey]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.post("/team/add/", { ...scope, user_id: picked.id, role });
      setOk(`${picked.full_name} jamoaga qo'shildi.`);
      setPicked(null);
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Qo'shib bo'lmadi");
    } finally {
      setBusy(false);
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
        <form onSubmit={submit}>
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

          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Qo'shilmoqda..." : "Jamoaga qo'shish"}
          </button>
        </form>
      )}
    </Card>
  );
}
