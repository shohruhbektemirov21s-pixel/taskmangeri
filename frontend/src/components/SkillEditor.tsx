/**
 * Ko'nikmalarni o'zi qo'shadigan muharrir.
 *
 * Ilgari ro'yxatdan o'tishda tanlangan yo'nalishga qarab ko'nikmalar
 * avtomatik yozilardi (Backend -> Python, Django, PostgreSQL...). Natijada
 * odam o'zi aytmagan narsani profilida "bilaman" deb turardi.
 *
 * Endi katalogdagi ro'yxat **taklif** sifatida ko'rsatiladi: bosgan qo'shiladi,
 * bosmagan qo'shilmaydi. Foyda saqlanadi, yolg'on da'vo yo'qoladi.
 *
 * Tashqariga eski formatda (vergul bilan ajratilgan matn) qaytaradi - backend
 * `skills` maydonini shunday saqlaydi, model o'zgartirilmadi.
 */
import { useState } from "react";
import { IconClose, IconPlus } from "./icons";

function parse(value: string) {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function SkillEditor({
  value, onChange, suggestions = [],
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const items = parse(value);

  function commit(next: string[]) {
    // Takrorlanmasin, lekin katta-kichik harf farqi bilan ikkilanmasin ham.
    const seen = new Set<string>();
    const clean = next.filter((s) => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    onChange(clean.join(", "));
  }

  function add(raw: string) {
    // Bir vaqtda bir nechta yozilsa ("React, Vite") ikkalasi ham qo'shiladi.
    const parts = parse(raw);
    if (!parts.length) return;
    commit([...items, ...parts]);
    setDraft("");
  }

  const free = suggestions.filter(
    (s) => !items.some((x) => x.toLowerCase() === s.toLowerCase()));

  return (
    <>
      {!!items.length && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
          {items.map((s) => (
            <span className="chip" key={s}>
              {s}
              <button type="button" className="chip-x" aria-label={`${s} ni olib tashlash`}
                      onClick={() => commit(items.filter((x) => x !== s))}>
                <IconClose size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <input
          value={draft}
          placeholder="Masalan: PostgreSQL"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter forma yuborib yubormasin - shu yerda ushlaymiz.
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
            if (e.key === "Backspace" && !draft && items.length) {
              commit(items.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
        />
        <button type="button" className="btn btn-sm" disabled={!draft.trim()}
                onClick={() => add(draft)}>
          <IconPlus size={13} /> Qoshish
        </button>
      </div>

      {!!free.length && (
        <div style={{ marginTop: 10 }}>
          <div className="help" style={{ marginBottom: 6 }}>
            {items.length ? "Yana qoshish mumkin" : "Yonalishingiz boyicha takliflar"} —
            bosgan qoshiladi:
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {free.map((s) => (
              <button type="button" className="chip chip-add" key={s}
                      onClick={() => commit([...items, s])}>
                <IconPlus size={11} /> {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
