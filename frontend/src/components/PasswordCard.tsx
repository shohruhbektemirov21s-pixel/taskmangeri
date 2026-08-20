/**
 * Parolni almashtirish — o'z profilida.
 *
 * NEGA ALOHIDA KARTA. Parol profil formasining bir maydoni emas: uni
 * o'zgartirish uchun JORIY parol ham kerak va muvaffaqiyatdan keyin
 * server barcha eski seanslarni bekor qiladi. Buni «F.I.Sh.» va «Lavozim»
 * bilan bitta formaga qo'shsak, odam ismini tuzatib saqlaganda parol ham
 * qo'zg'algandek tuyulardi.
 *
 * SEANS UZILMASIN. Server eski `refresh` tokenlarni bekor qiladi (aks
 * holda «parolimni o'zgartirdim» degani hujum oynasini yopmasdi) va
 * javobda YANGI juftlikni beradi. Ular darrov saqlanmasa, odam o'z
 * parolini almashtirgani uchun tizimdan chiqib ketardi.
 */
import { useId, useState } from "react";
import { ApiError, api, tokens } from "@/api/client";
import { Card, ErrorMsg, PasswordInput } from "@/components/ui";
import { tx } from "@/i18n";

interface Result {
  detail: string;
  access: string;
  refresh: string;
}

export default function PasswordCard() {
  const fid = useId();
  const [open, setOpen] = useState(false);
  const [oldPassword, setOld] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setOld("");
    setNext("");
    setRepeat("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    // Takrorni SERVERGA yubormaymiz - bu yerdagi tekshiruv odamning
    // xatosini darhol ko'rsatish uchun.
    if (next !== repeat) {
      setError(tx("password_card.yangi_parollar_mos_kelmadi"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<Result>("/auth/change-password/", {
        old_password: oldPassword,
        new_password: next,
      });
      // Yangi juftlikni saqlaymiz - aks holda keyingi so'rov 401 bo'lardi.
      tokens.set(data.access, data.refresh);
      setOkMsg(tx("password_card.parol_yangilandi_boshqa_qurilmalardagi_seans"));
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("password_card.parolni_almashtirib_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={tx("common.parol")}>
      {okMsg && <div className="callout mb">{okMsg}</div>}

      {!open ? (
        <div className="stack">
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {tx("password_card.parolni_faqat_ozingiz_almashtirasiz_buning")}
          </p>
          <div>
            <button type="button" className="btn btn-sm"
                    onClick={() => { setOpen(true); setOkMsg(null); }}>
              {tx("password_card.parolni_almashtirish")}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <ErrorMsg error={error} />
          <div className="field">
            <label htmlFor={`${fid}-0`}>{tx("password_card.joriy_parol")}</label>
            <PasswordInput id={`${fid}-0`} value={oldPassword} required
                           autoComplete="current-password" onChange={setOld} />
          </div>
          <div className="field">
            <label htmlFor={`${fid}-1`}>{tx("password_card.yangi_parol")}</label>
            <PasswordInput id={`${fid}-1`} value={next} required
                           autoComplete="new-password" onChange={setNext} />
          </div>
          <div className="field">
            <label htmlFor={`${fid}-2`}>{tx("password_card.yangi_parolni_takrorlang")}</label>
            <PasswordInput id={`${fid}-2`} value={repeat} required
                           autoComplete="new-password" onChange={setRepeat} />
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {tx("password_card.kamida_8_belgi_faqat_raqamdan")}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? tx("password_card.almashtirilmoqda") : tx("common.saqlash")}
            </button>
            <button type="button" className="btn btn-sm"
                    onClick={() => { setOpen(false); reset(); }}>
              {tx("common.bekor_qilish")}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
