import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { ErrorMsg, PasswordInput } from "@/components/ui";
import { tx } from "@/i18n";

interface SpecialtyItem {
  value: string;
  label: string;
  icon: string;
  color: string;
  skills: string[];
  focus: string;
}

export default function Register() {
  const fid = useId();
  const { register } = useAuth();
  const nav = useNavigate();

  const [specialties, setSpecialties] = useState<SpecialtyItem[]>([]);
  const [form, setForm] = useState({
    full_name: "", email: "", specialty: "", password: "", password_confirm: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.get<{ specialties: SpecialtyItem[] }>("/auth/specialties/");
        setSpecialties(data.specialties);
      } catch {
        setError(tx("register.mutaxassisliklar_royxatini_yuklab_bolmadi"));
      }
    })();
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      await register(form);
      nav("/qoshilish");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else setError(tx("register.royxatdan_otishda_xatolik"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      {/* Sarlavha yo'q - burchaklarda ikkita boshqaruv turadi: chapda
          ortga qaytish, o'ngda rejim tugmasi. */}
      <div className="auth-back">
        <Link to="/">{tx("register.bosh_sahifa")}</Link>
      </div>
      <ThemeToggle className="top-icon theme-float" />
      <div className="auth-card">
        <div className="auth-head">
          <Logo size={46} />
          <h2>{tx("register.hisob_yarating")}</h2>
          <p>{tx("register.mutaxassisligingizga_mos_vazifalar_shu_boyic")}</p>
        </div>

        <ErrorMsg error={error} />

        <div className="auth-box">
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor={`${fid}-0`}>{tx("common.f_i_sh")}</label>
              <input id={`${fid}-0`} value={form.full_name} required autoFocus
                     name="name" autoComplete="name"
                     onChange={(e) => set("full_name", e.target.value)}
                     placeholder={tx("register.ism_familiya")} />
              {errors.full_name && <div className="err">{errors.full_name}</div>}
            </div>

            <div className="field">
              <label htmlFor={`${fid}-1`}>{tx("register.email")}</label>
              <input id={`${fid}-1`} type="email" value={form.email} required
                     name="email" autoComplete="email"
                     onChange={(e) => set("email", e.target.value)}
                     placeholder="siz@example.com" />
              {errors.email && <div className="err">{errors.email}</div>}
            </div>

            <div className="field">
              <label htmlFor={`${fid}-2`}>{tx("common.mutaxassislik")}</label>
              <select id={`${fid}-2`} value={form.specialty} required
                      onChange={(e) => set("specialty", e.target.value)}>
                <option value="">{tx("register.tanlang")}</option>
                {specialties.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {errors.specialty && <div className="err">{errors.specialty}</div>}
            </div>

            <div className="field">
              <label htmlFor={`${fid}-3`}>{tx("common.parol")}</label>
              <PasswordInput id={`${fid}-3`} value={form.password} required autoComplete="new-password"
                             onChange={(v) => set("password", v)}
                             placeholder={tx("register.kamida_8_belgi")} />
              {errors.password && <div className="err">{errors.password}</div>}
            </div>

            <div className="field">
              <label htmlFor={`${fid}-4`}>{tx("register.parolni_tasdiqlang")}</label>
              <PasswordInput id={`${fid}-4`} value={form.password_confirm} required autoComplete="new-password"
                             onChange={(v) => set("password_confirm", v)}
                             placeholder="parolni qayta yozing" />
              {errors.password_confirm && <div className="err">{errors.password_confirm}</div>}
            </div>

            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? tx("common.yaratilmoqda") : tx("register.akkaunt_yaratish")}
            </button>
          </form>
        </div>

        <div className="auth-alt">
          {tx("register.akkauntingiz_bormi")} <Link to="/kirish">{tx("common.kirish")}</Link>
        </div>
      </div>
    </div>
  );
}
