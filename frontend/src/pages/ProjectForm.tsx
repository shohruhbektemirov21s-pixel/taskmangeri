import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import TeamPicker, { sendInvites } from "@/components/TeamPicker";
import type { Pick as TeamPick } from "@/components/TeamPicker";
import type { Project, Workspace } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, ErrorMsg, Loading } from "@/components/ui";

export default function ProjectForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { meta, user } = useAuth();
  const editing = Boolean(id);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Fayllar loyiha yaratilgandan keyin yuklanadi - avval id kerak.
  const [files, setFiles] = useState<File[]>([]);
  const [fileNote, setFileNote] = useState("");
  // Takliflar ham loyiha yaratilgandan keyin yuboriladi.
  const [invites, setInvites] = useState<TeamPick[]>([]);
  const [inviteNote, setInviteNote] = useState("");

  const [f, setF] = useState({
    workspace: "", name: "", description: "",
    status: "ACTIVE", repo_url: "", start_date: "", due_date: "",
    is_public: true, auto_accept: false,
  });

  useEffect(() => {
    void (async () => {
      const ws = listOf<Workspace>(await api.get<any>("/workspaces/", { scope: "mine" }));
      setWorkspaces(ws);
      if (!editing && ws.length) setF((p) => ({ ...p, workspace: String(ws[0].id) }));
      if (editing) {
        const p = await api.get<Project>(`/projects/${id}/`);
        setF({
          workspace: String(p.workspace), name: p.name, description: p.description,
          status: p.status, repo_url: p.repo_url,
          start_date: p.start_date || "", due_date: p.due_date || "",
          is_public: p.is_public, auto_accept: p.auto_accept,
        });
        setLoaded(true);
      }
    })();
  }, [id, editing]);

  function set(k: string, v: unknown) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const body = {
      ...f,
      workspace: Number(f.workspace),
      start_date: f.start_date || null,
      due_date: f.due_date || null,
    };
    try {
      const saved = editing
        ? await api.patch<Project>(`/projects/${id}/`, body)
        : await api.post<Project>("/projects/", body);

      // Loyiha saqlandi. Fayl yuklanmasa ham loyiha yo'qolmasin: xato aytiladi,
      // odam fayllarni "Fayllar" bo'limidan qayta yuklay oladi.
      if (files.length) {
        try {
          await uploadFiles(`/projects/${saved.id}/files/`, files, fileNote);
        } catch {
          setBusy(false);
          setError("Loyiha yaratildi, lekin fayllarni yuklab bolmadi — "
                   + "ularni «Fayllar» bolimidan qayta yuklang.");
          nav(`/loyiha/${saved.id}/fayllar`);
          return;
        }
      }
      // Taklif yuborilmasa ham loyiha qoladi - kim qolib ketganini aytamiz.
      if (invites.length) {
        const failed = await sendInvites(saved.id, invites, inviteNote);
        if (failed.length) {
          setBusy(false);
          setError("Loyiha yaratildi, lekin taklif yuborilmadi: " + failed.join(", ")
                   + " — «Jamoa» bolimidan qayta urinib koring.");
          nav(`/loyiha/${saved.id}/jamoa`);
          return;
        }
      }

      nav(`/loyiha/${saved.id}/brif`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else setError("Saqlashda xatolik");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <div className="content"><Loading /></div>;

  return (
    <>
      <PageHead title={<strong>{editing ? "Loyiha sozlamalari" : "Yangi loyiha"}</strong>} />
      <div className="content">
        <ErrorMsg error={error} />
        {!workspaces.length && (
          <div className="callout warn mb">
            Avval ish maydoni yarating — loyiha ish maydoni ichida joylashadi.{" "}
            <a href="/ish-maydoni/yangi">Ish maydoni yaratish</a>
          </div>
        )}
        <form onSubmit={submit}>
          <div className="split">
            {/* Chap ustun: asosiy maydonlar va boshlang'ich fayllar */}
            <div>
            <Card title="Asosiy maʼlumot">
              <div className="field">
                <label>Ish maydoni</label>
                <select value={f.workspace} onChange={(e) => set("workspace", e.target.value)} required>
                  <option value="">Tanlang</option>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Loyiha nomi</label>
                <input value={f.name} required onChange={(e) => set("name", e.target.value)}
                       placeholder="Masalan: Mobil ilova v2" />
                {errors.name && <div className="err">{errors.name}</div>}
              </div>
              <div className="field">
                <label>Tavsif</label>
                <textarea rows={3} value={f.description}
                          onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Boshlanish sanasi</label>
                  <input type="date" value={f.start_date}
                         max={f.due_date || undefined}
                         onChange={(e) => set("start_date", e.target.value)} />
                  {errors.start_date && <div className="err">{errors.start_date}</div>}
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Tugash sanasi (muddat)</label>
                  {/* min: tugash boshlanishdan oldin bo'lib qolmasin */}
                  <input type="date" value={f.due_date}
                         min={f.start_date || undefined}
                         onChange={(e) => set("due_date", e.target.value)} />
                  {errors.due_date && <div className="err">{errors.due_date}</div>}
                </div>
              </div>
              <div className="help">
                Ikkalasi ham ixtiyoriy, lekin qoyilsa muddat bashorati aniqroq boladi —
                «Muddatlar» bolimi shu sanalarga qarab kechikishni belgilaydi.
              </div>
            </Card>

            {/* Tahrirlashda fayllar alohida «Fayllar» bolimida boshqariladi -
                bu yerda faqat yangi loyiha uchun boshlangich hujjatlar. */}
            {!editing && (
              <Card title="Boshlangich fayllar">
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                  Texnik topshiriq, dizayn, shartnoma — loyiha bilan birga yuklanadi va
                  jamoaga darrov korinadi. Keyin «Fayllar» bolimidan qoshsa ham boladi.
                </p>
                <FilePicker
                  files={files}
                  onChange={setFiles}
                  withDescription
                  description={fileNote}
                  onDescription={setFileNote}
                />
              </Card>
            )}
            </div>

            <div>
              <Card title="Qoshilish va holat">
                <div className="field">
                  <label>Holat</label>
                  <select value={f.status} onChange={(e) => set("status", e.target.value)}>
                    {(meta?.project_status || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <label className="row" style={{ fontWeight: 400 }}>
                  <input type="checkbox" checked={f.is_public} style={{ width: "auto", minHeight: 0 }}
                         onChange={(e) => set("is_public", e.target.checked)} />
                  Ochiq — hamma korib, sorov yubora oladi
                </label>
                <label className="row" style={{ fontWeight: 400, marginTop: 8 }}>
                  <input type="checkbox" checked={f.auto_accept} style={{ width: "auto", minHeight: 0 }}
                         onChange={(e) => set("auto_accept", e.target.checked)} />
                  Sorovlarni avtomatik qabul qilish
                </label>
                <div className="divider" />
                <div className="field">
                  <label>Repozitoriy</label>
                  <input value={f.repo_url} onChange={(e) => set("repo_url", e.target.value)}
                         placeholder="https://github.com/..." />
                </div>
              </Card>

              {/* Tahrirlashda jamoa «Jamoa» bolimida boshqariladi - bu yerda
                  faqat yangi loyihaga chaqiriladigan odamlar. */}
              {!editing && (
                <Card title="Jamoaga taklif">
                  <TeamPicker
                    picks={invites}
                    onChange={setInvites}
                    /* Menejer siz bolasiz - bu royxatdan menejer roli berilmaydi */
                    roles={(meta?.project_role || []).filter((r) => r.value !== "MANAGER")}
                    defaultRole="DEVELOPER"
                    excludeId={user?.id}
                    note={inviteNote}
                    onNote={setInviteNote}
                  />
                </Card>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy || !workspaces.length}>
              {busy ? "Saqlanmoqda..." : editing ? "Saqlash" : "Loyiha yaratish"}
            </button>
            <button type="button" className="btn" onClick={() => nav(-1)}>Bekor qilish</button>
          </div>
        </form>
      </div>
    </>
  );
}
