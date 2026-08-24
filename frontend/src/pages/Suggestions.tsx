/**
 * Takliflar — jamoa nima o'zgarishini so'raydi, boshliq qaror qiladi.
 *
 * KO'RINISH «VAZIFALAR» SAHIFASINIKI: tepada filtr paneli, ostida bitta
 * ro'yxat. Ilgari bu yer to'rt ustunli doska edi va ustunlar shu qadar tor
 * ediki, sarlavha ham, ism ham har harfda sinib ketardi - taklifni o'qish
 * uchun uni ochish kerak bo'lardi. Doskaning o'zi ham noto'g'ri va'da
 * berardi: u Kanban emas, bitta ro'yxatning kesimlari edi, ya'ni bitta
 * taklif ikkita ustunda birdan turardi. Endi kesim FILTR bo'lib panelga
 * chiqdi, taklif esa bitta joyda - bitta qatorda - turadi.
 *
 * QATOR QISQA JAVOB BERADI: nima taklif qilingan, qanday holatda, kim
 * yozgan, boshliq nima degan va jamoa qanday ovoz bergan. Taklifning
 * O'ZI - matn, chizmalar, to'liq izoh va ovoz tugmalari - qator bosilganda
 * ochiladigan SAHIFADA (`pages/SuggestionDetail.tsx`). Ilgari u qatorning
 * ostiga yoyilardi va ro'yxat bir necha ekranga cho'zilib ketardi.
 *
 * KESISH SERVERDA. Qidiruv, holat, tur, sana va tartib - hammasi
 * so'rovga ketadi (`SuggestionViewSet.get_queryset`). Brauzerda filtrlash
 * faqat OCHILGAN sahifani qirqardi: ro'yxat sahifalangan va «topilmadi»
 * degan javob aslida «birinchi o'ttiztada yo'q» degani bo'lib qolardi.
 *
 * TARTIB SERVERDAN. Standart tartib ovoz bo'yicha (`qo'shilaman` minus
 * `qo'shilmayman`), ya'ni eng ko'p qo'llab-quvvatlangan taklif birinchi
 * o'rinda turadi.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";

import { api, listOf, pagesOf, totalOf } from "@/api/client";
import type {
  Suggestion, SuggestionCounts, SuggestionScopeValue, SuggestionStatusValue,
} from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { useLive } from "@/realtime/RealtimeContext";
import { confirmDialog } from "@/components/Confirm";
import { DateField } from "@/components/dates";
import { PageHead } from "@/components/Layout";
import { IconCheck, IconClose, IconFile, IconIdea } from "@/components/icons";
import { EMPTY_FORM, STATUS_TONE, SuggestionForm, formOf } from "@/components/suggestion";
import {
  Avatar, Card, DUE_PERIODS, Empty, ErrorMsg, Loading, OkMsg, Pager, Progress,
  RowMenu, timeAgo,
} from "@/components/ui";
import { toSuggestion, useGo } from "@/nav";
import { tx } from "@/i18n";

/** Holat kesimi - filtrdagi tartib shu yerdan. */
const STATUSES: SuggestionStatusValue[] = ["PENDING", "APPROVED", "REJECTED"];

/** Turi: ochiq taklifni hamma ko'radi, yopig'ini muallif va boshliq. */
const SCOPES: SuggestionScopeValue[] = ["OPEN", "CLOSED"];

/** Saralash - qiymatlar server tushunadigan kalitlar (`SuggestionViewSet.SORTS`). */
const SORTS = ["top", "new", "old"] as const;
type Sort = typeof SORTS[number];

/** Bir sahifada nechta taklif. */
const PAGE_SIZE = 20;

/** `GET /api/suggestions/` javobi - DRF sahifalagichi. */
interface ListPage {
  count: number;
  results: Suggestion[];
}

/**
 * Filtr paneli holati.
 *
 * Manzilga yozilmaydi: yuqoridagi umumiy qidiruv bilan chalkashmasin -
 * qoida «Vazifalar» sahifasidagi bilan bir xil.
 */
interface Filters {
  search: string;
  status: "" | SuggestionStatusValue;
  scope: "" | SuggestionScopeValue;
  period: string;
  date: string;
  sort: Sort;
  mine: boolean;
}

