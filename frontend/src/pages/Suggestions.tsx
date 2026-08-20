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
import { useEffect, useState } from "react";

import { api, listOf } from "@/api/client";
import type {
  Suggestion, SuggestionFile, SuggestionScopeValue, VoteChoiceValue,
} from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { confirmDialog } from "@/components/Confirm";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import { PageHead } from "@/components/Layout";
import {
  IconCheck, IconClose, IconFile, IconIdea, IconNeutral, IconThumbDown, IconThumbUp,
} from "@/components/icons";
import {
  Avatar, Card, Empty, ErrorMsg, Loading, OkMsg, timeAgo,
} from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { tx } from "@/i18n";

type Tab = "OPEN" | "CLOSED" | "MINE";

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

  // Yopiq taklif anonim bo'lmaydi - serverda ham shu qoida bor
  // (`SuggestionSerializer.validate`), bu yerda faqat belgini olib tashlaymiz.
  const closed = f.scope === "CLOSED";
  useEffect(() => {
    if (closed && f.is_anonymous) setF((prev) => ({ ...prev, is_anonymous: false }));
  }, [closed, f.is_anonymous]);

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
          <div className="help">
            {closed ? tx("suggestions.yopiq_izoh") : tx("suggestions.ochiq_izoh")}
          </div>
        </div>

        {/* Anonimlik faqat ochiq taklifda: yopiqni baribir boshliq o'qiydi
            va kimga javob berishni bilishi kerak. */}
        {!closed && (
          <div className="field">
            <div className="check-list">
              <label className={f.is_anonymous ? "on" : ""}>
                <input type="checkbox" checked={f.is_anonymous}
                       onChange={(e) => set("is_anonymous", e.target.checked)} />
                {tx("suggestions.anonim_yuborish")}
              </label>
            </div>
            <div className="help">{tx("suggestions.anonim_izoh")}</div>
          </div>
        )}

        {/* Fayl — «oddiy taklif ham yuklay olsin». Kim yuklagani kartada
            ko'rinadi; anonim taklifda esa u ham yashiriladi. */}
        <div className="field">
          <label>{tx("suggestions.fayllar")}</label>

          {!!kept.length && (
            <div className="stack" style={{ marginBottom: 10 }}>
              {kept.map((file) => (
                <div key={file.id} className="row sg-file">
                  <span className="file-ico"><IconFile size={15} /></span>
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
          <div className="help">
            {f.is_anonymous ? tx("suggestions.anonim_fayl_izoh") : tx("suggestions.fayl_izoh")}
          </div>
        </div>

        {editing && editing.status !== "PENDING" && (
          <div className="help" style={{ marginBottom: 14 }}>
            {tx("suggestions.tahrirdan_keyin_qaytadi")}
          </div>
        )}

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

function BossPanel({ item, onDone }: { item: Suggestion; onDone: (s: Suggestion) => void }) {
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
      </div>

      <p className="sg-body">{item.body}</p>

      {/* Biriktirilgan fayl - kim yuklagani bilan. Anonim taklifda
          `uploaded_by` serverdan `null` keladi. */}
      {!!item.files.length && (
        <div className="stack sg-files">
          {item.files.map((file) => (
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
          <div className="sg-secret">{tx("suggestions.ovoz_siri")}</div>
        </>
      )}

      {/* Qaror - hammaga ko'rinadi: taklif nima bo'lganini jamoa bilsin. */}
      {item.status !== "PENDING" && (
        <div className={`sg-decision ${item.status === "APPROVED" ? "ok" : "no"}`}>
          <strong>{item.status_display}</strong>
          {item.decision_note && <p>{item.decision_note}</p>}
          {item.decided_by && (
            <span className="muted">
              {tx("suggestions.qaror_qildi", { ism: item.decided_by.full_name })}
              {item.decided_at ? ` · ${timeAgo(item.decided_at)}` : ""}
            </span>
          )}
        </div>
      )}

      {item.can_decide && <BossPanel item={item} onDone={onChange} />}
    </div>
  );
}

/* -------------------------------------------------------------- sahifa */

export default function Suggestions() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("OPEN");
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [ok, setOk] = useState("");
  /* Taklif saqlandi-yu, fayl yuklanmadi - shu yerda aytiladi. */
  const [warn, setWarn] = useState("");

  const params = tab === "MINE" ? { mine: 1 } : { scope: tab };
  const { data, error, loading, reload } = useFetch<unknown>("/suggestions/", params);

  useEffect(() => {
    if (data !== null) setRows(listOf<Suggestion>(data));
  }, [data]);

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
    setRows((prev) => prev.filter((r) => r.id !== item.id));
    setOk(tx("suggestions.ochirildi"));
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

  const TABS: [Tab, string][] = [
    ["OPEN", tx("suggestions.ochiq")],
    ["CLOSED", tx("suggestions.yopiq")],
    ["MINE", tx("suggestions.meniki")],
  ];

  const empty = tab === "CLOSED"
    ? { title: tx("suggestions.yopiq_bosh"), text: tx("suggestions.yopiq_bosh_matn") }
    : tab === "MINE"
      ? { title: tx("suggestions.meniki_bosh"), text: tx("suggestions.meniki_bosh_matn") }
      : { title: tx("suggestions.bosh_holat"), text: tx("suggestions.bosh_holat_matn") };

  return (
    <>
      <PageHead
        title={<strong>{tx("suggestions.sarlavha_sahifa")}</strong>}
        subtitle={user?.is_boss ? tx("suggestions.tavsif_boshliq") : tx("suggestions.tavsif")}
        actions={
          !creating && !editing && (
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              <IconIdea size={14} /> {tx("suggestions.yangi_taklif")}
            </button>
          )
        }
        tabs={TABS.map(([v, l]) => (
          <button key={v} type="button" className={`tab ${tab === v ? "active" : ""}`}
                  onClick={() => { setTab(v); setCreating(false); setEditing(null); }}>
            {l}
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
                   qo'yilmaydi, ya'ni ular orasida "birinchi o'rin" yo'q. */
                rank={tab === "OPEN" ? i + 1 : null}
                onChange={patch}
                onEdit={() => { setEditing(item); setCreating(false); }}
                onDelete={() => void remove(item)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
