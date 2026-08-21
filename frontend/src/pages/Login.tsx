import { useId, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { ErrorMsg, PasswordInput } from "@/components/ui";
import { tx } from "@/i18n";

export default function Login() {
  const fid = useId();
  const { login } = useAuth();
  const nav = useNavigate();
  // `Protected` bu yerga otganda qaysi sahifa so'ralganini holatda qoldiradi.
  const next = (useLocation().state as { next?: string } | null)?.next;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      // Odam qaysidir sahifaga kirmoqchi bo'lib bu yerga otilgan bo'lsa
      // (`Protected`), kirgandan keyin o'sha yerga qaytadi - masalan
      // Telegramdagi «Ochish» tugmasi bosilganda. Aks holda u har safar
      // «Bosh panel» ga tushib, qidirgan ishini qo'lda topishi kerak edi.
      nav(next || "/panel", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("login.kirishda_xatolik"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      {/* Kirish sahifasida sarlavha yo'q - burchaklarda ikkita boshqaruv
          turadi: chapda ortga qaytish, o'ngda rejim tugmasi. */}
      <div className="auth-back">
        <Link to="/">{tx("login.bosh_sahifa")}</Link>
      </div>
      <ThemeToggle className="top-icon theme-float" />
      <div className="auth-card">
        <div className="auth-head">
          <Logo size={46} />
          <h2>{tx("login.hisobingizga_kiring")}</h2>
          <p>{tx("login.teamflow_jamoa_vazifalarini_boshqarish_tizim")}</p>
        </div>

        <ErrorMsg error={error} />

        <div className="auth-box">
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor={`${fid}-0`}>{tx("login.email")}</label>
              {/* `type="email"` emas: brauzer "@" yo'q qiymatni o'zi to'sib qo'yadi va
                  xizmat hisoblari (masalan `admin`) bilan kirib bo'lmasdi. Tekshiruv
                  serverda qoladi - `EmailBackend` baribir emailni topa olmasa rad etadi. */}
              <input id={`${fid}-0`} type="text" inputMode="email" value={email} autoFocus required
                     name="username" autoComplete="username"
                     onChange={(e) => setEmail(e.target.value)} placeholder="siz@example.com" />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-1`}>{tx("common.parol")}</label>
              <PasswordInput id={`${fid}-1`} value={password} required autoComplete="current-password"
                             onChange={setPassword} placeholder="parolingiz" />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? tx("login.tekshirilmoqda") : tx("common.kirish")}
            </button>
          </form>
        </div>

        <div className="auth-alt">
          {tx("login.hisobingiz_yoqmi")} <Link to="/royxatdan-otish">{tx("login.royxatdan_oting")}</Link>
        </div>
      </div>
    </div>
  );
}
