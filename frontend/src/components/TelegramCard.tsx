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
    <Card title="Telegram">
      {state.is_linked ? (
        <div className="stack">
          <p className="row" style={{ gap: 8, margin: 0 }}>
            <span className="badge badge-ok">Bog'langan</span>
            {state.is_muted && <span className="badge badge-warn">Xabarlar o'chirilgan</span>}
            {state.linked_at && (
              <small className="muted">{fmtDateTime(state.linked_at)}</small>
            )}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Bildirishnomalar Telegramga ham keladi. Botda <code>/vazifalarim</code>,{" "}
            <code>/bugun</code> va <code>/tekshiruv</code> buyruqlari bor.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm" disabled={busy}
                    onClick={() => void act(() =>
                      api.post<TelegramState>("/telegram/link/", { is_muted: !state.is_muted }))}>
              {state.is_muted ? "Xabarlarni yoqish" : "Xabarlarni o'chirish"}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy}
                    onClick={() => void act(() => api.delete<TelegramState>("/telegram/link/"))}>
              Uzish
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p className="row" style={{ gap: 8, margin: 0 }}>
            <span className="badge">Bog'lanmagan</span>
          </p>
          {/* Ikki qadam - ikkinchisini ilova bajara olmaydi, shuning uchun
              ular ochiq ro'yxat bo'lib turadi. */}
          <ol className="tg-steps">
            <li>
              Profilingizdagi <strong>Telegram</strong> maydoniga username'ingizni yozing
              {state.username
                ? <> — hozir <code>@{state.username}</code> turibdi</>
                : <> — hozir <strong>bo'sh</strong></>}
            </li>
            <li>
              {botUrl
                ? <>Telegramda <a href={botUrl} target="_blank" rel="noreferrer">{bot}</a> ni oching</>
                : <>Telegramda {bot} oching</>}{" "}
              va <code>/start</code> bosing
            </li>
          </ol>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            Bot username'ingizni profildagi nom bilan solishtiradi. Telegram
            o'zi tanimagan odamga xabar yubora olmaydi — shuning uchun
            <code>/start</code> bosish shart.
          </p>
        </div>
      )}
    </Card>
  );
}
