/**
 * Admin panel — `/admin`.
 *
 * NEGA DJANGO ADMIN EMAS. `/django-admin/` joyida qoladi va u yerda hamma
 * jadval bor — lekin u jadvallar tilida gapiradi (`ProjectMember`,
 * `TaskAssignment`) va o'zbekcha emas. Bu sahifa esa kundalik uchta ishni
 * qiladi: hisob ochish, rol berish, parol tiklash. Uchovi ham eng ko'p
 * kerak bo'ladigan amallar — qolgani uchun Django admin bor.
 *
 * KO'RINISH ilovaning qolgan qismidan farq qilmaydi: o'sha shisha
 * kartalar, o'sha ranglar. Admin panel «boshqa dastur» bo'lib qolmasin.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Project, User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  Avatar, Card, Empty, ErrorMsg, Loading, confirmDelete, fmtDate,
} from "@/components/ui";
import { toProject, toUser } from "@/nav";

type Tab = "users" | "projects";

const ROLE_TONE: Record<string, string> = {
  ADMIN: "badge-danger", MANAGER: "badge-info", DEVELOPER: "", QA: "",
};

/** Yangi hisob formasi — bo'sh holati bir joyda tursin. */
const EMPTY_FORM = {
  email: "", full_name: "", password: "",
  global_role: "DEVELOPER", specialty: "", seniority: "JUNIOR", job_title: "",
};

