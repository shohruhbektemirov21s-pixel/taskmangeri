/**
 * Loyiha yaratilishidan OLDIN jamoaga kimni chaqirishni belgilash.
 *
 * Taklif mavjud loyihaga yuboriladi — ya'ni id kerak, yangi loyiha esa hali
 * yaratilmagan. Shuning uchun bu yerda odamlar faqat ro'yxatga yig'iladi;
 * takliflar forma saqlangach, yangi id bilan yuboriladi (`sendInvites`).
 *
 * Odam qidiruvi umumiy foydalanuvchi katalogidan (`/users/?search=`) boradi:
 * yangi loyihada hali a'zo yo'q, shuning uchun `invitations/candidates/` dan
 * foydalanib bo'lmaydi — u mavjud loyihani talab qiladi.
 */
import { useCallback } from "react";
import { api, listOf } from "@/api/client";
import type { Choice, UserBrief } from "@/api/types";
import UserSearch from "./UserSearch";
import { IconClose } from "./icons";
import { Avatar, SpecialtyTag } from "./ui";

export interface Pick {
  user: UserBrief;
  role: string;
}

/**
 * Yig'ilgan odamlarga taklif yuboradi.
 * Yuborib bo'lmaganlarning ismini qaytaradi — chaqiruvchi shuni aytadi.
 */
export async function sendInvites(projectId: number, picks: Pick[]) {
  const failed: string[] = [];
  for (const p of picks) {
    try {
      await api.post("/invitations/", {
        project: projectId,
        workspace: null,
        user_id: p.user.id,
        role: p.role,
      });
    } catch {
      failed.push(p.user.full_name);
    }
  }
  return failed;
}

interface Props {
  picks: Pick[];
  onChange: (picks: Pick[]) => void;
  roles: Choice[];
  defaultRole?: string;
  /** O'zini taklif qilib bo'lmaydi — ro'yxatdan chiqarib tashlanadi. */
  excludeId?: number;
}

export default function TeamPicker({
  picks, onChange, roles, defaultRole = "DEVELOPER", excludeId,
}: Props) {

  const search = useCallback(async (q: string) => {
    const data = await api.get<any>("/users/", { search: q, page_size: 8 });
    return listOf<UserBrief>(data).filter(
      (u) => u.id !== excludeId && !picks.some((p) => p.user.id === u.id));
  }, [excludeId, picks]);

  return (
    <>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Odamni email yoki ism-familiyasi boyicha toping. Loyiha saqlangach ularga
        taklif boradi — <strong>tasdiqlagandan keyin</strong> jamoaga qoshiladi.
      </p>

      <UserSearch
        search={search}
        onPick={(u) => onChange([...picks, { user: u, role: defaultRole }])}
        placeholder="Email yoki ism-familiya"
        emptyText="Hech kim topilmadi"
      />

      {!!picks.length && (
        <div className="stack" style={{ marginTop: 12 }}>
          {picks.map((p, i) => (
            <div className="row" key={p.user.id}
                 style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
              <Avatar user={p.user} size="sm" />
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{p.user.full_name}</strong>{" "}
                <SpecialtyTag user={p.user} compact />
                <br />
                <small className="muted">{p.user.email}</small>
              </div>
              <span className="spacer" />
              <select value={p.role} style={{ width: 130 }}
                      onChange={(e) => onChange(picks.map(
                        (x, n) => (n === i ? { ...x, role: e.target.value } : x)))}>
                {roles.map((r) => (
                  <option key={r.value} value={String(r.value)}>{r.label}</option>
                ))}
              </select>
              <button type="button" className="btn btn-sm" title="Royxatdan olib tashlash"
                      onClick={() => onChange(picks.filter((_, n) => n !== i))}>
                <IconClose size={13} />
              </button>
            </div>
          ))}

          <small className="muted">
            {picks.length} ta odamga taklif yuboriladi.
          </small>
        </div>
      )}
    </>
  );
}
