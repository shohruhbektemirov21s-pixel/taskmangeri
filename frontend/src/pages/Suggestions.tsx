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

import { api, listOf } from "@/api/client";
import type {
  Suggestion, SuggestionFile, SuggestionScopeValue, VoteChoiceValue,
} from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useLive } from "@/realtime/RealtimeContext";
import { useAuth } from "@/auth/AuthContext";
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
type Tab = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "MINE";

/**
 * Filtr nishonlari. Son SERVERDAN keladi (`/suggestions/counts/`) -
 * ekrandagi qatorlarni sanab bo'lmaydi, chunki ro'yxat sahifalangan va
 * birinchi sahifada o'ntasi turadi.
 *
 * `key` - sanoq javobidagi nom, `tone` - nishon rangi.
 */
const PILLS: { tab: Tab; key: string; tone: string; boss?: boolean }[] = [
  { tab: "ALL", key: "all", tone: "" },
  { tab: "PENDING", key: "PENDING", tone: "warn" },
  { tab: "APPROVED", key: "APPROVED", tone: "ok", boss: true },
  { tab: "REJECTED", key: "REJECTED", tone: "danger", boss: true },
  { tab: "MINE", key: "mine", tone: "" },
];

/** Saralash - qiymatlar server tushunadigan kalitlar (`SuggestionViewSet.SORTS`). */
const SORTS = ["top", "new", "old"] as const;
type Sort = typeof SORTS[number];