const NO_FILTERS: Filters = {
  search: "", status: "", scope: "", period: "", date: "", sort: "top", mine: false,
};

/**
 * Qatorning XULOSASI: jamoa nima degan.
 *
 * Uch sanoq ham NOL bo'lganda ham yoziladi - «hech kim qarshi emas» ham
 * javob. Yonidagi chiziq esa qo'llab-quvvatlash ulushi: `qo'shilaman`
 * berilgan ovozlarning qanchasi. Maxrajda betaraflar ham bor: ular ovoz
 * bergan, ya'ni taklifni ko'rgan odamlar.
 *
 * Sonlar SERVERDAN keladi (`for_count`, `against_count`, `neutral_count`),
 * bu yerda faqat ulush hisoblanadi.
 */
function VoteStats({ item }: { item: Suggestion }) {
  const total = item.for_count + item.against_count + item.neutral_count;
  const percent = total ? Math.round((item.for_count * 100) / total) : 0;
  return (
    <div className="wl-stats">
      <div className="wl-counts">
        <span className="wl-stat">
          {tx("suggestions.qoshilaman")} <b>{item.for_count}</b>
        </span>
        <span className={`wl-stat ${item.against_count ? "bad" : ""}`}>
          {tx("suggestions.qoshilmayman")} <b>{item.against_count}</b>
        </span>
        <span className="wl-stat">
          {tx("suggestions.betarafman")} <b>{item.neutral_count}</b>
        </span>
      </div>
      <span className="wl-percent">
        <Progress value={percent} />
        <span className="mono">{item.for_count}/{total}</span>
        <b>{percent}%</b>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- bitta qator */

function SuggestionRow({ item, rank, onEdit, onDelete }: {
  item: Suggestion;
  /** Ro'yxatdagi o'rni - faqat ovoz bo'yicha saralanganda. */
  rank: number | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const go = useGo();
  const votes = item.for_count + item.against_count + item.neutral_count;
  const decided = item.status !== "PENDING";

  return (
    /* Qatorning istalgan yeriga bosilsa taklif ochiladi - sarlavhani aniq
       nishonga olish shart emas. Sarlavhaning o'zi esa haqiqiy havola:
       klaviatura bilan yetib boriladi va o'rta tugma bilan yangi oynada
       ochiladi. Qoida «Umumiy tarix» va «Vazifalar» dagi qatorlar bilan
       bir xil. */
    <div className="repo-item clickable" onClick={() => go(toSuggestion(item.id))}>
      <div className="row wrap">
        {rank !== null && <span className="sg-rank">{rank}</span>}
        <h3 className="sg-title">
          <Link {...toSuggestion(item.id)} onClick={(e) => e.stopPropagation()}>
            {item.title}
          </Link>
        </h3>
        <span className={`badge ${STATUS_TONE[item.status]}`}>{item.status_display}</span>
        {/* Ochiq taklif - odatdagi hol, uni yozib o'tirish shart emas.
            Yopig'i esa alohida belgi bilan turadi: uni hamma ko'rmaydi. */}
        {item.scope === "CLOSED" && (
          <span className="badge badge-info">{item.scope_display}</span>
        )}
        <span className="spacer" />
        {!!item.files.length && (
          <span className="badge" title={tx("suggestions.fayllar")}>
            <IconFile size={11} /> {item.files.length}
          </span>
        )}

        {/* Muallifning amallari - qatorning o'ng chekkasida, loyihalar
            ro'yxatidagi kabi. Menyu qatorning ustida turadi, shuning uchun
            bosilganda taklif ochilib ketmasin. Boshliqning qarori bu yerda
            yo'q: u taklifning o'z sahifasida, matni bilan birga. */}
        {item.can_edit && (
          <div className="sg-actions" onClick={(e) => e.stopPropagation()}>
            <RowMenu>
              <button type="button" onClick={onEdit}>{tx("common.tahrirlash")}</button>
              <button type="button" onClick={onDelete}>{tx("common.ochirish")}</button>
            </RowMenu>
          </div>
        )}
      </div>

      {/* Kim yozgani va qachon. Anonim taklifda ism O'RNIGA emas, umuman
          yo'q: muallif hech kimga - boshliqqa ham - ochilmaydi. */}
      <div className="repo-meta">
        <span className="sg-by">
          {item.author
            ? <><Avatar user={item.author} size="sm" /> {item.author.full_name}</>
            : <span className="sg-anon">{tx("suggestions.anonim_muallif")}</span>}
        </span>
        <span>{timeAgo(item.created_at)}</span>
        {/* KIM qaror qilgani yozilmaydi - taklif sahifasidagi bilan bir
            xil qoida (`DecisionBox`). Qaror qiladigan rol bitta, ya'ni
            ism yangi ma'lumot bermaydi; qarorning O'ZI esa pastdagi
            `sg-verdict` qatorida, izohi bilan birga turadi. */}
      </div>

      {/* QAROR QATORNING O'ZIDA. Nishonning yolg'iz o'zi «tasdiqlandi»
          deydi-yu, NEGA ekanini aytmaydi - boshliqning izohi esa javobning
          yarmi, ayniqsa rad etilganda (izohsiz rad etib bo'lmaydi ham:
          `DecisionSerializer`). Shuning uchun bu yerda izohning bir
          qatorlik boshi turadi, to'lig'i esa taklif sahifasida. Javob
          kutayotgan taklifda yozilmaydi: uning nishoni allaqachon «Ko'rib
          chiqilmoqda» deb turibdi. */}
      {decided && (
        <div className={`sg-verdict ${item.status === "APPROVED" ? "ok" : "no"}`}>
          {item.status === "APPROVED" ? <IconCheck size={12} /> : <IconClose size={12} />}
          <strong>{item.status_display}</strong>
          {item.decision_note && (
            <span className="sg-verdict-note">
              {tx("suggestions.qaror_izoh_qisqa", { izoh: item.decision_note })}
            </span>
          )}
        </div>
      )}

      {/* Ovoz berilmagan taklifda chiziq ham, nollar ham chizilmaydi:
          «0/0 · 0%» hech nima aytmaydi, faqat joy egallaydi. */}
      {votes > 0 && <VoteStats item={item} />}
    </div>
  );
}

/* -------------------------------------------------------------- sahifa */
export default function Suggestions() {
  const fid = useId();
  const { user } = useAuth();
  /* «Turi» tanlagichi FAQAT BOSHLIQDA. Qolgan hamma uchun bu tanlov
     deyarli bo'sh: u barcha OCHIQ takliflarni va o'zining sanoqli yopiq
     taklifini ko'radi, ya'ni kesim ro'yxatni deyarli o'zgartirmasdi.
     Boshliq esa ikkovini ham to'liq ko'radi va «yopiq gaplar» ni ajratib
     olishi kerak. Bu YASHIRISH emas, panelni tozalash: chegara serverda
     (`SuggestionViewSet.visible`) va `?scope=` har kimga o'zi ko'radigan
     doirada baribir ishlaydi. */
  const canPickScope = Boolean(user?.is_boss);

  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [ok, setOk] = useState("");
  /* Taklif saqlandi-yu, fayl yuklanmadi. */
  const [warn, setWarn] = useState("");

  /* «Saqlandi» o'zi so'nadi; ogohlantirish qoladi - unda bajarilmagan ish bor. */
  useEffect(() => {
    if (!ok) return;
    const timer = setTimeout(() => setOk(""), 10_000);
    return () => clearTimeout(timer);
  }, [ok]);

  // Qidiruv har harfda emas, yozish to'xtagach ketadi.
  const list = useFetch<ListPage>("/suggestions/", {
    search: f.search,
    status: f.status,
    scope: f.scope,
    period: f.period,
    date: f.date,
    sort: f.sort,
    ...(f.mine ? { mine: 1 } : {}),
    page,
    page_size: PAGE_SIZE,
  }, { debounceMs: 300 });

  /* Holat tanlagichidagi sonlar - SERVERDAN, ekrandagi qatorlardan emas
     (ro'yxat sahifalangan). Ular ko'rinish shartidan chiqadi
     (`SuggestionViewSet.visible`), ya'ni panel filtrlaridan qat'i nazar
     «navbatda nechta taklif bor» degan savolga javob beradi. */
  const counts = useFetch<SuggestionCounts>("/suggestions/counts/");

  const rows = listOf<Suggestion>(list.data);
  const total = totalOf(list.data);
  const pages = pagesOf(list.data, PAGE_SIZE);

  const reloadList = list.reload;
  const reloadCounts = counts.reload;
  const reload = useCallback(() => {
    reloadList();
    reloadCounts();
  }, [reloadList, reloadCounts]);

  // Ochiq turgan sahifa o'zi yangilansin - qo'ng'iroqning o'zi yetarli emas.
  useLive((d) => {
    if (d.event !== "notification") return;
    const kind = d.notification?.kind;
    if (kind === "suggestion.new" || kind === "suggestion.decided") reload();
  });

  function set<K extends keyof Filters>(k: K, v: Filters[K]) {
    // Filtr almashganda sahifa birinchisiga qaytadi - aks holda beshinchi
    // sahifada turgan odam qidiruv yozib bo'sh ekranga urilardi.
    setPage(1);
    setEditing(null);
    // Davr va aniq sana bir-birini almashtiradi: ikkovi birga tanlangan
    // ekranda "qaysi biri ishlayapti?" degan savol tug'ilardi.
    setF((prev) => ({
      ...prev,
      [k]: v,
      ...(k === "period" ? { date: "" } : {}),
      ...(k === "date" ? { period: "" } : {}),
    }));
  }

  function clear() {
    setPage(1);
    setEditing(null);
    setF(NO_FILTERS);
  }

  /* Saralash filtr emas - «Tozalash» uni o'z holicha qoldiradi. */
  const dirty = Boolean(f.search || f.status || f.scope || f.period || f.date || f.mine);
  /* Faqat «meniki» tanlangan bo'lsa bo'sh ekran boshqacha gapiradi: bu
     «topilmadi» emas, «siz hali yozmagansiz» - va'da ham boshqa. */
  const onlyMine = f.mine && !(f.search || f.status || f.scope || f.period || f.date);

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
          <>
            {/* Sanoq JAMI takliflarniki, ekrandagilarniki emas - u tanlangan
                kesim qanchaligini aytadi. */}
            {!!list.data && (
              <span className="badge">{tx("suggestions.nechta_taklif", { n: total })}</span>
            )}
            {!creating && !editing && (
              <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                <IconIdea size={14} /> {tx("suggestions.yangi_taklif")}
              </button>
            )}
          </>
        }
      />

      <div className="content wl sg">
        {ok && <OkMsg text={ok} />}
        {warn && <ErrorMsg error={warn} />}
        <ErrorMsg error={list.error} />

        {(creating || editing) && (
          /* Forma zich ro'yxatning qoidasidan tashqarida - sabab
             `.sg-form` yonida yozilgan. */
          <div className="sg-form">
            <SuggestionForm
              key={editing ? "edit-" + editing.id : "new"}
              editing={editing}
              initial={editing ? formOf(editing) : EMPTY_FORM}
              onCancel={() => { setCreating(false); setEditing(null); }}
              onSaved={afterSave}
            />
          </div>
        )}

        {/* Qidiruv chapda va keng, tanlovlar o'ngda - ular tor va soni
            o'zgarmaydi. Tuzilish «Vazifalar» sahifasidagi panel bilan
            bir xil. */}
        <div className="filters">
          <div className="f wl-search">
            <label htmlFor={`${fid}-q`}>{tx("common.qidiruv")}</label>
            {/* Bitta maydon - uchta savol: SARLAVHA, taklif MATNI va
                MUALLIF ismi. Uchalasini ham server sinab ko'radi
                (`SuggestionViewSet.searched`). Anonim taklif ism bo'yicha
                topilmaydi - aks holda anonimlik qidiruv orqali buzilardi. */}
            <input id={`${fid}-q`} value={f.search} placeholder={tx("suggestions.qidiruv_placeholder")}
                   onChange={(e) => set("search", e.target.value)} />
          </div>

          <div className="wl-filters">
            <div className="f sg-status">
              <label htmlFor={`${fid}-s`}>{tx("suggestions.holat")}</label>
              <select id={`${fid}-s`} value={f.status}
                      onChange={(e) => set("status", e.target.value as Filters["status"])}>
                <option value="">{tx("suggestions.holat_all")}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tx("suggestions.holat_" + s.toLowerCase())} ({counts.data?.[s] ?? 0})
                  </option>
                ))}
              </select>
            </div>

            {canPickScope && (
              <div className="f">
                <label htmlFor={`${fid}-t`}>{tx("suggestions.turi")}</label>
                <select id={`${fid}-t`} value={f.scope}
                        onChange={(e) => set("scope", e.target.value as Filters["scope"])}>
                  <option value="">{tx("suggestions.barcha_turlar")}</option>
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {tx(s === "OPEN" ? "suggestions.ochiq" : "suggestions.yopiq")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="f">
              {/* Davr KALENDAR bo'yicha: «shu hafta» dushanbadan
                  yakshanbagacha. Oraliqni server hisoblaydi (`due_span`) -
                  vazifalar ro'yxati ham aynan shu mantiqda sanaydi. */}
              <label htmlFor={`${fid}-p`}>{tx("common.davr")}</label>
              <select id={`${fid}-p`} value={f.period}
                      onChange={(e) => set("period", e.target.value)}>
                <option value="">{tx("suggestions.barcha_vaqt")}</option>
                {DUE_PERIODS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="f wl-date">
              {/* AYNAN shu kuni yozilgan takliflar. */}
              <label htmlFor={`${fid}-d`}>{tx("common.sana")}</label>
              <DateField id={`${fid}-d`} value={f.date} onChange={(v) => set("date", v)} />
            </div>

            <div className="f sg-sort">
              <label htmlFor={`${fid}-o`}>{tx("suggestions.saralash")}</label>
              <select id={`${fid}-o`} value={f.sort}
                      onChange={(e) => set("sort", e.target.value as Sort)}>
                {SORTS.map((v) => (
                  <option key={v} value={v}>{tx("suggestions.saralash_" + v)}</option>
                ))}
              </select>
            </div>

            <label className="sg-only-mine">
              <input type="checkbox" checked={f.mine}
                     onChange={(e) => set("mine", e.target.checked)} />
              {tx("suggestions.meniki")}
            </label>

            {dirty && (
              <button type="button" className="btn btn-ghost" onClick={clear}>
                {tx("common.tozalash")}
              </button>
            )}
          </div>
        </div>

        {list.loading ? <Loading /> : !list.data ? null : !rows.length ? (
          <Card>
            <Empty icon="💡"
                   title={onlyMine ? tx("suggestions.meniki_bosh")
                     : dirty ? tx("suggestions.topilmadi")
                       : tx("suggestions.bosh_holat")}
                   text={onlyMine ? tx("suggestions.meniki_bosh_matn")
                     : dirty ? tx("suggestions.topilmadi_matn")
                       : tx("suggestions.bosh_holat_matn")} />
          </Card>
        ) : (
          <div className="card">
            <div className="card-list">
              {rows.map((item, i) => (
                <SuggestionRow
                  key={item.id}
                  item={item}
                  /* O'rin faqat OVOZ bo'yicha saralanganda ma'noga ega va
                     sahifadan sahifaga davom etadi. Sana bo'yicha
                     saralanganda raqam «birinchi o'rin» degan yolg'on
                     va'da berardi. */
                  rank={f.sort === "top" ? (page - 1) * PAGE_SIZE + i + 1 : null}
                  onEdit={() => { setEditing(item); setCreating(false); }}
                  onDelete={() => void remove(item)}
                />
              ))}
            </div>

            {/* Sahifa raqamlari - faqat bo'linadigan narsa bo'lsa. */}
            {pages > 1 && (
              <div className="card-body pager-bar">
                <span className="muted">
                  {tx("suggestions.natija_soni", {
                    jami: total,
                    dan: (page - 1) * PAGE_SIZE + 1,
                    gacha: Math.min(page * PAGE_SIZE, total),
                  })}
                </span>
                <Pager page={page} pages={pages}
                       onPick={(n) => { setEditing(null); setPage(n); }} />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
