/**
 * Loyiha hujjatlari — texnik topshiriq, dizayn, shartnoma, arxiv.
 *
 * Vazifa fayllaridan farqi: bular bitta ishga emas, butun loyihaga tegishli,
 * shuning uchun yangi kelgan odam ham darrov topadi.
 *
 * O'QISH loyihani ko'rish huquqi bilan bir xil: ochiq loyihada hujjatlarni
 * tizimdagi hamma ko'radi — nima ustida ishlanayotganini bilmasdan turib
 * odam jamoaga qo'shilishga qaror qila olmaydi. YOZISH esa jamoa ichida:
 * yuklashni `can_work` qiladi.
 *
 * TAHRIRLASH VA O'CHIRISH: hujjatni YUKLAGAN odam o'zinikiga tega oladi,
 * loyiha menejeri, loyiha admini va tizim admini esa hammasiga. Ilgari
 * yuklagan odam o'zi qo'ygan faylga ham tega olmasdi — xato nom yoki sana
 * yozib qo'ysa, menejerni bezovta qilishga to'g'ri kelardi. Serverda ham
 * xuddi shu qoida (`ProjectViewSet.file_detail`).
 *
 * NOM VA SANA MAJBURIY, sana esa LOYIHA ORALIG'IDA bo'lishi kerak:
 * loyiha boshlanishidan oldingi yoki muddatidan keyingi hujjat sanasi
 * deyarli har doim xato yozuv. Bu yerda maydon chegaralanadi, serverda
 * esa qayta tekshiriladi — brauzerdagi cheklov chetlab o'tilishi mumkin.
 *
 * TAHRIR TARIXI: ayni nomli hujjat qayta yuklansa yangi qator emas, shu
 * hujjatning yangi nusxasi bo'ladi. Eskisi yo'qolmaydi — «v2» yorlig'i
 * ostidan ochib ko'rish mumkin: kim yuklagan, kim almashtirgan, qachon.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError, api } from "@/api/client";
import type { Project, ProjectFile } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { confirmDialog } from "@/components/Confirm";
import { IconFile } from "@/components/icons";
import { Avatar, Card, DateField, Empty, ErrorMsg, FieldDiff, fmtDate, Loading, OkMsg, timeAgo }
  from "@/components/ui";
import { useProjectLive } from "@/realtime/RealtimeContext";

export default function Files({ project }: { project: Project }) {
  const fid = useId();
  const acc = project.access;
  const { user } = useAuth();
  const [items, setItems] = useState<ProjectFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState("");
  // Hujjatning O'ZIDAGI sana: shartnoma imzolangan kun, topshiriq tasdiqlangan
  // kun. Yuklangan vaqt bilan aralashmasin - u serverda o'zi yoziladi.
  // Shu yerda sana bir marta yoziladi va tanlangan fayllarning hammasiga
  // tegishli bo'ladi (odatda bir martada bitta hujjat yuklanadi).
  const [docDate, setDocDate] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Tahrirlanayotgan hujjat: id va o'zgartirilayotgan qiymatlar.
  const [edit, setEdit] = useState<{ id: number; name: string; date: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.get<ProjectFile[]>(`/projects/${project.id}/files/`));
      setError(null);
    } catch (err) {
      setItems([]);
      setError(err instanceof ApiError ? err.message : "Fayllarni yuklab bo'lmadi");
    }
  }, [project.id]);

  useEffect(() => { void load(); }, [load]);
  useProjectLive(project.id, () => { void load(); });

  // Hujjat sanasi loyiha oralig'idan chiqmasin. Chegara qo'yilmagan bo'lsa
  // (loyihada sana belgilanmagan) o'sha tomon cheklanmaydi.
  const minDate = project.start_date || undefined;
  const maxDate = project.due_date || undefined;
  const rangeText = minDate || maxDate
    ? `Loyiha oralig'i: ${minDate ? fmtDate(minDate) : "…"} — ${maxDate ? fmtDate(maxDate) : "…"}`
    : "";

  /** Sana oraliqdan chiqib ketgan bo'lsa - sabab matni, aks holda bo'sh. */
  function rangeError(value: string) {
    if (!value) return "";
    if (minDate && value < minDate) {
      return `Hujjat sanasi loyiha boshlanishidan (${fmtDate(minDate)}) oldin bo'lmasin.`;
    }
    if (maxDate && value > maxDate) {
      return `Hujjat sanasi loyiha muddatidan (${fmtDate(maxDate)}) keyin bo'lmasin.`;
    }
    return "";
  }

  /** Nom va sana yozilmaguncha fayl yuklab bo'lmaydi (serverda ham shunday). */
  const ready = Boolean(description.trim() && docDate && !rangeError(docDate));

  async function upload(list: FileList | null) {
    if (!list || !list.length) return;
    if (!ready) {
      setError(rangeError(docDate) || "Avval hujjat nomini va sanasini yozing.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);

    const body = new FormData();
    Array.from(list).forEach((f) => body.append("file", f));
    body.append("description", description.trim());
    // Bitta sana - shu to'plamdagi hamma faylga (serverda shunday o'qiladi).
    body.append("doc_date", docDate);

    try {
      // `api.post` - xom `fetch` emas: 401 da token o'zi yangilanadi.
      await api.post(`/projects/${project.id}/files/`, body);
      setOk(`${list.length} ta fayl yuklandi.`);
      setDescription("");
      setDocDate("");
      if (input.current) input.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  /** Nom va sanani o'zgartirish. Faylning o'zi almashmaydi. */
  async function saveEdit() {
    if (!edit) return;
    if (!edit.name.trim() || !edit.date) {
      setError("Hujjat nomi ham, sanasi ham bo'sh qolmasin.");
      return;
    }
    const bad = rangeError(edit.date);
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/projects/${project.id}/files/${edit.id}/`,
                      { description: edit.name.trim(), doc_date: edit.date });
      setEdit(null);
      setOk("Hujjat ma'lumoti yangilandi.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Saqlab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ProjectFile) {
    // Hujjatni endi uni yuklagan odam ham o'chira oladi - shuning uchun
    // bir savol: bosib yuborilgan tugma butun hujjatni olib ketmasin.
    const ok = await confirmDialog({
      title: `«${item.description || item.original_name}» ochirilsinmi?`,
      body: "Hujjat royxatdan yoqoladi. Eski nusxalari ham u bilan ketadi.",
      confirmText: "O'chirish",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await api.delete(`/projects/${project.id}/files/${item.id}/`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "O'chirib bo'lmadi");
    }
  }

  if (items === null) return <Loading />;

  return (
    <>
      <ErrorMsg error={error} />
      <OkMsg text={ok} />

      {acc.can_work && (
        <Card title="Hujjat yuklash">
          {/* Nom va sana MAJBURIY: nomsiz hujjatni ro'yxatdan faqat uni
              yuklagan odam taniydi, sanasiz esa qaysi variant yangi ekani
              bilinmaydi. Shuning uchun ular to'lmaguncha maydon yopiq. */}
          <div className="row wrap">
            <div className="field" style={{ flex: 2, minWidth: 200 }}>
              <label htmlFor={`${fid}-0`}>Hujjat nomi</label>
              <input id={`${fid}-0`} type="text" value={description} required
                     placeholder="Masalan: texnik topshiriq v2"
                     onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor={`${fid}-1`}>Hujjat sanasi</label>
              <DateField id={`${fid}-1`} value={docDate} onChange={setDocDate} required
                         min={minDate} max={maxDate} />
              {rangeError(docDate)
                ? <div className="err">{rangeError(docDate)}</div>
                : rangeText && <div className="help">{rangeText}</div>}
            </div>
          </div>
          <div
            className={`dropzone${ready ? "" : " disabled"}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
            onClick={() => (ready ? input.current?.click() : setError("Avval hujjat nomini va sanasini yozing."))}
          >
            {busy
              ? "Yuklanmoqda…"
              : ready
                ? "Faylni shu yerga tashlang yoki bosing (25 MB gacha)"
                : "Avval nom va sanani yozing — keyin fayl tanlanadi"}
          </div>
          <input ref={input} type="file" multiple hidden
                 onChange={(e) => void upload(e.target.files)} />
        </Card>
      )}

      <Card title="Loyiha hujjatlari" padded={false}
            badge={<span className="badge">{items.length}</span>}>
        {!items.length ? (
          <Empty icon="📁" title="Hujjat yo'q"
                 text={acc.can_work
                   ? "Texnik topshiriq, dizayn yoki hujjatni yuklang."
                   : "Bu loyihaga hali hujjat yuklanmagan."} />
        ) : (
          <div className="card-list">
            {items.map((f) => (
              <div className="card-body tight" key={f.id}>
                <div className="row wrap">
                  {f.is_image && f.url
                    ? <img src={f.url} alt={f.original_name} className="file-thumb" />
                    : <span className="file-ico"><IconFile size={16} /></span>}
                  <div style={{ minWidth: 0 }}>
                    <a href={f.url || "#"} target="_blank" rel="noreferrer">{f.original_name}</a>
                    {f.version > 1 && (
                      <>
                        {" "}
                        <span className="badge mono" title="Nechanchi nusxa">v{f.version}</span>
                      </>
                    )}
                    <br />
                    <small className="muted">
                      {f.size_display} · {f.uploaded_by?.full_name} ·{" "}
                      {f.version > 1 ? `yangilandi ${timeAgo(f.updated_at)}` : timeAgo(f.created_at)}
                      {/* Hujjat sanasi - yuklangan vaqtdan boshqa narsa,
                          shuning uchun nomi bilan yoziladi. */}
                      {f.doc_date && ` · hujjat sanasi: ${fmtDate(f.doc_date)}`}
                      {f.description && ` · ${f.description}`}
                    </small>
                  </div>
                  <span className="spacer" />
                  <Avatar user={f.uploaded_by} size="sm" />
                  {/* O'z hujjatiga har kim tega oladi, hammasiga - menejer,
                      loyiha admini va tizim admini (serverda ham shunday). */}
                  {(acc.can_manage || f.uploaded_by?.id === user?.id) && (
                    <>
                      <button className="btn btn-sm"
                              onClick={() => setEdit({
                                id: f.id,
                                name: f.description,
                                date: f.doc_date || "",
                              })}>
                        Tahrirlash
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => void remove(f)}>
                        O'chirish
                      </button>
                    </>
                  )}
                </div>

                {edit?.id === f.id && (
                  <div className="row wrap" style={{ marginTop: 10 }}>
                    <div className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
                      <label htmlFor={`${fid}-e0`}>Hujjat nomi</label>
                      <input id={`${fid}-e0`} type="text" value={edit.name}
                             onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                    </div>
                    <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                      <label htmlFor={`${fid}-e1`}>Hujjat sanasi</label>
                      <DateField id={`${fid}-e1`} value={edit.date}
                                 onChange={(v) => setEdit({ ...edit, date: v })}
                                 min={minDate} max={maxDate} />
                      {rangeError(edit.date)
                        ? <div className="err">{rangeError(edit.date)}</div>
                        : rangeText && <div className="help">{rangeText}</div>}
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn btn-sm btn-primary" disabled={busy}
                              onClick={() => void saveEdit()}>Saqlash</button>
                      <button className="btn btn-sm" onClick={() => setEdit(null)}>Bekor qilish</button>
                    </div>
                  </div>
                )}

                {/* Eski nusxalar — yig'ib qo'yiladi, kerak bo'lganda ochiladi.
                    Har biri o'z havolasi bilan: eski variant ham yuklab olinadi. */}
                {!!f.versions.length && (
                  <details className="file-history">
                    <summary>
                      Tahrir tarixi — {f.versions.length} ta eski nusxa
                    </summary>
                    <div className="stack" style={{ marginTop: 8 }}>
                      {f.versions.map((v) => (
                        <div key={v.id}>
                          <div className="row wrap" style={{ gap: 8 }}>
                            <span className="badge mono">v{v.version}</span>
                            <a href={v.url || "#"} target="_blank" rel="noreferrer">
                              {v.original_name}
                            </a>
                            <small className="muted">
                              {v.size_display} · {v.uploaded_by?.full_name || "—"} yuklagan
                              {v.doc_date && ` · hujjat sanasi: ${fmtDate(v.doc_date)}`}
                            </small>
                            <span className="spacer" />
                            <small className="muted nowrap">
                              {v.replaced_by?.full_name || "—"} almashtirgan · {timeAgo(v.replaced_at)}
                            </small>
                          </div>
                          {/* Hujjatning ichini solishtirib bo'lmaydi (ikkilik fayl),
                              shuning uchun maydonlari yonma-yon qo'yiladi:
                              v{n} qanday edi va nimaga aylandi. */}
                          <FieldDiff rows={v.diff.filter((r) => r.changed)} />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
