/**
 * Taklifning qismlari — ro'yxat ham, taklifning O'Z SAHIFASI ham shu
 * yerdan oladi.
 *
 * NEGA AJRATILDI. Bu qismlar avval `pages/Suggestions.tsx` ning ichida
 * turardi va taklif uchun alohida sahifa ochilganda ikkinchi nusxasi
 * kerak bo'lardi: forma, ovoz tugmalari, boshliq paneli va qaror qutisi.
 * Ikki nusxa esa albatta ajralib ketardi - bir joyda tugma qo'shilib,
 * ikkinchisida esdan chiqardi.
 *
 * SIRLAR SHU YERDA HAM SAQLANADI: anonim taklifda muallif ham, faylni
 * yuklagan odam ham ko'rsatilmaydi (server `null` beradi), kim ovoz
 * bergani esa umuman kelmaydi - faqat sonlar va so'ragan odamning o'z
 * tanlovi.
 */
import { useMemo, useState } from "react";

import { api } from "@/api/client";
import type {
  Suggestion, SuggestionFile, SuggestionScopeValue, SuggestionStatusValue,
  VoteChoiceValue,
} from "@/api/types";
import { confirmDialog } from "@/components/Confirm";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import {
  IconCheck, IconClose, IconFile, IconNeutral, IconThumbDown, IconThumbUp,
} from "@/components/icons";
import { Card, ErrorMsg, PhotoView, timeAgo } from "@/components/ui";
import { tx } from "@/i18n";

/** Holat nishonining rangi - ro'yxatda ham, sahifada ham bir xil. */
export const STATUS_TONE: Record<SuggestionStatusValue, string> = {
  PENDING: "badge-warn",
  APPROVED: "badge-ok",
  REJECTED: "badge-danger",
};

/** Bo'sh forma - yangi taklif uchun boshlang'ich holat. */
export const EMPTY_FORM = {
  title: "", body: "", scope: "OPEN" as SuggestionScopeValue, is_anonymous: false,
};

export type SuggestionFormValues = typeof EMPTY_FORM;

/** Tahrirlanayotgan taklifdan forma qiymatlari. */
export function formOf(item: Suggestion): SuggestionFormValues {
  return {
    title: item.title, body: item.body,
    scope: item.scope, is_anonymous: item.is_anonymous,
  };
}

/* ------------------------------------------------------------------ forma */

