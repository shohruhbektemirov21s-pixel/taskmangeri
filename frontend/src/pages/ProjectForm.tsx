import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import TeamPicker, { createPickedTasks, sendInvites, taskCount }
  from "@/components/TeamPicker";
import type { Pick as TeamPick } from "@/components/TeamPicker";
import type { Access, Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, ErrorMsg, Loading } from "@/components/ui";

export default function ProjectForm() {
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
  // Takliflar ham loyiha yaratilgandan keyin yuboriladi.
  const [invites, setInvites] = useState<TeamPick[]>([]);
  // Tahrirlashda loyihaning ruxsatlari kerak: o'chirish faqat menejer va adminda.
  const [acc, setAcc] = useState<Access | null>(null);

  const [f, setF] = useState({
    name: "", description: "",
    status: "ACTIVE", start_date: "", due_date: "",
  });

  useEffect(() => {
    void (async () => {
      if (editing) {
        const p = await api.get<Project>(`/projects/${id}/`);
        setAcc(p.access);
        setF({
          name: p.name, description: p.description,
          status: p.status,
          start_date: p.start_date || "", due_date: p.due_date || "",
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
      // Taklif yoki vazifa o'tmasa ham loyiha qoladi - nima qolib ketganini
      // aytamiz. Vazifa taklifga bog'liq emas: taklif yuborilmasa ham
      // yozib qo'yilgan ish doskaga tushaveradi.
      const tasks = taskCount(invites);
      if (invites.length) {
        const failedInvites = await sendInvites(saved.id, invites);
        const { failedTasks, failedFiles } = tasks
          ? await createPickedTasks(saved.id, invites)
          : { failedTasks: [], failedFiles: [] };
        if (failedInvites.length || failedTasks.length || failedFiles.length) {
          const parts = [];
          if (failedInvites.length) parts.push("taklif yuborilmadi: " + failedInvites.join(", "));
          if (failedTasks.length) parts.push("vazifa yaratilmadi: " + failedTasks.join(", "));
          if (failedFiles.length) {
            parts.push("fayllari biriktirilmadi: " + failedFiles.join(", ")
                       + " (vazifaning ozi yaratildi)");
          }
          setBusy(false);
          setError("Loyiha yaratildi, lekin " + parts.join("; ")
                   + " — «Jamoa» va «Doska» bolimidan qayta urinib koring.");
          nav(`/loyiha/${saved.id}/${failedInvites.length ? "jamoa" : "doska"}`);
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

  /** Loyihani butunlay o'chirish - nomini yozib tasdiqlagandan keyin. */
  async function removeProject() {
    const typed = window.prompt(
      `Loyiha vazifalari, fayllari va tarixi bilan butunlay ochiriladi.
Bu amalni qaytarib bolmaydi. Tasdiqlash uchun loyiha nomini yozing:`,
      "");
    if (typed === null) return;
    if (typed.trim() !== f.name.trim()) {
      setError("Nom mos kelmadi — loyiha ochirilmadi.");
      return;
    }
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
                  <label>Loyiha holati</label>
                  <select value={f.status} onChange={(e) => set("status", e.target.value)}>
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
                  faqat yangi loyihaga chaqiriladigan odamlar. */}
              {!editing && (
                <Card title="Jamoaga taklif va vazifalar">
                  <TeamPicker
                    picks={invites}
                    onChange={setInvites}
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
