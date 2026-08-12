import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Project, Task, User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  Avatar, Card, ErrorMsg, Loading, OkMsg, Priority, Stat, StatusBadge, fmtDate,
} from "@/components/ui";

export default function Profile() {
  const { userId } = useParams();
  const { user: me, meta, refreshUser } = useAuth();
  const isSelf = !userId || Number(userId) === me?.id;

  const [target, setTarget] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const u = isSelf ? await api.get<User>("/auth/me/") : await api.get<User>(`/users/${userId}/`);
      setTarget(u);
      setForm({
        full_name: u.full_name, job_title: u.job_title, skills: u.skills,
        bio: u.bio, github_username: u.github_username, telegram: u.telegram,
        seniority: u.seniority, years_experience: String(u.years_experience ?? 0),
      });
      if (isSelf) {
        setProjects(listOf<Project>(await api.get<any>("/projects/", { scope: "mine" })));
        setTasks(listOf<Task>(await api.get<any>("/tasks/", { assignee: "me", page_size: 10 })));
      } else {
        setTasks(listOf<Task>(await api.get<any>("/tasks/", { assignee: userId, page_size: 10 })));
      }
    })().catch(() => setError("Profilni ochib bolmadi"));
  }, [userId, isSelf]);

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

  const spec = meta?.specialties?.find((s) => s.value === target.specialty);
  const done = tasks.filter((t) => t.status === "DONE").length;
  const open = tasks.filter((t) => !["DONE", "CANCELLED"].includes(t.status)).length;

  return (
    <>
      <PageHead
        title={<><span className="muted">profil / </span><strong>{target.full_name}</strong></>}
        actions={isSelf && !edit && (
          <button className="btn btn-sm btn-primary" onClick={() => setEdit(true)}>Tahrirlash</button>
        )}
      />
      <div className="content">
        <ErrorMsg error={error} />
        <OkMsg text={saved} />

        <div className="split">
          <div>
            <div className="card mb">
              <div className="card-body row wrap">
                <Avatar user={target} size="xl" />
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0 }}>{target.full_name}</h2>
                  <p className="muted" style={{ margin: "4px 0" }}>{target.job_title}</p>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="badge" style={{ color: target.specialty_color }}>
                      <span className="mono">{target.specialty_icon}</span> {target.specialty_display}
                    </span>
                    <span className="badge">{target.seniority_display}</span>
                    <span className="badge">{target.years_experience} yil tajriba</span>
                    <span className="badge badge-info">{target.global_role_display}</span>
                  </div>
                  {target.bio && <p className="pre-wrap" style={{ marginTop: 10 }}>{target.bio}</p>}
                  <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                    {target.skill_list.map((s) => <span className="chip" key={s}>{s}</span>)}
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
                    ["skills", "Konikmalar (vergul bilan)", "text"],
                    ["github_username", "GitHub username", "text"],
                    ["telegram", "Telegram", "text"],
                  ].map(([k, label]) => (
                    <div className="field" key={k}>
                      <label>{label}</label>
                      <input value={form[k] || ""}
                             onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    </div>
                  ))}
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

            <Card title="Songgi vazifalar" padded={false}>
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
          </div>

          <div>
            <div className="grid grid-2 mb">
              <Stat value={open} label="Ochiq vazifa" tone="accent" />
              <Stat value={done} label="Bajarilgan" tone="ok" />
            </div>

            {spec && (
              <Card title="Mutaxassislik xususiyatlari">
                <p className="muted" style={{ fontSize: 13 }}>{spec.focus}</p>
                <div className="divider" />
                <strong style={{ fontSize: 13 }}>Sifat royxati</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                  {spec.checklist.map((c) => <li key={c}>{c}</li>)}
                </ul>
                <div className="divider" />
                <strong style={{ fontSize: 13 }}>Tavsiya etilgan vazifa turlari</strong>
                <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
                  {spec.task_types.map((t) => <span className="badge" key={t}>{t}</span>)}
                </div>
              </Card>
            )}

            {isSelf && projects.length > 0 && (
              <Card title="Loyihalarim" padded={false}>
                <div className="card-list">
                  {projects.map((p) => (
                    <div className="card-body tight row" key={p.id}>
                      <span className="lang-dot" style={{ background: p.color }} />
                      <Link to={`/loyiha/${p.id}`}>{p.name}</Link>
                      <span className="spacer" />
                      <span className="badge">{p.access.role_label}</span>
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
