/**
 * Bitta taklifning O'Z SAHIFASI.
 *
 * NEGA ALOHIDA SAHIFA. Ro'yxatdagi qator qisqa javob beradi: nima taklif
 * qilingan, qanday holatda va jamoa nima degan. Taklifning O'ZI esa -
 * matn, chizmalar, boshliqning izohi - qatorga sig'maydi. Ilgari u
 * qatorning ostida ochilardi va ro'yxat shu zahoti bir necha ekranga
 * cho'zilib ketardi; endi taklif to'liq holda shu yerda turadi.
 *
 * RAQAM MANZILDA EMAS. Loyihada qabul qilingan tartib: identifikator
 * sahifa holatida ketadi (`nav/index.ts`), manzil esa `/taklif` bo'lib
 * qoladi. Shuning uchun havolani birovga yuborib bo'lmaydi - bu
 * talabning narxi, kamchilik emas.
 *
 * RUXSAT SERVERDA. Yopiq taklifni muallif va boshliqdan boshqa hech kim
 * ochmaydi: ro'yxat ham, bu sahifa ham `get_queryset` dan o'tadi va
 * begonaga 404 qaytadi. Bu yerdagi tugmalar (`can_edit`, `can_decide`,
 * `can_vote`) faqat KO'RINISHNI boshqaradi.
 */
import { useCallback, useEffect, useState } from "react";

import { ApiError, api } from "@/api/client";
import type { Suggestion } from "@/api/types";
import { useLiveReload } from "@/realtime/RealtimeContext";
import { confirmDialog } from "@/components/Confirm";
import { PageHead } from "@/components/Layout";
import {
  Attachments, BossPanel, DecisionBox, STATUS_TONE, SuggestionForm, VoteBar, formOf,
} from "@/components/suggestion";
import { Avatar, Card, Empty, ErrorMsg, Loading, timeAgo } from "@/components/ui";
import { useEntityNum, useGo } from "@/nav";
import { tx } from "@/i18n";

export default function SuggestionDetail() {
  const id = useEntityNum("suggestion");
  const go = useGo();
  const [item, setItem] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  /* Qaror chiqqach panel yopiladi. Fikr o'zgarsa yo'l ochiq: «Qarorni
     o'zgartirish» uni qaytadan ochadi. */
  const [redeciding, setRedeciding] = useState(false);
  /* Taklif saqlandi-yu, fayl yuklanmadi. */
  const [warn, setWarn] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setItem(await api.get<Suggestion>(`/suggestions/${id}/`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tx("suggestions.ochib_bolmadi"));
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Boshliq qaror qilsa sahifa o'zi yangilansin - ochiq turgan odam
  // qayta yuklamasin.
  useLiveReload(() => void load(), (d) =>
    d.event === "notification" && d.notification?.kind === "suggestion.decided");

  async function remove(target: Suggestion) {
    const yes = await confirmDialog({
      title: tx("suggestions.ochirilsinmi", { nom: target.title }),
      body: tx("suggestions.ochirish_izohi"),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!yes) return;
    await api.delete(`/suggestions/${target.id}/`);
    // Ro'yxatga qaytamiz: o'chirilgan taklifning sahifasi bo'sh qoladi.
    go("/takliflar");
  }

  /* Sessiyada raqam yo'q: odam manzilni qo'lda yozgan yoki havolani
     boshqa oynada ochgan. Oq ekran qoldirmaymiz - ro'yxatga yo'l
     ko'rsatamiz. */
  if (!id) {
    return (
      <>
        <PageHead title={<strong>{tx("suggestions.taklif")}</strong>} />
        <div className="content">
          <Card>
            <Empty icon="💡" title={tx("suggestions.tanlanmagan")}
                   text={tx("suggestions.tanlanmagan_matn")}>
              <button className="btn btn-primary" onClick={() => go("/takliflar")}>
                {tx("suggestions.royxatga")}
              </button>
            </Empty>
          </Card>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHead title={<strong>{tx("suggestions.taklif")}</strong>} />
        <div className="content">
          <ErrorMsg error={error} />
          <button className="btn" onClick={() => go("/takliflar")}>
            {tx("suggestions.royxatga")}
          </button>
        </div>
      </>
    );
  }

  if (!item) return <Loading />;

  const decided = item.status !== "PENDING";

  return (
    <>
      <PageHead
        title={<strong>{item.title}</strong>}
        actions={
          <>
            {item.can_edit && !editing && (
              <>
                <button className="btn btn-sm" onClick={() => setEditing(true)}>
                  {tx("common.tahrirlash")}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => void remove(item)}>
                  {tx("common.ochirish")}
                </button>
              </>
            )}
            {item.can_decide && decided && !redeciding && (
              <button className="btn btn-sm" onClick={() => setRedeciding(true)}>
                {tx("suggestions.qarorni_ozgartirish")}
              </button>
            )}
          </>
        }
      />

      <div className="content sg">
        {warn && <ErrorMsg error={warn} />}

        {editing ? (
          <div className="sg-form">
            <SuggestionForm
              editing={item}
              initial={formOf(item)}
              onCancel={() => setEditing(false)}
              onSaved={(saved, note) => {
                setEditing(false);
                setWarn(note || "");
                setItem(saved);
                // Fayllar yuklangan bo'lsa javobda ular yo'q - qayta o'qiymiz.
                void load();
              }}
            />
          </div>
        ) : (
          <Card>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className={`badge ${STATUS_TONE[item.status]}`}>{item.status_display}</span>
              {/* Ochiq taklif - odatdagi hol; yopig'ini esa hamma
                  ko'rmaydi va buni aytib turish kerak. */}
              {item.scope === "CLOSED" && (
                <span className="badge badge-info">{item.scope_display}</span>
              )}
              <span className="spacer" />
              <span className="sg-by">
                {/* Anonim taklifda muallif HECH KIMGA ko'rsatilmaydi -
                    boshliqqa ham. Server `author` ni `null` beradi. */}
                {item.author
                  ? <><Avatar user={item.author} size="sm" /> {item.author.full_name}</>
                  : <span className="sg-anon">{tx("suggestions.anonim_muallif")}</span>}
              </span>
              <span className="muted">{timeAgo(item.created_at)}</span>
            </div>

            <p className="sg-body">{item.body}</p>

            <Attachments item={item} />

            {item.can_vote && <VoteBar item={item} onChange={setItem} />}

            <DecisionBox item={item} />

            {item.can_decide && (item.status === "PENDING" || redeciding) && (
              <BossPanel item={item}
                         onDone={(saved) => { setRedeciding(false); setItem(saved); }}
                         onCancel={redeciding ? () => setRedeciding(false) : undefined} />
            )}
          </Card>
        )}
      </div>
    </>
  );
}
