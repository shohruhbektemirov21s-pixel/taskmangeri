import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { User, UserWork } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import SkillEditor from "@/components/SkillEditor";
import { IconChat } from "@/components/icons";
import Timeline from "@/components/Timeline";
import {
  AvatarViewable, Card, ErrorMsg, Loading, OkMsg, Priority, Stat, StatusBadge, fmtDate,
} from "@/components/ui";

export default function Profile() {
  const { userId } = useParams();
  const { user: me, meta, refreshUser } = useAuth();
  const isSelf = !userId || Number(userId) === me?.id;

  const [target, setTarget] = useState<User | null>(null);
  const [work, setWork] = useState<UserWork | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const u = isSelf ? await api.get<User>("/auth/me/") : await api.get<User>(`/users/${userId}/`);
      setTarget(u);
      setForm({
        full_name: u.full_name, job_title: u.job_title, skills: u.skills,
        bio: u.bio, github_username: u.github_username, telegram: u.telegram,
        seniority: u.seniority, years_experience: String(u.years_experience ?? 0),
      });
      // Loyihalar, vazifalar, statistika va tarix - hammasi bitta endpointdan.
      // Ko'rinish serverda so'rovchining huquqiga qarab cheklanadi.
      setWork(await api.get<UserWork>(`/users/${u.id}/work/`));
    })().catch(() => setError("Profilni ochib bolmadi"));
  }, [userId, isSelf]);

  /** Rasm yuklash yoki almashtirish. Fayl `multipart` bilan boradi. */
  async function uploadPhoto(file: File) {
    setPhotoBusy(true);
    setError(null);
    setSaved(null);
    try {
      const body = new FormData();
      body.append("avatar", file);
      setTarget(await api.post<User>("/auth/me/avatar/", body));
      setSaved("Profil rasmi yangilandi.");
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rasmni yuklab bolmadi");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!window.confirm("Profil rasmi ochirilsinmi?")) return;
    setPhotoBusy(true);
    setError(null);
    setSaved(null);
    try {
      setTarget(await api.delete<User>("/auth/me/avatar/"));
      setSaved("Profil rasmi ochirildi.");
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rasmni ochirib bolmadi");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const u = await api.patch<User>("/auth/me/", form);
      setTarget(u);
      setSaved("Profil yangilandi.");
      setEdit(false);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Saqlashda xatolik");
    } finally {
      setBusy(false);
    }
  }

  if (!target) return <div className="content">{error ? <div className="msg msg-error">{error}</div> : <Loading />}</div>;

  const stats = work?.stats;
  const tasks = work?.tasks || [];

  return (
    <>
      <PageHead
        title={<><span className="muted">profil / </span><strong>{target.full_name}</strong></>}
        actions={
          <>
            {!isSelf && (
              <Link className="btn btn-sm" to={`/xabarlar/${target.id}`}>
                <IconChat size={14} /> Xabar yozish
              </Link>
            )}
            {isSelf && !edit && (
              <button className="btn btn-sm btn-primary" onClick={() => setEdit(true)}>
                Tahrirlash
              </button>
            )}
          </>
        }
      />
      <div className="content">
        <ErrorMsg error={error} />
        <OkMsg text={saved} />

        <div className="split">
          <div>
            <div className="card mb">
              <div className="card-body row wrap">
                <div>
                  {/* Bitta bosish yetadi: rasm to'liq holda ochiladi */}
                  <AvatarViewable user={target} size="xl" />
                  {isSelf && (
                    <div className="avatar-edit" style={{ marginTop: 10 }}>
                      <label className="btn btn-sm" style={{ marginBottom: 0 }}>
                        {target.avatar ? "Almashtirish" : "Rasm qoyish"}
                        <input type="file" accept="image/*" disabled={photoBusy}
                               onChange={(e) => {
                                 const file = e.target.files?.[0];
                                 e.target.value = "";
                                 if (file) void uploadPhoto(file);
                               }} />
                      </label>
                      {target.avatar && (
                        <button type="button" className="btn btn-sm btn-danger"
                                disabled={photoBusy} onClick={() => void removePhoto()}>
                          Ochirish
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0 }}>{target.full_name}</h2>
                  <p className="muted" style={{ margin: "4px 0" }}>{target.job_title}</p>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="badge">{target.seniority_display}</span>
                    <span className="badge">{target.years_experience} yil tajriba</span>
                    <span className="badge badge-info">{target.global_role_display}</span>
                  </div>
                  {target.bio && <p className="pre-wrap" style={{ marginTop: 10 }}>{target.bio}</p>}
                  <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                    {target.skill_list.map((s) => <span className="chip" key={s}>{s}</span>)}
                    {!target.skill_list.length && isSelf && !edit && (
                      <button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>
                        Konikma qoshish
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {edit && (
              <Card title="Profilni tahrirlash">
                <form onSubmit={save}>
                  {[
                    ["full_name", "F.I.Sh.", "text"],
                    ["job_title", "Lavozim", "text"],
                    ["github_username", "GitHub username", "text"],
                    ["telegram", "Telegram", "text"],
                  ].map(([k, label]) => (
                    <div className="field" key={k}>
                      <label>{label}</label>
                      <input value={form[k] || ""}
                             onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    </div>
                  ))}
                  <div className="field">
                    <label>Konikmalar</label>
                    <SkillEditor
                      value={form.skills || ""}
                      onChange={(v) => setForm({ ...form, skills: v })}
                      suggestions={target.suggested_skills || []}
                    />
                  </div>

                  <div className="row">
                    <div className="field" style={{ flex: 1 }}>
                      <label>Daraja</label>
                      <select value={form.seniority || ""}
                              onChange={(e) => setForm({ ...form, seniority: e.target.value })}>
                        {(meta?.seniority || []).map((s) => (
                          <option key={s.value} value={String(s.value)}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ width: 140 }}>
                      <label>Tajriba (yil)</label>
                      <input type="number" min={0} max={60} value={form.years_experience || "0"}
                             onChange={(e) => setForm({ ...form, years_experience: e.target.value })} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Qisqacha maʼlumot</label>
                    <textarea rows={3} value={form.bio || ""}
                              onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-primary" disabled={busy}>
                      {busy ? "Saqlanmoqda..." : "Saqlash"}
                    </button>
                    <button type="button" className="btn" onClick={() => setEdit(false)}>
                      Bekor qilish
                    </button>
                  </div>
                </form>
              </Card>
            )}

            <Card title={isSelf ? "Songgi vazifalarim" : "Songgi vazifalari"} padded={false}
                  badge={<span className="badge">{tasks.length}</span>}>
              <table className="table">
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="mono muted nowrap">{t.code}</td>
                      <td>
                        <Link to={`/vazifa/${t.id}`}>{t.title}</Link>
                        <br /><small className="muted">{t.project_name}</small>
                      </td>
                      <td><StatusBadge task={t} /></td>
                      <td><Priority task={t} /></td>
                    </tr>
                  ))}
                  {!tasks.length && <tr><td className="muted center">Vazifa yoq</td></tr>}
                </tbody>
              </table>
            </Card>

            <Card title={isSelf ? "Nima qilganman" : "Nima qilgan"} padded={false}
                  badge={<span className="badge">{(work?.activity || []).length}</span>}>
              {work?.activity?.length
                ? <div className="card-body"><Timeline items={work.activity} /></div>
                : <div className="empty">Hozircha yozuv yo'q</div>}
            </Card>

          </div>

          <div>
            <div className="grid grid-2 mb">
              <Stat value={stats?.open ?? 0} label="Ochiq vazifa" tone="accent" />
              <Stat value={stats?.done ?? 0} label="Bajarilgan" tone="ok" />
              <Stat value={stats?.in_review ?? 0} label="Tekshiruvda" tone="done" />
              <Stat value={stats?.hours ?? 0} label="Sarflangan soat" tone="warn" />
            </div>

            {!!work?.projects?.length && (
              <Card title={isSelf ? "Loyihalarim" : "Loyihalari"} padded={false}
                    badge={<span className="badge">{work.projects.length}</span>}>
                <div className="card-list">
                  {work.projects.map((p) => (
                    <div className="card-body tight row" key={p.id}>
                      <span className="lang-dot" style={{ background: p.color }} />
                      <div style={{ minWidth: 0 }}>
                        <Link to={`/loyiha/${p.id}`}>{p.name}</Link>
                        <br /><small className="muted">{p.workspace_name}</small>
                      </div>
                      <span className="spacer" />
                      {p.role && <span className="badge">{p.role}</span>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card title="Aloqa">
              <ul className="list-plain" style={{ fontSize: 13 }}>
                <li><span className="muted">Email:</span> {target.email}</li>
                {target.github_username && (
                  <li>
                    <span className="muted">GitHub:</span>{" "}
                    <a href={`https://github.com/${target.github_username}`}
                       target="_blank" rel="noreferrer">{target.github_username}</a>
                  </li>
                )}
                {target.telegram && <li><span className="muted">Telegram:</span> {target.telegram}</li>}
                <li><span className="muted">Royxatdan otgan:</span> {fmtDate(target.date_joined)}</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
