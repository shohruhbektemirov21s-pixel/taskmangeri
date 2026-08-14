/**
 * Loyiha hujjatlari — texnik topshiriq, dizayn, shartnoma, arxiv.
 *
 * Vazifa fayllaridan farqi: bular bitta ishga emas, butun loyihaga tegishli,
 * shuning uchun yangi kelgan odam ham darrov topadi.
 *
 * O'QISH loyihani ko'rish huquqi bilan bir xil: ochiq loyihada hujjatlarni
 * tizimdagi hamma ko'radi — nima ustida ishlanayotganini bilmasdan turib
 * odam jamoaga qo'shilishga qaror qila olmaydi. YOZISH esa jamoa ichida:
 * yuklashni `can_work` qiladi, o'chirishni esa faqat loyihani boshqaruvchi
 * — menejer, loyiha admini yoki tizim admini. Yuklagan odamning o'zi ham
 * o'chira olmaydi: hujjatga butun jamoaning ishi tayanadi
 * (serverda ham xuddi shunday tekshiriladi).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, tokens } from "@/api/client";
import type { Project, ProjectFile } from "@/api/types";
import { IconFile } from "@/components/icons";
import { Avatar, Card, Empty, ErrorMsg, Loading, OkMsg, timeAgo } from "@/components/ui";
import { useProjectLive } from "@/realtime/RealtimeContext";

export default function Files({ project }: { project: Project }) {
  const acc = project.access;
  const [items, setItems] = useState<ProjectFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState("");
  const input = useRef<HTMLInputElement>(null);

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

  async function upload(list: FileList | null) {
    if (!list || !list.length) return;
    setBusy(true);
    setError(null);
    setOk(null);

    const body = new FormData();
    Array.from(list).forEach((f) => body.append("file", f));
    if (description.trim()) body.append("description", description.trim());

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "/api"}/projects/${project.id}/files/`,
        { method: "POST", headers: { Authorization: `Bearer ${tokens.access}` }, body }
      );
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
      setOk(`${list.length} ta fayl yuklandi.`);
      setDescription("");
      if (input.current) input.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ProjectFile) {
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
          <div className="field">
            <label>Izoh (ixtiyoriy)</label>
            <input type="text" value={description} placeholder="Masalan: texnik topshiriq v2"
                   onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
            onClick={() => input.current?.click()}
          >
            {busy ? "Yuklanmoqda…" : "Faylni shu yerga tashlang yoki bosing (25 MB gacha)"}
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
              <div className="card-body tight row wrap" key={f.id}>
                {f.is_image && f.url
                  ? <img src={f.url} alt={f.original_name} className="file-thumb" />
                  : <span className="file-ico"><IconFile size={16} /></span>}
                <div style={{ minWidth: 0 }}>
                  <a href={f.url || "#"} target="_blank" rel="noreferrer">{f.original_name}</a>
                  <br />
                  <small className="muted">
                    {f.size_display} · {f.uploaded_by?.full_name} · {timeAgo(f.created_at)}
                    {f.description && ` · ${f.description}`}
                  </small>
                </div>
                <span className="spacer" />
                <Avatar user={f.uploaded_by} size="sm" />
                {acc.can_manage && (
                  <button className="btn btn-sm btn-danger" onClick={() => void remove(f)}>
                    O'chirish
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
