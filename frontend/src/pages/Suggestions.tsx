/**
 * Takliflar — jamoa nima o'zgarishini so'raydi, boshliq qaror qiladi.
 *
 * TARTIB SERVERDAN. Ro'yxat ovoz bo'yicha saralangan holda keladi
 * (`qo'shilaman` minus `qo'shilmayman`), ya'ni eng ko'p qo'llab-quvvatlangan
 * taklif birinchi o'rinda turadi.
 *
 * OVOZ BERGANDA RO'YXAT SAKRAMAYDI. Server javobidagi yangi sonlar
 * qatorning O'ZIGA yoziladi, ro'yxat esa qayta saralanmaydi. Aks holda
 * odam bosgan karta shu zahoti boshqa joyga uchib ketardi va u nimani
 * bosganini yo'qotardi. Yangi tartib keyingi yuklashda ko'rinadi.
 */
import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import type {
  Suggestion, SuggestionFile, SuggestionScopeValue, VoteChoiceValue,
} from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useLive } from "@/realtime/RealtimeContext";
import { confirmDialog } from "@/components/Confirm";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import { PageHead } from "@/components/Layout";
import {
  IconCheck, IconClose, IconFile, IconIdea, IconNeutral, IconThumbDown, IconThumbUp,
} from "@/components/icons";
import {
  Avatar, Card, Empty, ErrorMsg, Loading, OkMsg, Pager, PhotoView, RowMenu, timeAgo,
} from "@/components/ui";
import { tx } from "@/i18n";

/**
 * Sahifaning bo'limlari.
 *
 * «Ochiq» va «Yopiq» OLIB TASHLANDI. Ular takliflarni turi bo'yicha
 * ikkiga bo'lib turardi, odam esa ro'yxatga turi uchun emas, MAZMUNI
 * uchun kiradi: nima taklif qilingan va u qabul qilinganmi. Endi asosiy
 * ro'yxat bitta - «Barchasi». Turning o'zi yo'qolmadi: yopiq taklif
 * kartada «Yopiq» belgisi bilan turadi.
 *
 * «Barchasi» hamma uchun xavfsiz: server baribir har kimga o'zi ko'ra
 * oladiganini beradi (`get_queryset`) - ochiq takliflar va O'ZINING
 * yopiqlari. Boshliq esa hammasini ko'radi.
 *
 * Qaror kesimlari FAQAT BOSHLIQDA chiziladi - u nimani tasdiqlagani va
 * nimani rad etganini bir joyda ko'rishi kerak. Yashirish QULAYLIK,
 * himoya emas: chegara serverda, `status` filtri kimga nima
 * ko'rinishini o'zgartirmaydi, faqat ko'rinadiganini qisqartiradi.
 *
 * «Mening takliflarim» ataylab OXIRGI: u shaxsiy kesim, jamoanikidan
 * keyin turadi.
 */
/**
 * DOSKA USTUNLARI - takliflarning holati bo'yicha.
 *
 * Kalitlar serverdan keladi (`/suggestions/board/`), nomi esa bazadan.
 * «Barchasi» qolgan uchtasining yig'indisi, ya'ni ustunlar bir-birini
 * inkor qilmaydi: tasdiqlangan taklif «barchasi» da ham turadi. Bu
 * Kanban emas - bitta ro'yxatning kesimlari, xuddi «Mening ishim»
 * doskasidagidek.
 *
 * Nuqta rangi holatni aytadi: kulrang hammasi, sariq javob kutayotgan,
 * yashil tasdiqlangan, qizil rad etilgan.
 */
const COLUMNS = [
  { key: "ALL", dot: "var(--subtle)" },
  { key: "PENDING", dot: "var(--attention)" },
  { key: "APPROVED", dot: "var(--success)" },
  { key: "REJECTED", dot: "var(--danger)" },
] as const;

type ColumnKey = typeof COLUMNS[number]["key"];