export function SuggestionForm({ initial, editing, onCancel, onSaved }: {
  initial: SuggestionFormValues;
  /** Tahrirlanayotgan taklif (yangi bo'lsa `null`) */
  editing: Suggestion | null;
  onCancel: () => void;
  /** `warn` — taklif saqlandi, lekin fayl yuklanmadi degan ogohlantirish. */
  onSaved: (saved: Suggestion, warn?: string) => void;
}) {
  const [f, setF] = useState<SuggestionFormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* Yangi tanlangan fayllar brauzerda turadi va taklif saqlangandan KEYIN
     yuklanadi — yangi taklifning raqami shunda ma'lum bo'ladi. */
  const [picked, setPicked] = useState<File[]>([]);
  /* Tahrirda allaqachon biriktirilgan fayllar: shu yerdan o'chiriladi. */
  const [kept, setKept] = useState<SuggestionFile[]>(editing?.files || []);

  function set<K extends keyof SuggestionFormValues>(k: K, v: SuggestionFormValues[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  // Anonimlik ikkala turda ham ishlaydi - turini almashtirish endi
  // belgini olib tashlamaydi. Sababi `apps/suggestions/models.py` da.
  const closed = f.scope === "CLOSED";

  /** Saqlangan faylni olib tashlash — faqat tahrir rejimida bo'ladi. */
  async function dropFile(file: SuggestionFile) {
    if (!editing) return;
    const yes = await confirmDialog({
      title: tx("suggestions.fayl_ochirilsinmi", { nom: file.original_name }),
      body: tx("suggestions.fayl_ochirish_izohi"),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!yes) return;
    await api.delete(`/suggestions/${editing.id}/files/${file.id}/`);
    setKept((prev) => prev.filter((x) => x.id !== file.id));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const body = { title: f.title, body: f.body, scope: f.scope, is_anonymous: f.is_anonymous };
      const saved = editing
        ? await api.patch<Suggestion>(`/suggestions/${editing.id}/`, body)
        : await api.post<Suggestion>("/suggestions/", body);

      if (!picked.length) return onSaved(saved);

      // Fayl yuklanmasa ham taklifning o'zi saqlangan - formani qayta
      // yubortirsak ikkinchi nusxa paydo bo'lardi. Shuning uchun xato
      // ogohlantirish bo'lib chiqadi, forma esa yopiladi.
      try {
        await uploadFiles(`/suggestions/${saved.id}/files/`, picked);
      } catch (up) {
        return onSaved(saved, up instanceof Error
          ? `${tx("suggestions.fayllar_yuklanmadi")} ${up.message}`
          : tx("suggestions.fayllar_yuklanmadi"));
      }
      // Javobdagi taklifda yangi fayllar yo'q - qayta o'qiymiz.
      onSaved(await api.get<Suggestion>(`/suggestions/${saved.id}/`));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : tx("common.saqlashda_xatolik"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={editing ? tx("suggestions.taklifni_tahrirlash") : tx("suggestions.yangi_taklif")}>
      <form onSubmit={submit}>
        {err && <ErrorMsg error={err} />}

        <div className="field">
          <label htmlFor="sg-title">{tx("suggestions.sarlavha")}</label>
          <input id="sg-title" value={f.title} required maxLength={200}
                 placeholder={tx("suggestions.sarlavha_placeholder")}
                 onChange={(e) => set("title", e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="sg-body">{tx("suggestions.taklif_matni")}</label>
          <textarea id="sg-body" rows={4} value={f.body} required
                    placeholder={tx("suggestions.matn_placeholder")}
                    onChange={(e) => set("body", e.target.value)} />
        </div>

        <div className="field">
          <label>{tx("suggestions.kim_koradi")}</label>
          <div className="check-list">
            <label className={f.scope === "OPEN" ? "on" : ""}>
              <input type="radio" checked={f.scope === "OPEN"}
                     onChange={() => set("scope", "OPEN")} />
              {tx("suggestions.ochiq")}
            </label>
            <label className={closed ? "on" : ""}>
              <input type="radio" checked={closed}
                     onChange={() => set("scope", "CLOSED")} />
              {tx("suggestions.yopiq")}
            </label>
          </div>
        </div>

        {/* Anonimlik TURDAN QAT'I NAZAR: yopiq taklif eng og'ir mavzular
            uchun va aynan o'sha yerda ism majburiy bo'lib turardi. */}
        <div className="field">
          <div className="check-list">
            <label className={f.is_anonymous ? "on" : ""}>
              <input type="checkbox" checked={f.is_anonymous}
                     onChange={(e) => set("is_anonymous", e.target.checked)} />
              {tx("suggestions.anonim_yuborish")}
            </label>
          </div>
        </div>

        {/* Fayl — «oddiy taklif ham yuklay olsin». Kim yuklagani ko'rinadi;
            anonim taklifda esa u ham yashiriladi. */}
        <div className="field">
          <label>{tx("suggestions.fayllar")}</label>

          {!!kept.length && (
            <div className="stack" style={{ marginBottom: 10 }}>
              {kept.map((file) => (
                <div key={file.id} className="row sg-file">
                  {/* Tahrirda ham rasm ko'rinib tursin: muallif qaysi
                      birini o'chirayotganini nomdan emas, ko'rib biladi. */}
                  {file.is_image && file.url
                    ? <img src={file.url} alt={file.original_name} className="sg-thumb" />
                    : <span className="file-ico"><IconFile size={15} /></span>}
                  <a href={file.url} target="_blank" rel="noreferrer" className="sg-file-name">
                    {file.original_name}
                  </a>
                  <small className="muted">{file.size_display}</small>
                  <span className="spacer" />
                  <button type="button" className="btn btn-sm btn-ghost"
                          title={tx("common.ochirish")}
                          onClick={() => void dropFile(file)}>
                    <IconClose size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <FilePicker files={picked} onChange={setPicked}
                      hint={tx("suggestions.fayl_hint")} />
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? tx("common.saqlanmoqda")
                  : editing ? tx("common.saqlash") : tx("suggestions.yuborish")}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            {tx("common.bekor_qilish")}
          </button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------- boshliq paneli */

export function BossPanel({ item, onDone, onCancel }: {
  item: Suggestion;
  onDone: (s: Suggestion) => void;
  /* Faqat QAYTA ochilganda beriladi: odam fikridan qaytsa, hech narsani
     o'zgartirmasdan yopib qo'ya olsin. */
  onCancel?: () => void;
}) {
  const [note, setNote] = useState(item.decision_note || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(status?: "APPROVED" | "REJECTED") {
    setBusy(true);
    setErr("");
    try {
      const saved = await api.post<Suggestion>(`/suggestions/${item.id}/decide/`,
                                               status ? { status, note } : { note });
      onDone(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tx("common.amalni_bajarib_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-boss">
      {err && <ErrorMsg error={err} />}
      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor={`sg-note-${item.id}`}>{tx("suggestions.boshliq_izohi")}</label>
        <textarea id={`sg-note-${item.id}`} rows={2} value={note}
                  placeholder={tx("suggestions.izoh_placeholder")}
                  onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-sm btn-primary" disabled={busy}
                onClick={() => void send("APPROVED")}>
          <IconCheck size={13} /> {tx("suggestions.tasdiqlash")}
        </button>
        <button className="btn btn-sm btn-danger" disabled={busy}
                onClick={() => void send("REJECTED")}>
          <IconClose size={13} /> {tx("suggestions.rad_etish")}
        </button>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void send()}>
          {tx("suggestions.izohni_saqlash")}
        </button>
        {onCancel && (
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onCancel}>
            {tx("common.bekor_qilish")}
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- ovoz */

function VoteButton({ on, count, label, icon, disabled, onClick }: {
  on: boolean; count: number; label: string; icon: React.ReactNode;
  disabled: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className={`sg-vote ${on ? "on" : ""}`}
            disabled={disabled} onClick={onClick} title={label}>
      {icon}
      <span className="sg-vote-label">{label}</span>
      <span className="sg-vote-n">{count}</span>
    </button>
  );
}

/**
 * Uchta ovoz tugmasi. Bosilgani to'ldirilgan holda turadi - odam O'Z
 * tanlovini ko'rsin; boshqalarniki hech qachon ko'rinmaydi.
 *
 * O'sha tugma qayta bosilsa ovoz OLIB TASHLANADI (server shunday
 * qilingan) - odam fikridan qaytishi ham mumkin.
 */
export function VoteBar({ item, onChange }: {
  item: Suggestion;
  onChange: (saved: Suggestion) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function vote(choice: VoteChoiceValue) {
    setBusy(true);
    try {
      onChange(await api.post<Suggestion>(`/suggestions/${item.id}/vote/`, { choice }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-votes">
      <VoteButton on={item.my_vote === "FOR"} count={item.for_count}
                  label={tx("suggestions.qoshilaman")} icon={<IconThumbUp size={14} />}
                  disabled={busy} onClick={() => void vote("FOR")} />
      <VoteButton on={item.my_vote === "AGAINST"} count={item.against_count}
                  label={tx("suggestions.qoshilmayman")} icon={<IconThumbDown size={14} />}
                  disabled={busy} onClick={() => void vote("AGAINST")} />
      <VoteButton on={item.my_vote === "NEUTRAL"} count={item.neutral_count}
                  label={tx("suggestions.betarafman")} icon={<IconNeutral size={14} />}
                  disabled={busy} onClick={() => void vote("NEUTRAL")} />
    </div>
  );
}

/* ---------------------------------------------------------- biriktirmalar */

/**
 * Taklifga qo'shilgan fayllar.
 *
 * RASM ALOHIDA CHIZILADI. Ilgari hamma fayl bir xil qatorda, umumiy
 * nishoncha bilan turardi: chizma yoki skrinshot «shartnoma.pdf» dan farq
 * qilmasdi va uni ko'rish uchun har birini navbat bilan ochib chiqishga
 * to'g'ri kelardi. Taklifga esa aynan rasm ko'p qo'shiladi - «hozir
 * shunday, shunday bo'lsin». Qoida «Vazifa» va «Hujjatlar»
 * sahifalaridagi bilan bir xil (`is_image` serverdan keladi).
 */
export function Attachments({ item }: { item: Suggestion }) {
  // Kattalashtirib ko'rilayotgan rasm (yoki `null`).
  const [shot, setShot] = useState<SuggestionFile | null>(null);
  const images = useMemo(() => item.files.filter((f) => f.is_image && f.url), [item.files]);
  const docs = useMemo(() => item.files.filter((f) => !(f.is_image && f.url)), [item.files]);

  if (!item.files.length) return null;

  return (
    <>
      {!!images.length && (
        <div className="sg-shots">
          {images.map((file) => (
            <button key={file.id} type="button" className="sg-shot"
                    onClick={() => setShot(file)}
                    title={tx("suggestions.rasmni_kattalashtirish")}>
              <img src={file.url} alt={file.original_name} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {!!docs.length && (
        <div className="stack sg-files">
          {docs.map((file) => (
            <div key={file.id} className="row sg-file">
              <span className="file-ico"><IconFile size={15} /></span>
              <a href={file.url} target="_blank" rel="noreferrer" className="sg-file-name">
                {file.original_name}
              </a>
              <small className="muted">{file.size_display}</small>
              <span className="spacer" />
              <small className="muted">
                {file.uploaded_by
                  ? tx("suggestions.yuklagan", { ism: file.uploaded_by.full_name })
                  : tx("suggestions.anonim_muallif")}
              </small>
            </div>
          ))}
        </div>
      )}

      {/* Rasm to'liq holda - «Vazifa» sahifasidagi ko'ruvchining o'zi.
          Anonim taklifda «kim yuklagani» yozilmaydi. */}
      {shot && (
        <PhotoView
          src={shot.url}
          alt={shot.original_name}
          title={shot.original_name}
          subtitle={shot.uploaded_by
            ? tx("suggestions.yuklagan", { ism: shot.uploaded_by.full_name })
            : tx("suggestions.anonim_muallif")}
          onClose={() => setShot(null)}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- qaror */

/**
 * Boshliqning javobi: qaror, izoh va qachon.
 *
 * Javob kutayotgan taklifda ham chiziladi - «hali qaror yo'q» ham holat
 * va uni ko'rsatmaslik «boshliq ko'rmadimi?» degan savol qoldirardi.
 */
export function DecisionBox({ item }: { item: Suggestion }) {
  return (
    <div className={`sg-decision ${item.status === "APPROVED" ? "ok"
                                 : item.status === "REJECTED" ? "no" : "wait"}`}>
      <strong>
        {item.status === "APPROVED" ? <IconCheck size={14} />
          : item.status === "REJECTED" ? <IconClose size={14} />
            : null}
        {item.status_display}
      </strong>
      {item.decision_note && <p>{item.decision_note}</p>}
      {/* KIM qaror qilgani yozilmaydi. Qaror qiladigan rol bitta -
          boshliq - va uni har qutida takrorlash yangi ma'lumot bermaydi,
          faqat holat nishoni bilan izoh orasiga qo'shimcha qator qo'yadi.
          Javob KUTAYOTGAN taklifda qator qoladi: u boshqa narsani
          aytadi - «ko'rilmoqda», ya'ni taklif e'tibordan chetda emas. */}
      {item.status === "PENDING" && (
        <span className="muted">{tx("suggestions.boshliq_korib_chiqmoqda")}</span>
      )}
      <span className="muted">
        {timeAgo(item.status === "PENDING"
          ? item.created_at
          : item.decided_at || item.created_at)}
      </span>
    </div>
  );
}
