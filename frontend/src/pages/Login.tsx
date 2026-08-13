import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { ErrorMsg, PasswordInput } from "@/components/ui";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
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
      nav("/panel");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kirishda xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      {/* Kirish sahifasida sarlavha yo'q - rejim tugmasi burchakda turadi */}
      <ThemeToggle className="top-icon theme-float" />
      <div className="auth-card">
        <div className="center mb">
          <Logo size={46} />
          <h2 style={{ fontWeight: 300, marginTop: 14 }}>TeamFlow hisobiga kirish</h2>
        </div>

        <ErrorMsg error={error} />

        <div className="auth-box">
          <form onSubmit={submit}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} autoFocus required
                     onChange={(e) => setEmail(e.target.value)} placeholder="siz@example.com" />
            </div>
            <div className="field">
              <label>Parol</label>
              <PasswordInput value={password} required autoComplete="current-password"
                             onChange={setPassword} placeholder="parolingiz" />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Tekshirilmoqda..." : "Kirish"}
            </button>
          </form>
        </div>

        <div className="auth-alt">
          Hisobingiz yoqmi? <Link to="/royxatdan-otish">Royxatdan oting</Link>
        </div>
        <div className="center mt">
          <Link className="muted" style={{ fontSize: 12 }} to="/">← Bosh sahifa</Link>
        </div>
      </div>
    </div>
  );
}
