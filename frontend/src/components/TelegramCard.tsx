/**
 * Telegram bog'lanishi — o'z profilida.
 *
 * BITTA TUGMA. Havola serverdan keladi (`link_url`) va ichida shu hisob
 * uchun imzolangan, 15 daqiqalik kod bor. Telegram uni `/start <kod>`
 * xabari qilib botga yuboradi, bot esa kodni tekshirib bog'laydi -
 * odam hech narsa yozmaydi.
 *
 * NEGA KOD KERAK. Ilgari bu yerda ikki qadamlik yo'riqnoma turardi:
 * «profilingizga username yozing, keyin botga /start bosing». Bot esa
 * o'sha maydon bo'yicha qidirardi va maydonni hech kim tasdiqlamasdi -
 * begonaning username'ini yozib qo'yish mumkin edi
 * (`backend/apps/telegram/linkcode.py`).
 *
 * Token qo'yilmagan bo'lsa (`enabled: false`) bo'lim UMUMAN chizilmaydi -
 * ishlamaydigan sozlama ko'rsatib, odamni ovora qilmaydi.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { Card, fmtDateTime } from "@/components/ui";
import { tx } from "@/i18n";

interface TelegramState {
  enabled: boolean;
  bot_username: string;
  /** Profildagi Telegram maydoni - faqat ma'lumot uchun, bog'lashda ishlatilmaydi. */
  username: string;
  is_linked: boolean;
  is_muted: boolean;
  linked_at: string | null;
  /** Bir martalik ulash havolasi. Bog'langan hisobda bo'sh keladi. */
  link_url: string;
}

export default function TelegramCard() {
  const [state, setState] = useState<TelegramState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void api.get<TelegramState>("/telegram/link/")
      .then(setState)
      .catch(() => setState(null));
  }, []);

  useEffect(load, [load]);

  async function act(fn: () => Promise<TelegramState>) {
    setBusy(true);
    try {
      setState(await fn());
    } catch {
      load();
    } finally {
      setBusy(false);
    }
  }

  // Sozlanmagan yoki o'qib bo'lmagan - bo'lim ko'rinmaydi.
  if (!state?.enabled) return null;

  return (
    <Card title={tx("telegram_card.telegram")}>
      {state.is_linked ? (
        <div className="stack">
          <p className="row" style={{ gap: 8, margin: 0 }}>
            <span className="badge badge-ok">{tx("telegram_card.boglangan")}</span>
            {state.is_muted && <span className="badge badge-warn">{tx("telegram_card.xabarlar_ochirilgan")}</span>}
            {state.linked_at && (
              <small className="muted">{fmtDateTime(state.linked_at)}</small>
            )}
          </p>
          {/* Ilgari bu yerda `/vazifalarim`, `/bugun` va `/tekshiruv`
              buyruqlari sanalardi. Ular botdan OLIB TASHLANGAN
              (`telegram/commands.py`) - matn esa qolib ketgan edi va
              odamga ishlamaydigan buyruqni va'da qilardi. */}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {tx("telegram_card.faqat_xabar_yuboradi")}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm" disabled={busy}
                    onClick={() => void act(() =>
                      api.post<TelegramState>("/telegram/link/", { is_muted: !state.is_muted }))}>
              {state.is_muted ? tx("telegram_card.xabarlarni_yoqish") : tx("telegram_card.xabarlarni_ochirish")}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy}
                    onClick={() => void act(() => api.delete<TelegramState>("/telegram/link/"))}>
              {tx("telegram_card.uzish")}
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p className="row" style={{ gap: 8, margin: 0 }}>
            <span className="badge">{tx("telegram_card.boglanmagan")}</span>
          </p>
          {state.link_url ? (
            <>
              {/* Havola HAR SAFAR yangi kod bilan keladi, shuning uchun
                  sahifa ochilganda olinadi va saqlanmaydi. */}
              <a className="btn btn-sm btn-primary" style={{ alignSelf: "flex-start" }}
                 href={state.link_url} target="_blank" rel="noreferrer">
                {tx("telegram_card.telegramga_ulash")}
              </a>
              <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                {tx("telegram_card.havola_bir_martalik")}
              </p>
            </>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              {tx("telegram_card.bot_sozlanmagan")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
