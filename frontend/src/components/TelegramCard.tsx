/**
 * Telegram bog'lanishi — o'z profilida.
 *
 * NEGA TUGMA BILAN ULANMAYDI. Telegram bot API `chat_id` talab qiladi va
 * uni faqat odam botga `/start` bosgandan keyin biladi (spamdan himoya).
 * Ya'ni ulanishni ilova o'zi boshlay olmaydi: bu yerda faqat holat
 * ko'rsatiladi va nima qilish kerakligi aytiladi.
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
  /** Profildagi Telegram maydonidan olingan nom - bot aynan shuni qidiradi. */
  username: string;
  is_linked: boolean;
  is_muted: boolean;
  linked_at: string | null;
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

  const bot = state.bot_username ? `@${state.bot_username}` : "botni";
  const botUrl = state.bot_username ? `https://t.me/${state.bot_username}` : null;

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
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {tx("telegram_card.bildirishnomalar_telegramga_ham_keladi_botda")} <code>{tx("telegram_card.vazifalarim")}</code>,{" "}
            <code>{tx("telegram_card.bugun")}</code> {tx("telegram_card.va")} <code>{tx("telegram_card.tekshiruv")}</code> {tx("telegram_card.buyruqlari_bor")}
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
          {/* Ikki qadam - ikkinchisini ilova bajara olmaydi, shuning uchun
              ular ochiq ro'yxat bo'lib turadi. */}
          <ol className="tg-steps">
            <li>
              {tx("telegram_card.profilingizdagi")} <strong>{tx("telegram_card.telegram")}</strong> {tx("telegram_card.maydoniga_usernameingizni_yozing")}
              {state.username
                ? <> {tx("telegram_card.hozir")} <code>@{state.username}</code> {tx("telegram_card.turibdi")}</>
                : <> {tx("telegram_card.hozir")} <strong>{tx("telegram_card.bosh")}</strong></>}
            </li>
            <li>
              {botUrl
                ? <>{tx("telegram_card.telegramda")} <a href={botUrl} target="_blank" rel="noreferrer">{bot}</a> {tx("telegram_card.ni_oching")}</>
                : <>{tx("telegram_card.telegramda")} {bot} {tx("telegram_card.oching")}</>}{" "}
              {tx("telegram_card.va")} <code>{tx("telegram_card.start")}</code> {tx("telegram_card.bosing")}
            </li>
          </ol>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            {tx("telegram_card.bot_usernameingizni_profildagi_nom_bilan")}
            <code>{tx("telegram_card.start")}</code> {tx("telegram_card.bosish_shart")}
          </p>
        </div>
      )}
    </Card>
  );
}
