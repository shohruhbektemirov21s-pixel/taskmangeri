/**
 * Odamni **email yoki ism** bo'yicha qidirib topish.
 *
 * Ro'yxatdan tanlash o'rniga yozib qidirish: jamoa kattalashganda uzun
 * ochiluvchi ro'yxat foydasiz bo'lib qoladi. Natijalar backenddan keladi,
 * har bosishda emas - yozish to'xtagach (debounce).
 */
import { useEffect, useRef, useState } from "react";
import type { UserBrief } from "@/api/types";
import { IconSearch } from "./icons";
import { Avatar, SpecialtyTag } from "./ui";
import { tx } from "@/i18n";

interface Props {
  /** Backenddan qidiruv natijasini oladi */
  search: (q: string) => Promise<UserBrief[]>;
  onPick: (user: UserBrief) => void;
  placeholder?: string;
  emptyText?: string;
  /** Tanlangan odamni ajratib ko'rsatish uchun */
  activeId?: number;
  autoFocus?: boolean;
  /** Shuncha belgi yozilgunча qidirilmaydi va ro'yxat ko'rsatilmaydi */
  minChars?: number;
  /** Tanlangach maydon bo'shatiladi — ketma-ket bir necha odam
      qo'shilganda har safar matnni o'chirib o'tirilmasin. */
  clearOnPick?: boolean;
}

const DEBOUNCE_MS = 250;

export default function UserSearch({
  search, onPick, placeholder = tx("common.email_yoki_ism_boyicha_qidiring"),
  emptyText = tx("common.hech_kim_topilmadi"), activeId, autoFocus, minChars = 2,
  clearOnPick = false,
}: Props) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);

  const needle = q.trim();
  // Hech narsa yozilmagan bo'lsa ro'yxat ham, so'rov ham yo'q: aks holda
  // maydon ostida tasodifiy odamlar osilib turardi.
  const active = needle.length >= minChars;

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!active) {
      setItems([]);
      setLoading(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      const mine = ++seq.current;
      setLoading(true);
      search(needle)
        .then((rows) => {
          // Kechikib kelgan eski javob yangisini bosib ketmasin.
          if (mine === seq.current) setItems(rows);
        })
        .catch(() => {
          if (mine === seq.current) setItems([]);
        })
        .finally(() => {
          if (mine === seq.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
    // `search` identifikatori o'zgarsa (masalan a'zo qo'shilgach) ro'yxat yangilanadi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, active, search]);

  return (
    <div className="user-search">
      <div className="gh-search" style={{ width: "100%" }}>
        <IconSearch size={14} />
        <input
          type="search"
          name="odam-qidiruv"
          value={q}
          autoFocus={autoFocus}
          /* Yorliq placeholder da EMAS: u yozila boshlaganda yo'qoladi va
             ekran o'quvchi uchun maydon nomsiz qoladi. */
          aria-label={placeholder}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
        />
        {loading && <span className="tl-time">…</span>}
      </div>

      {active && (
      <div className="user-hits">
        {!items.length && !loading && <div className="muted center" style={{ padding: 14 }}>{emptyText}</div>}
        {items.map((u) => (
          <button
            key={u.id}
            type="button"
            className={`user-hit ${activeId === u.id ? "on" : ""}`}
            onClick={() => { onPick(u); if (clearOnPick) setQ(""); }}
          >
            <Avatar user={u} size="sm" />
            <span className="user-hit-text">
              <strong>{u.full_name}</strong>
              <span className="muted mono">{u.email}</span>
            </span>
            <SpecialtyTag user={u} compact />
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
