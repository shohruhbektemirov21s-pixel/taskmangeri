import { useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import { deleteProject } from "@/api/projects";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import TeamPicker, { addPickedMembers, createPickedTasks, taskCount }
  from "@/components/TeamPicker";
import type { Pick as TeamPick } from "@/components/TeamPicker";
import type { Access, Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, DateField, ErrorMsg, Loading } from "@/components/ui";

export default function ProjectForm() {
  const fid = useId();
  // Saqlash tugmasi sarlavhada, ya'ni `<form>` dan tashqarida turadi -
  // `form` atributi orqali bog'lanadi, shuning uchun formaga id kerak.
  const formId = `${fid}-form`;
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
  // Hujjat sanasi ikki qavat: `fileDate` - butun to'plamga (izoh yonida),
  // `fileDates[i]` esa aynan `files[i]` uchun. Fayl sanasi bo'sh bo'lsa
  // umumiy sana ketadi - bir xil sanani har faylga qayta yozish shart emas.
  const [fileDate, setFileDate] = useState("");
  const [fileDates, setFileDates] = useState<string[]>([]);
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
    // Hujjat nomsiz va sanasiz yuklanmaydi (server ham shunday tekshiradi) -
    // buni loyiha yaratilgandan KEYIN aytish kech bo'lardi: fayl o'tmay
    // qolar, odam esa uni «Hujjatlar» bo'limidan qayta yuklashi kerak edi.
    if (files.length) {
      if (!fileNote.trim()) {
        setError("Fayllar uchun hujjat nomini yozing.");
        return;
      }
      const missing = files.filter((_, i) => !(fileDates[i] || fileDate));
      if (missing.length) {
        setError("Hujjat sanasi korsatilmagan: " + missing.map((f) => f.name).join(", "));
        return;
      }
    }
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
          await uploadFiles(`/projects/${saved.id}/files/`, files, fileNote,
                            files.map((_, i) => fileDates[i] || fileDate));
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

  /** Loyihani butunlay o'chirish - tasdiq `deleteProject` ichida so'raladi. */
  async function removeProject() {
    setError(null);
    setBusy(true);
    try {
      if (await deleteProject(id!, f.name)) {
        nav("/loyihalar");
        return;
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Loyihani ochirib bolmadi");
    }
    setBusy(false);
  }

  if (!loaded) return <div className="content"><Loading /></div>;

  return (
    <>
      {/* Holat va tugmalar sarlavha qatorida: bitta maydon uchun butun karta
          ketmasin, «Loyiha yaratish» esa formaning oxirigacha aylantirmasdan
          ko'rinib tursin. Tugma formadan tashqarida turgani uchun `form`
          atributi bilan bog'lanadi - bosilganda odatdagidek `submit` bo'ladi. */}
      <PageHead
        title={<strong>{editing ? "Loyiha sozlamalari" : "Yangi loyiha"}</strong>}
        actions={(
          <div className="row" style={{ gap: 8 }}>
            <select aria-label="Loyiha holati" title="Loyiha holati" value={f.status}
                    style={{ width: "auto", minWidth: 140 }}
                    onChange={(e) => set("status", e.target.value)}>
              {(meta?.project_status || []).map((s) => (
                <option key={s.value} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
            <button className="btn btn-primary" form={formId} disabled={busy}>
              {busy ? "Saqlanmoqda..." : editing ? "Saqlash" : "Loyiha yaratish"}
            </button>
            <button type="button" className="btn" onClick={() => nav(-1)}>Bekor qilish</button>
          </div>
        )}
      />
      <div className="content">
        <ErrorMsg error={error} />
        <form id={formId} onSubmit={submit}>
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
                  withDates
                  date={fileDate}
                  onDate={setFileDate}
                  dates={fileDates}
                  onDates={setFileDates}
                  /* Hujjat sanasi loyiha oralig'idan chiqmasin - chegaralar
                     shu formaning o'zidagi maydonlardan olinadi. */
                  minDate={f.start_date || undefined}
                  maxDate={f.due_date || undefined}
                />
              </Card>
            )}
            </div>

            <div>
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

        </form>
      </div>
    </>
  );
}