export default function Admin() {
  const { user: me, meta } = useAuth();
  const [tab, setTab] = useState<Tab>("users");

  // Ro'yxat filtrlari
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const { data: userData, loading, reload } = useFetch<any>(
    tab === "users" ? "/users/" : null,
    { search: q, role, inactive: showInactive ? "1" : "", page_size: 200 },
    { debounceMs: 300 },
  );
  const users = useMemo(() => (userData ? listOf<User>(userData) : null), [userData]);

  const { data: projectData, reload: reloadProjects } = useFetch<any>(
    tab === "projects" ? "/projects/" : null, { scope: "all", page_size: 200 });
  const projects = useMemo(
    () => (projectData ? listOf<Project>(projectData) : null), [projectData]);

  function done(message: string) {
    setError(null);
    setOkMsg(message);
    reload();
    reloadProjects();
  }

  function failed(err: unknown, fallback: string) {
    setOkMsg(null);
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/users/create/", form);
      done(`«${form.full_name}» uchun hisob ochildi. Login: ${form.email}`);
      setForm(EMPTY_FORM);
      setCreating(false);
    } catch (err) {
      failed(err, "Hisob ochib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(target: User, body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api.patch(`/users/${target.id}/role/`, body);
      done(message);
    } catch (err) {
      failed(err, "O'zgartirib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(target: User) {
    const next = window.prompt(
      `«${target.full_name}» uchun yangi parol (kamida 8 belgi):`, "");
    if (next === null) return;
    setBusy(true);
    try {
      await api.post(`/users/${target.id}/set-password/`, { password: next });
      done(`«${target.full_name}» paroli almashtirildi. Yangi parolni unga o'zingiz ayting.`);
    } catch (err) {
      failed(err, "Parolni almashtirib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(target: User) {
    if (target.is_active && !(await confirmDelete(`${target.full_name} hisobini o'chirish`))) return;
    await patchUser(target, { is_active: !target.is_active },
                    target.is_active
                      ? `«${target.full_name}» hisobi o'chirildi.`
                      : `«${target.full_name}» hisobi qayta yoqildi.`);
  }

  const counts = {
    users: users?.length ?? 0,
    admins: users?.filter((u) => u.global_role === "ADMIN").length ?? 0,
    projects: projects?.length ?? 0,
  };

  return (
    <>
      <PageHead
        title={<strong>Admin panel</strong>}
        subtitle="Hisoblar, rollar va loyihalar — bir joyda"
        actions={
          <a className="btn btn-sm" href="/django-admin/" target="_blank" rel="noreferrer">
            Django admin
          </a>
        }
        tabs={[
          ["users", `Foydalanuvchilar${counts.users ? ` (${counts.users})` : ""}`],
          ["projects", `Loyihalar${counts.projects ? ` (${counts.projects})` : ""}`],
        ].map(([value, label]) => (
          <button key={value} type="button"
                  className={`tab ${tab === value ? "active" : ""}`}
                  onClick={() => setTab(value as Tab)}>{label}</button>
        ))}
      />

      <div className="content">
        <ErrorMsg error={error} />
        {okMsg && <div className="callout mb">{okMsg}</div>}

        {tab === "users" ? (
          <>
            <div className="filters">
              <div className="f grow">
                <label htmlFor="adm-q">Qidiruv</label>
                <input id="adm-q" value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder="Ism, login yoki lavozim boyicha" />
              </div>
              <div className="f">
                <label htmlFor="adm-role">Rol</label>
                <select id="adm-role" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">Hammasi</option>
                  {(meta?.global_role || []).map((r) => (
                    <option key={String(r.value)} value={String(r.value)}>{r.label}</option>
                  ))}
                </select>
              </div>
              <label className="cal-check" title="O'chirilgan hisoblarni ko'rsatish">
                <input type="checkbox" checked={showInactive}
                       onChange={() => setShowInactive((v) => !v)} />
                O'chirilganlar
              </label>
              <button type="button" className="btn btn-primary"
                      onClick={() => { setCreating((v) => !v); setOkMsg(null); }}>
                {creating ? "Bekor qilish" : "Yangi hisob"}
              </button>
            </div>

            {creating && (
              <Card title="Yangi hisob">
                <form onSubmit={createUser}>
                  <div className="row wrap" style={{ gap: 12 }}>
                    <div className="field" style={{ flex: "1 1 220px" }}>
                      <label htmlFor="nu-name">F.I.Sh.</label>
                      <input id="nu-name" required value={form.full_name}
                             onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                             placeholder="Abdraxmanov Toxir Toxtasinovich" />
                    </div>
                    <div className="field" style={{ flex: "1 1 180px" }}>
                      <label htmlFor="nu-login">Login</label>
                      <input id="nu-login" required value={form.email}
                             onChange={(e) => setForm({ ...form, email: e.target.value })}
                             placeholder="Abdraxmanov" />
                    </div>
                    <div className="field" style={{ flex: "1 1 180px" }}>
                      <label htmlFor="nu-pass">Parol</label>
                      <input id="nu-pass" required minLength={8} value={form.password}
                             onChange={(e) => setForm({ ...form, password: e.target.value })}
                             placeholder="Kamida 8 belgi" />
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 12 }}>
                    <div className="field" style={{ flex: "1 1 160px" }}>
                      <label htmlFor="nu-role">Rol</label>
                      <select id="nu-role" value={form.global_role}
                              onChange={(e) => setForm({ ...form, global_role: e.target.value })}>
                        {(meta?.global_role || []).map((r) => (
                          <option key={String(r.value)} value={String(r.value)}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ flex: "1 1 200px" }}>
                      <label htmlFor="nu-spec">Mutaxassislik</label>
                      <select id="nu-spec" value={form.specialty}
                              onChange={(e) => setForm({ ...form, specialty: e.target.value })}>
                        <option value="">Tanlanmagan</option>
                        {(meta?.specialties || []).map((s: any) => (
                          <option key={String(s.value)} value={String(s.value)}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ flex: "1 1 160px" }}>
                      <label htmlFor="nu-sen">Daraja</label>
                      <select id="nu-sen" value={form.seniority}
                              onChange={(e) => setForm({ ...form, seniority: e.target.value })}>
                        {(meta?.seniority || []).map((s) => (
                          <option key={String(s.value)} value={String(s.value)}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* Parol ochiq ko'rinadi - admin uni egasiga aytishi kerak,
                      shuning uchun yashirishning ma'nosi yo'q. */}
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    Parolni hisob egasiga o'zingiz yetkazasiz — tizim uni hech qayerga
                    yubormaydi va keyin ko'rsatmaydi.
                  </p>
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? "Ochilmoqda..." : "Hisob ochish"}
                  </button>
                </form>
              </Card>
            )}

            {loading ? <Loading /> : !users?.length ? (
              <Card><Empty title="Hech kim topilmadi"
                           text="Qidiruvni yoki filtrni o'zgartiring." /></Card>
            ) : (
              <Card padded={false} badge={<span className="badge">{counts.admins} admin</span>}
                    title="Hisoblar">
                <div className="table-wrap"><table className="table">
                  <thead>
                    <tr>
                      <th>Odam</th>
                      <th>Login</th>
                      <th>Rol</th>
                      <th className="right">Loyiha</th>
                      <th className="right">Ochiq ish</th>
                      <th>Qo'shilgan</th>
                      <th className="right">Amallar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className={u.is_active ? "" : "muted"}>
                        <td>
                          <div className="row">
                            <Avatar user={u} size="sm" />
                            <div style={{ minWidth: 0 }}>
                              <Link {...toUser(u.id)}>{u.full_name}</Link>
                              {!u.is_active && <span className="badge"> o'chirilgan</span>}
                              <br />
                              <small className="muted">{u.specialty_display || "—"}</small>
                            </div>
                          </div>
                        </td>
                        <td className="mono">{u.email}</td>
                        <td>
                          {/* Rolni shu yerdan almashtirish - alohida sahifaga
                              o'tmasdan. Serverda uchta himoya bor: oxirgi
                              adminni, bosh hisobni va o'zini tushirib
                              bo'lmaydi. */}
                          <select className="admin-role"
                                  value={u.global_role} disabled={busy || u.id === me?.id}
                                  title={u.id === me?.id
                                    ? "O'z rolingizni o'zingiz o'zgartira olmaysiz"
                                    : undefined}
                                  onChange={(e) => void patchUser(
                                    u, { global_role: e.target.value },
                                    `«${u.full_name}» roli o'zgartirildi.`)}>
                            {(meta?.global_role || []).map((r) => (
                              <option key={String(r.value)} value={String(r.value)}>{r.label}</option>
                            ))}
                          </select>
                          {u.is_platform_admin && (
                            <span className={`badge ${ROLE_TONE.ADMIN}`}> admin</span>
                          )}
                        </td>
                        <td className="right">{(u as any).project_count ?? 0}</td>
                        <td className="right">{(u as any).open_tasks ?? 0}</td>
                        <td className="nowrap muted">{fmtDate(u.date_joined)}</td>
                        <td className="right nowrap">
                          <button type="button" className="btn btn-sm" disabled={busy}
                                  onClick={() => void resetPassword(u)}>Parol</button>{" "}
                          <button type="button" className="btn btn-sm" disabled={busy || u.id === me?.id}
                                  onClick={() => void toggleActive(u)}>
                            {u.is_active ? "O'chirish" : "Yoqish"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </Card>
            )}
          </>
        ) : (
          <Card padded={false} title="Barcha loyihalar">
            {!projects?.length ? (
              <Empty title="Loyiha yo'q" text="Hali birorta loyiha ochilmagan." />
            ) : (
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>Loyiha</th>
                    <th>Ish maydoni</th>
                    <th>Menejer</th>
                    <th className="right">A'zo</th>
                    <th className="right">Ochiq ish</th>
                    <th className="right">Jarayon</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="lang-dot" style={{ background: p.color }} />{" "}
                        <Link {...toProject(p.id)}>{p.name}</Link>{" "}
                        <span className="badge mono">{p.key}</span>
                      </td>
                      <td className="muted">{p.workspace_name}</td>
                      <td>{p.manager?.full_name || "—"}</td>
                      <td className="right">{p.member_count}</td>
                      <td className="right">{p.open_tasks}</td>
                      <td className="right">{p.progress}%</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
