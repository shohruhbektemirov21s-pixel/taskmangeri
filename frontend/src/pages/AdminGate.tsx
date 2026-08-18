/**
 * `/admin` uchun qorovul.
 *
 * NEGA JIM QAYTARISH EMAS. Ilgari bu yerda `<Navigate to="/panel">`
 * turardi: dasturchi `/admin` deb yozsa, sahifa hech nima demay bosh
 * panelga otib yuborardi. Odam «manzil noto'g'rimi yoki huquq yo'qmi?»
 * degan savol bilan qolardi — ayniqsa bitta brauzerda ikkita hisob
 * bo'lganda (o'z hisobi va admin hisobi).
 *
 * Endi ochiq aytiladi va SHU YERDA boshqa hisob bilan kirish mumkin —
 * Django admin ham shunday ishlaydi. Kirgandan keyin panel o'zi ochiladi:
 * `login()` kontekstdagi foydalanuvchini yangilaydi, qorovul esa qayta
 * hisoblanadi.
 *
 * XAVFSIZLIK O'ZGARMADI. Bu faqat KIRISH yo'li. Panelning o'zi baribir
 * `is_platform_admin` bo'lmasa chizilmaydi, serverdagi har bir amal esa
 * `IsPlatformAdmin` bilan yopiq — ya'ni oynani ochish hech kimga qo'shimcha
 * huquq bermaydi.
 */
import { useId, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { ErrorMsg, Loading, PasswordInput } from "@/components/ui";

export default function AdminGate() {
  const fid = useId();
  const { user, loading, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  // Huquqi bor - panel odatdagi qobiq ichida ochiladi.
  if (user?.is_platform_admin) return <Outlet />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      // Muvaffaqiyatda komponent qayta chiziladi va `user` yangilanadi.
      // Agar kirgan hisob admin bo'lmasa - pastdagi ogohlantirish chiqadi.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kirishda xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-back">
        <Link to="/panel">← Ilovaga qaytish</Link>
      </div>
      <ThemeToggle className="top-icon theme-float" />

      <div className="auth-card">
        <div className="auth-head">
          <Logo size={46} />
          <h2>Admin panel</h2>
          <p>Bu bo'lim tizim adminiga — hisoblar, rollar va parollar</p>
        </div>

        {/* Kirgan, lekin huquqi yo'q: sabab aytiladi va boshqa hisob bilan
            kirish taklif qilinadi. Ilgari bu holat umuman ko'rsatilmasdi. */}
        {user && (
          <div className="callout mb">
            <strong>{user.full_name}</strong> hisobida tizim admini huquqi yo'q
            ({user.global_role_display}).{" "}
            <button type="button" className="btn btn-sm" onClick={logout}>
              Chiqish
            </button>
          </div>
        )}

        <ErrorMsg error={error} />

        <div className="auth-box">
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor={`${fid}-0`}>Login</label>
              {/* `type="email"` emas: xizmat hisoblari (masalan `admin`)
                  va familiya ko'rinishidagi loginlar ham kiritilsin. */}
              <input id={`${fid}-0`} type="text" value={email} autoFocus required
                     name="username" autoComplete="username"
                     onChange={(e) => setEmail(e.target.value)}
                     placeholder="admin" />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-1`}>Parol</label>
              {/* `PasswordInput` qiymatning O'ZINI beradi, hodisani emas. */}
              <PasswordInput id={`${fid}-1`} value={password} required
                             autoComplete="current-password"
                             onChange={setPassword} />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Tekshirilmoqda..." : "Kirish"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