/** Bir sahifada nechta taklif. Serverda ham shu son so'raladi. */
const PER_PAGE = 10;

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
  const { user } = useAuth();
  const isBoss = Boolean(user?.is_boss);
  const [tab, setTab] = useState<Tab>("ALL");
  const [sort, setSort] = useState<Sort>("top");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Suggestion[]>([]);
  /* Serverdagi UMUMIY son - sahifa raqamlari shundan hisoblanadi. */
  const [total, setTotal] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [ok, setOk] = useState("");
  /* Taklif saqlandi-yu, fayl yuklanmadi - shu yerda aytiladi. */
  const [warn, setWarn] = useState("");

  /* «Saqlandi» xabari o'n soniyada o'zi so'nadi.
     U ish BITGANINI aytadi, ya'ni o'qilgach kerak emas - lekin ro'yxatning
     tepasida turib joy egallardi va odam uni yopish uchun sahifani qayta
     yuklardi. Ogohlantirish (`warn`) esa QOLADI: unda bajarilmagan ish bor
     (fayl yuklanmadi) va uni ko'rmay qolish mumkin emas. */
  useEffect(() => {
    if (!ok) return;
    const timer = setTimeout(() => setOk(""), 10_000);
    return () => clearTimeout(timer);
  }, [ok]);

  /* Saralash SERVERDA: eng ko'p qo'llab-quvvatlangani birinchi sahifada
     turadi. Shuning uchun kesish ham serverda - mijozda kesilsa, "1-o'rin"
     faqat kelgan o'ttiztaning ichida bo'lardi. */
  /* Har bo'lim serverga O'Z filtri bilan boradi. «Barchasi» da filtr
     umuman yo'q - qolganini server ko'rinish qoidasi bo'yicha o'zi
     qirqadi. Qaror kesimlari `status` bo'yicha: ular ham ochiq, ham
     yopiq takliflarni qamraydi, chunki qaror turdan qat'i nazar
     qilinadi. */
  const params = tab === "MINE"
    ? { mine: 1, sort, page, page_size: PER_PAGE }
    : tab === "ALL"
      ? { sort, page, page_size: PER_PAGE }
      : { status: tab, sort, page, page_size: PER_PAGE };
  const { data, error, loading, reload } = useFetch<unknown>("/suggestions/", params);

  /* Nishonlardagi sonlar - alohida so'rov, chunki ro'yxat javobida faqat
     TANLANGAN kesimning soni bo'ladi. `reload` bilan birga yangilanadi:
     qaror chiqqanda «Ko'rib chiqilmoqda» kamayib, «Tasdiqlangan» ko'payadi. */
  const { data: countData, reload: reloadCounts } =
    useFetch<Record<string, number>>("/suggestions/counts/");
  const counts = countData || {};

  useEffect(() => {
    if (data === null) return;
    setRows(listOf<Suggestion>(data));
    setTotal((data as { count?: number }).count ?? 0);
  }, [data]);

  // REAL VAQTDA. Yangi taklif boshliqqa, qaror esa muallifga bildirishnoma
  // bo'lib keladi (`apps/suggestions/services.py`). Sahifa ochiq turgan
  // odam uchun qo'ng'iroqning o'zi yetarli emas - ro'yxatning o'zi ham
  // yangilansin, aks holda u sahifani qo'lda qayta yuklashi kerak bo'lardi.
  useLive((d) => {
    if (d.event !== "notification") return;
    const kind = d.notification?.kind;
    if (kind === "suggestion.new" || kind === "suggestion.decided") {
      reload();
      reloadCounts();
    }
  });

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  /** Bo'limni almashtirish - har doim birinchi sahifadan. */
  function pick(next: Tab) {
    setTab(next);
    setPage(1);
    setCreating(false);
    setEditing(null);
  }

  function patch(saved: Suggestion) {
    setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
  }

  async function remove(item: Suggestion) {
    const yes = await confirmDialog({
      title: tx("suggestions.ochirilsinmi", { nom: item.title }),
      body: tx("suggestions.ochirish_izohi"),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!yes) return;
    await api.delete(`/suggestions/${item.id}/`);
    setOk(tx("suggestions.ochirildi"));
    // Oxirgi sahifadagi yagona yozuv o'chsa, o'sha sahifa endi yo'q:
    // server "Invalid page" deb 404 berardi. Bir qadam orqaga qaytamiz.
    if (rows.length === 1 && page > 1) setPage(page - 1);
    else reload();
  }

  function afterSave(saved: Suggestion, warn?: string) {
    setCreating(false);
    setEditing(null);
    setWarn(warn || "");
    setOk(warn ? "" : tx("suggestions.saqlandi"));
    // Yangi taklif boshqa kesimga tushgan bo'lishi mumkin (ochiq -> yopiq),
    // shuning uchun ro'yxatni serverdan qayta so'raymiz.
    reload();
    patch(saved);
  }

  /* Qaror kesimlari faqat boshliqqa - qoida o'zgarmadi, faqat nishon
     ko'rinishiga o'tdi. Yorliqlar bazadan (`tx`), son esa serverdan. */
  const pills = PILLS.filter((p) => !p.boss || isBoss).map((p) => ({
    ...p,
    label: tx(`suggestions.pill_${p.key.toLowerCase()}`),
    n: counts[p.key],
  }));

  const EMPTY_STATES: Record<Tab, { title: string; text: string }> = {
    ALL: { title: tx("suggestions.bosh_holat"), text: tx("suggestions.bosh_holat_matn") },
    MINE: { title: tx("suggestions.meniki_bosh"), text: tx("suggestions.meniki_bosh_matn") },
    PENDING: {
      title: tx("suggestions.kutilayotgan_bosh"),
      text: tx("suggestions.kutilayotgan_bosh_matn"),
    },
    APPROVED: {
      title: tx("suggestions.tasdiqlangan_bosh"),
      text: tx("suggestions.tasdiqlangan_bosh_matn"),
    },
    REJECTED: {
      title: tx("suggestions.rad_etilgan_bosh"),
      text: tx("suggestions.rad_etilgan_bosh_matn"),
    },
  };
  const empty = EMPTY_STATES[tab];

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
        tabs={pills.map((p) => (
          <button key={p.tab} type="button"
                  className={`sg-pill ${p.tone} ${tab === p.tab ? "on" : ""}`}
                  onClick={() => pick(p.tab)}>
            {p.label}
            {/* Son kelmagan bo'lsa nishon sonsiz chiziladi - nolni
                ko'rsatib qo'yish yolg'on bo'lardi. */}
            {p.n !== undefined && <span className="n">{p.n}</span>}
          </button>
        ))}
      />

      <div className="content" style={{ maxWidth: 900 }}>
        {ok && <OkMsg text={ok} />}
        {warn && <ErrorMsg error={warn} />}

        {(creating || editing) && (
          <SuggestionForm
            key={editing ? `edit-${editing.id}` : "new"}
            editing={editing}
            initial={editing
              ? { title: editing.title, body: editing.body,
                  scope: editing.scope, is_anonymous: editing.is_anonymous }
              : EMPTY}
            onCancel={() => { setCreating(false); setEditing(null); }}
            onSaved={afterSave}
          />
        )}

        {/* Saralash: ro'yxat STANDARTDA ovoz bo'yicha keladi - jamoa eng
            ko'p kutayotgan o'zgarish tepada turadi. «Eng yangi» boshqa
            savolga javob beradi («bugun nima taklif qilindi»), shuning
            uchun u tanlov, standart emas. Tartibni server hal qiladi. */}
        {!!rows.length && (
          <div className="sg-toolbar">
            <span className="spacer" />
            <label className="sr-only" htmlFor="sg-sort">{tx("suggestions.saralash")}</label>
            <select id="sg-sort" value={sort}
                    onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }}>
              {SORTS.map((v) => (
                <option key={v} value={v}>{tx(`suggestions.saralash_${v}`)}</option>
              ))}
            </select>
          </div>
        )}

        {error && <ErrorMsg error={error} />}
        {loading ? <Loading /> : !rows.length ? (
          <Card>
            <Empty icon="💡" title={empty.title} text={empty.text} />
          </Card>
        ) : (
          <div className="sg-list">
            {rows.map((item, i) => (
              <SuggestionCard
                key={item.id}
                item={item}
                /* O'rin faqat ochiq kesimda: yopiq takliflar jamoa ovoziga
                   qo'yilmaydi, ya'ni ular orasida "birinchi o'rin" yo'q.
                   Raqam sahifadan sahifaga DAVOM etadi: ikkinchi sahifa
                   11 dan boshlanadi, yana 1 dan emas. */
                rank={tab === "ALL" ? (page - 1) * PER_PAGE + i + 1 : null}
                onChange={patch}
                onEdit={() => { setEditing(item); setCreating(false); }}
                onDelete={() => void remove(item)}
              />
            ))}

            {/* Sahifa raqamlari - bo'linadigan narsa bo'lsagina. Yangi
                sahifaga o'tilganda tahrir formasi yopiladi: u boshqa
                sahifada qolgan taklifniki edi. */}
            {/* Qamrov yozuvi HAR DOIM turadi - bitta sahifada ham «nechtadan
                nechtasi» degan savol bor. Sahifa raqamlari esa bo'linadigan
                narsa bo'lgandagina. */}
            <div className="pager-bar">
              <span className="muted">
                {tx("suggestions.royxat_qamrovi", {
                  jami: total,
                  dan: (page - 1) * PER_PAGE + 1,
                  gacha: Math.min(page * PER_PAGE, total),
                })}
              </span>
              {pages > 1 && (
                <Pager page={page} pages={pages}
                       onPick={(n) => { setPage(n); setEditing(null); }} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