interface BoardColumn {
  key: ColumnKey;
  count: number;
  page: number;
  pages: number;
  items: Suggestion[];
}

/** Saralash - qiymatlar server tushunadigan kalitlar (`SuggestionViewSet.SORTS`). */
const SORTS = ["top", "new", "old"] as const;
type Sort = typeof SORTS[number];

/** Doskaning bitta ustuniga bir marta nechta taklif tushadi.
    Serverdagi `SuggestionViewSet.BOARD_PAGE` bilan bir xil bo'lishi
    shart: o'rin raqami shu songa qarab hisoblanadi. */
const BOARD_PAGE = 10;

/** Bo'sh forma - yangi taklif uchun boshlang'ich holat. */
const EMPTY = { title: "", body: "", scope: "OPEN" as SuggestionScopeValue, is_anonymous: false };

type Form = typeof EMPTY;

/* ------------------------------------------------------------------ forma */

function SuggestionForm({ initial, editing, onCancel, onSaved }: {
  initial: Form;
  /** Tahrirlanayotgan taklif (yangi bo'lsa `null`) */
  editing: Suggestion | null;
  onCancel: () => void;
  /** `warn` — taklif saqlandi, lekin fayl yuklanmadi degan ogohlantirish. */
  onSaved: (saved: Suggestion, warn?: string) => void;
}) {
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* Yangi tanlangan fayllar brauzerda turadi va taklif saqlangandan KEYIN
     yuklanadi — yangi taklifning raqami shunda ma'lum bo'ladi. */
  const [picked, setPicked] = useState<File[]>([]);
  /* Tahrirda allaqachon biriktirilgan fayllar: shu yerdan o'chiriladi. */
  const [kept, setKept] = useState<SuggestionFile[]>(editing?.files || []);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
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

        {/* Fayl — «oddiy taklif ham yuklay olsin». Kim yuklagani kartada
            ko'rinadi; anonim taklifda esa u ham yashiriladi. */}
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

function BossPanel({ item, onDone, onCancel }: {
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

/* -------------------------------------------------------------- bitta karta */

const STATUS_TONE: Record<string, string> = {
  PENDING: "badge-warn",
  APPROVED: "badge-ok",
  REJECTED: "badge-danger",
};

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

function SuggestionCard({ item, rank, onChange, onEdit, onDelete }: {
  item: Suggestion;
  rank: number | null;
  onChange: (s: Suggestion) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  /* Qaror QAYTA OCHILDIMI.

     Qaror chiqqach forma yopiladi: tasdiqlangan taklifning ostida
     «Tasdiqlash / Rad etish» tugmalari turishi qarorni chiqmagandek
     ko'rsatardi va tasodifan qayta bosish oson edi. Fikr o'zgarsa yo'l
     ochiq qolsin uchun u «⋯» menyusiga ko'chdi - loyihalar ro'yxatidagi
     kabi, kartaning o'ng chekkasida. */
  const [redeciding, setRedeciding] = useState(false);
  // Kattalashtirib ko'rilayotgan rasm (yoki `null`).
  const [shot, setShot] = useState<SuggestionFile | null>(null);
  // Rasm va qolgan fayl ikki xil chiziladi - sababi pastda, chizilgan joyda.
  const images = useMemo(() => item.files.filter((f) => f.is_image && f.url), [item.files]);
  const docs = useMemo(() => item.files.filter((f) => !(f.is_image && f.url)), [item.files]);

  async function vote(choice: VoteChoiceValue) {
    setBusy(true);
    try {
      onChange(await api.post<Suggestion>(`/suggestions/${item.id}/vote/`, { choice }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-card">
      <div className="sg-head">
        {rank !== null && <span className="sg-rank">{rank}</span>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <strong className="sg-title">{item.title}</strong>
            <span className={`badge ${STATUS_TONE[item.status] || ""}`}>{item.status_display}</span>
            {item.scope === "CLOSED" && (
              <span className="badge badge-info">{item.scope_display}</span>
            )}
          </div>
          <div className="sg-by">
            {item.author
              ? <><Avatar user={item.author} size="sm" /> <span>{item.author.full_name}</span></>
              : <span className="sg-anon">{tx("suggestions.anonim_muallif")}</span>}
            <span className="dot-sep">·</span>
            <span>{timeAgo(item.created_at)}</span>
          </div>
        </div>

        {item.can_edit && (
          <div className="row sg-actions" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={onEdit}>
              {tx("common.tahrirlash")}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onDelete}>
              {tx("common.ochirish")}
            </button>
          </div>
        )}

        {/* Qaror chiqqan taklifda boshliqning yagona amali shu menyuda:
            «Tahrirlash» formani qaytadan ochadi va u yerda tasdiqlash
            ham, rad etish ham, izohni almashtirish ham bor. */}
        {item.can_decide && item.status !== "PENDING" && !redeciding && (
          <div className="row sg-actions" style={{ gap: 6 }}>
            <RowMenu>
              <button type="button" onClick={() => setRedeciding(true)}>
                {tx("common.tahrirlash")}
              </button>
            </RowMenu>
          </div>
        )}
      </div>

      {/* IKKI USTUN: chapda taklifning o'zi, o'ngda uning HOLATI.
          Qaror ilgari matnning ostida, ovoz tugmalaridan keyin turardi -
          uzun taklifda uni ko'rish uchun pastga surish kerak edi va
          «bu tasdiqlanganmi?» degan savol ko'z bilan javob olmasdi.
          Tor ekranda ustunlar ustma-ust tushadi. */}
      <div className="sg-cols">
        <div className="sg-main">

      <p className="sg-body">{item.body}</p>

      {/* Biriktirilgan fayl - kim yuklagani bilan. Anonim taklifda
          `uploaded_by` serverdan `null` keladi.

          RASM ALOHIDA CHIZILADI. Ilgari hamma fayl bir xil qatorda,
          umumiy nishoncha bilan turardi: chizma yoki skrinshot
          «shartnoma.pdf» dan farq qilmasdi va uni ko'rish uchun har
          birini navbat bilan ochib chiqishga to'g'ri kelardi. Taklifga
          esa aynan rasm ko'p qo'shiladi - «hozir shunday, shunday
          bo'lsin». Endi rasmlar tepada, ko'rinadigan holda; qolgan
          fayllar oldingidek ro'yxat bo'lib pastda qoladi. Qoida
          «Vazifa» va «Hujjatlar» sahifalaridagi bilan bir xil
          (`is_image` serverdan keladi). */}
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

      {item.can_vote && (
        <>
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
        </>
      )}

          {item.can_decide && (item.status === "PENDING" || redeciding) && (
            <BossPanel item={item}
                       onDone={(saved) => { setRedeciding(false); onChange(saved); }}
                       onCancel={redeciding ? () => setRedeciding(false) : undefined} />
          )}
        </div>

        {/* Qaror - hammaga ko'rinadi: taklif nima bo'lganini jamoa bilsin.
            KUTAYOTGANI ham yoziladi: muallif taklifi yo'qolib qolmaganini,
            navbatda turganini ko'rib tursin. */}
        <div className="sg-side">
          <div className={`sg-decision ${item.status === "APPROVED" ? "ok"
                                       : item.status === "REJECTED" ? "no" : "wait"}`}>
            <strong>{item.status_display}</strong>
            {item.decision_note && <p>{item.decision_note}</p>}
            <span className="muted">
              {item.status === "PENDING"
                ? tx("suggestions.boshliq_korib_chiqmoqda")
                : item.decided_by
                  ? tx("suggestions.qaror_qildi", { ism: item.decided_by.full_name })
                  : ""}
            </span>
            <span className="muted">
              {timeAgo(item.status === "PENDING"
                ? item.created_at
                : item.decided_at || item.created_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- sahifa */

export default function Suggestions() {
  const [sort, setSort] = useState<Sort>("top");
  /* Faqat o'zimniki - ilgari «Mening takliflarim» alohida bo'lim edi.
     Doskada u beshinchi ustun bo'la olmaydi (u HOLAT emas, egalik),
     shuning uchun butun doskani toraytiradigan belgiga aylandi. */
  const [mine, setMine] = useState(false);
  /* Har ustunning O'Z sahifasi: ular uzunligi bilan bir-biriga o'xshamaydi
     va bitta umumiy raqam «tasdiqlangan» ni uchinchi sahifaga olib
     chiqqanda «rad etilgan» ni bo'shatib qo'yardi. */
  const [pages, setPages] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [ok, setOk] = useState("");
  /* Taklif saqlandi-yu, fayl yuklanmadi - shu yerda aytiladi. */
  const [warn, setWarn] = useState("");

  /* «Saqlandi» xabari o'n soniyada o'zi so'nadi.
     U ish BITGANINI aytadi, ya'ni o'qilgach kerak emas - lekin doskaning
     tepasida turib joy egallardi va odam uni yopish uchun sahifani qayta
     yuklardi. Ogohlantirish (`warn`) esa QOLADI: unda bajarilmagan ish bor
     (fayl yuklanmadi) va uni ko'rmay qolish mumkin emas. */
  useEffect(() => {
    if (!ok) return;
    const timer = setTimeout(() => setOk(""), 10_000);
    return () => clearTimeout(timer);
  }, [ok]);

  /* DOSKA BIR SO'ROVDA. To'rtta ustun to'rtta alohida so'rov bilan
     kelganda ular bir-biridan ajralib ketishi mumkin edi: biri qaror
     chiqishidan oldingi, ikkinchisi keyingi holatni ko'rsatardi.
     Saralash ham, kesish ham SERVERDA. */
  const { data, error, loading, reload } = useFetch<{ columns: BoardColumn[] }>(
    "/suggestions/board/", {
      sort,
      ...(mine ? { mine: 1 } : {}),
      ...Object.fromEntries(COLUMNS.map((c) => [
        "page_" + c.key.toLowerCase(), String(pages[c.key] || 1)])),
    });

  const columns = data?.columns || [];
  const bosh = columns.length > 0 && columns.every((c) => !c.count);

  // REAL VAQTDA. Yangi taklif boshliqqa, qaror esa muallifga bildirishnoma
  // bo'lib keladi (`apps/suggestions/services.py`). Sahifa ochiq turgan
  // odam uchun qo'ng'iroqning o'zi yetarli emas - doskaning o'zi ham
  // yangilansin, aks holda u sahifani qo'lda qayta yuklashi kerak bo'lardi.
  useLive((d) => {
    if (d.event !== "notification") return;
    const kind = d.notification?.kind;
    if (kind === "suggestion.new" || kind === "suggestion.decided") reload();
  });

  /** Doskani boshidan ko'rsatish - filtr yoki tartib o'zgarganda. */
  function restart(fn: () => void) {
    fn();
    setPages({});
    setCreating(false);
    setEditing(null);
  }

  async function remove(item: Suggestion) {
    const yes = await confirmDialog({
      title: tx("suggestions.ochirilsinmi", { nom: item.title }),
      body: tx("suggestions.ochirish_izohi"),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!yes) return;
    await api.delete("/suggestions/" + item.id + "/");
    setOk(tx("suggestions.ochirildi"));
    // Oxirgi sahifadagi yagona yozuv o'chsa o'sha sahifa endi yo'q -
    // server raqamni o'zi chegaraga qisadi, biz shunchaki qayta so'raymiz.
    reload();
  }

  function afterSave(_saved: Suggestion, note?: string) {
    setCreating(false);
    setEditing(null);
    setWarn(note || "");
    setOk(note ? "" : tx("suggestions.saqlandi"));
    reload();
  }

  return (
    <>
      <PageHead
        title={<strong>{tx("suggestions.sarlavha_sahifa")}</strong>}
        actions={
          !creating && !editing && (
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              <IconIdea size={14} /> {tx("suggestions.yangi_taklif")}
            </button>
          )
        }
      />

      <div className="content">
        {ok && <OkMsg text={ok} />}
        {warn && <ErrorMsg error={warn} />}

        {(creating || editing) && (
          <SuggestionForm
            key={editing ? "edit-" + editing.id : "new"}
            editing={editing}
            initial={editing
              ? { title: editing.title, body: editing.body,
                  scope: editing.scope, is_anonymous: editing.is_anonymous }
              : EMPTY}
            onCancel={() => { setCreating(false); setEditing(null); }}
            onSaved={afterSave}
          />
        )}

        {/* Doska ustidagi boshqaruv: «faqat meniki» va tartib. Tartib
            SERVERDA hal bo'ladi va butun doskaga qo'llanadi - standarti
            ovoz bo'yicha, ya'ni jamoa eng ko'p kutayotgan o'zgarish har
            ustunning tepasida turadi. */}
        <div className="sg-toolbar">
          <label className="sg-only-mine">
            <input type="checkbox" checked={mine}
                   onChange={(e) => restart(() => setMine(e.target.checked))} />
            {tx("suggestions.pill_mine")}
          </label>
          <span className="spacer" />
          <label className="sr-only" htmlFor="sg-sort">{tx("suggestions.saralash")}</label>
          <select id="sg-sort" value={sort}
                  onChange={(e) => restart(() => setSort(e.target.value as Sort))}>
            {SORTS.map((v) => (
              <option key={v} value={v}>{tx("suggestions.saralash_" + v)}</option>
            ))}
          </select>
        </div>

        {error && <ErrorMsg error={error} />}
        {loading && !columns.length ? <Loading /> : bosh ? (
          <Card>
            <Empty icon="💡"
                   title={mine ? tx("suggestions.meniki_bosh") : tx("suggestions.bosh_holat")}
                   text={mine ? tx("suggestions.meniki_bosh_matn")
                              : tx("suggestions.bosh_holat_matn")} />
          </Card>
        ) : (
          <div className="board sg-board">
            {columns.map((col) => {
              const meta = COLUMNS.find((c) => c.key === col.key);
              return (
                <div className="column" key={col.key}>
                  <div className="column-head">
                    <span className="dot" style={{ background: meta?.dot }} />
                    {tx("suggestions.ustun_" + col.key.toLowerCase())}
                    <span className="n">{col.count}</span>
                  </div>
                  <div className="column-body">
                    {col.items.map((item, i) => (
                      <SuggestionCard
                        key={item.id}
                        item={item}
                        /* O'rin faqat «Barchasi» da: qolgan ustunlar bitta
                           holatning ichi va ular orasida "birinchi o'rin"
                           degani yo'q. Raqam sahifadan sahifaga DAVOM
                           etadi - ikkinchi sahifa 11 dan boshlanadi. */
                        rank={col.key === "ALL"
                          ? (col.page - 1) * BOARD_PAGE + i + 1
                          : null}
                        onChange={() => reload()}
                        onEdit={() => { setEditing(item); setCreating(false); }}
                        onDelete={() => void remove(item)}
                      />
                    ))}

                    {!col.items.length && (
                      <p className="muted center" style={{ fontSize: 12.5, padding: "16px 0" }}>
                        {tx("suggestions.ustun_bosh")}
                      </p>
                    )}

                    {col.pages > 1 && (
                      <Pager page={col.page} pages={col.pages}
                             onPick={(n) => {
                               setPages((prev) => ({ ...prev, [col.key]: n }));
                               setEditing(null);
                             }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
