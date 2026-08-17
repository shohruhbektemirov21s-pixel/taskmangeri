import { useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import TeamPicker, { addPickedMembers, createPickedTasks, taskCount }
  from "@/components/TeamPicker";
import type { Pick as TeamPick } from "@/components/TeamPicker";
import type { Access, Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, confirmDelete, DateField, ErrorMsg, Loading } from "@/components/ui";

export default function ProjectForm() {
  const fid = useId();
  const { id } = useParams();
  const nav = useNavigate();
  const { meta, user } = useAuth();
  const editing = Boolean(id);

  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Fayllar loyiha yaratilgandan keyin yuklanadi - avval id kerak.
  const [files, setFiles] = useState<File[]>([]);
  const [fileNote, setFileNote] = useState("");
  // Jamoa ham loyiha yaratilgandan keyin qo'shiladi - avval id kerak.
  const [team, setTeam] = useState<TeamPick[]>([]);
  // Tahrirlashda loyihaning ruxsatlari kerak: o'chirish faqat menejer va adminda.
  const [acc, setAcc] = useState<Access | null>(null);

  const [f, setF] = useState({
    name: "", description: "",
    status: "ACTIVE", start_date: "", due_date: "",
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (editing) {
        const p = await api.get<Project>(`/projects/${id}/`);
        if (!alive) return;
        setAcc(p.access);
        setF({
          name: p.name, description: p.description,
          status: p.status,
          start_date: p.start_date || "", due_date: p.due_date || "",
        });
        setLoaded(true);
      }
    })().catch((e) => {
      // Xato ushlanmasa sahifa abadiy "Yuklanmoqda" da qolardi.
      if (alive) setError(e instanceof ApiError ? e.message : "Loyihani ochib bo'lmadi.");
    });
    return () => { alive = false; };
  }, [id, editing]);

  function set(k: string, v: unknown) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    // Ish maydoni yuborilmaydi - server o'zi tanlaydi (`resolve_workspace`).
    const body = {
      ...f,
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
      // A'zo yoki vazifa o'tmasa ham loyiha qoladi - nima qolib ketganini
      // aytamiz. Vazifa a'zolikka bog'liq emas: odam qo'shilmasa ham
      // yozib qo'yilgan ish doskaga tushaveradi.
      const tasks = taskCount(team);
      if (team.length) {
        const failedMembers = await addPickedMembers(saved.id, team);
        const { failedTasks, failedFiles } = tasks
          ? await createPickedTasks(saved.id, team)
          : { failedTasks: [], failedFiles: [] };
        if (failedMembers.length || failedTasks.length || failedFiles.length) {
          const parts = [];
          if (failedMembers.length) parts.push("jamoaga qo'shilmadi: " + failedMembers.join(", "));
          if (failedTasks.length) parts.push("vazifa yaratilmadi: " + failedTasks.join(", "));
          if (failedFiles.length) {
            parts.push("fayllari biriktirilmadi: " + failedFiles.join(", ")
                       + " (vazifaning ozi yaratildi)");
          }
          setBusy(false);
          setError("Loyiha yaratildi, lekin " + parts.join("; ")
                   + " — «Jamoa» va «Doska» bolimidan qayta urinib koring.");
          nav(`/loyiha/${saved.id}/${failedMembers.length ? "jamoa" : "doska"}`);
          return;
        }
      }

      // Vazifa yozilgan bolsa darrov doskani ochamiz - odam ishlar joyiga
      // tushganini oz kozi bilan korsin.
      nav(`/loyiha/${saved.id}/${tasks ? "doska" : "brif"}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else setError("Saqlashda xatolik");
    } finally {
      setBusy(false);
    }
  }

  /** Loyihani butunlay o'chirish. */
  async function removeProject() {
    if (!confirmDelete(f.name)) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/projects/${id}/`);
      nav("/loyihalar");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Loyihani ochirib bolmadi");
      setBusy(false);
    }
  }

  if (!loaded) return <div className="content"><Loading /></div>;

  return (
    <>
      <PageHead title={<strong>{editing ? "Loyiha sozlamalari" : "Yangi loyiha"}</strong>} />
      <div className="content">
        <ErrorMsg error={error} />
        <form onSubmit={submit}>
          <div className="split">
            {/* Chap ustun: asosiy maydonlar va boshlang'ich fayllar */}
            <div>
            <Card title="Asosiy maʼlumot">
              <div className="field">
                <label htmlFor={`${fid}-0`}>Loyiha nomi</label>
                <input id={`${fid}-0`} value={f.name} required onChange={(e) => set("name", e.target.value)}
                       placeholder="Masalan: Mobil ilova v2" />
                {errors.name && <div className="err">{errors.name}</div>}
              </div>
              <div className="field">
                <label htmlFor={`${fid}-1`}>Tavsif</label>
                <textarea id={`${fid}-1`} rows={3} value={f.description}
                          onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${fid}-2`}>Boshlanish sanasi</label>
                  <DateField id={`${fid}-2`} value={f.start_date}
                             max={f.due_date || undefined}
                             onChange={(v) => set("start_date", v)} />
                  {errors.start_date && <div className="err">{errors.start_date}</div>}
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${fid}-4`}>Tugash sanasi (muddat)</label>
                  {/* min: tugash boshlanishdan oldin bo'lib qolmasin */}
                  <DateField id={`${fid}-4`} value={f.due_date}
                             min={f.start_date || undefined}
                             onChange={(v) => set("due_date", v)} />
                  {errors.due_date && <div className="err">{errors.due_date}</div>}
                </div>
              </div>
            </Card>

            {/* Tahrirlashda fayllar alohida «Fayllar» bolimida boshqariladi -
                bu yerda faqat yangi loyiha uchun boshlangich hujjatlar. */}
            {!editing && (
              <Card title="Boshlangich fayllar">
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
              {/* Kim korishi, avtomatik qabul va repozitoriy formadan olib
                  tashlandi - bu yerda faqat holat qoladi. Loyiha ochiq bo'lib
                  yaratiladi (modeldagi standart), repozitoriy esa keyin
                  qo'shiladi. */}
              <Card title="Holat">
                {/* Kartada bitta maydon qoldi - pastdagi ortiqcha bo'shliq olindi */}
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`${fid}-3`}>Loyiha holati</label>
                  <select id={`${fid}-3`} value={f.status} onChange={(e) => set("status", e.target.value)}>
                    {(meta?.project_status || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </Card>

              {/* O'chirish - faqat loyiha menejeri va admin uchun (serverda ham
                  shunday tekshiriladi). */}
              {editing && (acc?.is_manager || acc?.is_admin) && (
                <Card title="Loyihani ochirish">
                  <button type="button" className="btn btn-danger btn-block" disabled={busy}
                          onClick={() => void removeProject()}>
                    Loyihani butunlay ochirish
                  </button>
                </Card>
              )}

              {/* Tahrirlashda jamoa «Jamoa» bolimida boshqariladi - bu yerda
                  faqat yangi loyihaga qoshiladigan odamlar. */}
              {!editing && (
                <Card title="Jamoa va vazifalar">
                  <TeamPicker
                    picks={team}
                    onChange={setTeam}
                    /* Menejer siz bolasiz - bu royxatdan menejer roli berilmaydi */
                    roles={(meta?.project_role || []).filter((r) => r.value !== "MANAGER")}
                    priorities={meta?.task_priority || []}
                    defaultRole="DEVELOPER"
                    excludeId={user?.id}
                  />
                </Card>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saqlanmoqda..." : editing ? "Saqlash" : "Loyiha yaratish"}
            </button>
            <button type="button" className="btn" onClick={() => nav(-1)}>Bekor qilish</button>
          </div>
        </form>
      </div>
    </>
  );
}
