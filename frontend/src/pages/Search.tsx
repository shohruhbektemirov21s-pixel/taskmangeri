/**
 * Ochiq loyihalar qidiruvi — kirmagan odam ham ko'radi.
 *
 * Platformada nima borligini ko'rmasdan turib odam ro'yxatdan o'tmaydi.
 * Shu sabab bu sahifa autentifikatsiyasiz ishlaydi; serverdan faqat ochiq
 * loyihalarning xavfsiz maydonlari keladi.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import type { PublicProject } from "@/api/types";
import PublicShell from "@/components/PublicShell";
import { Empty, Loading, Progress } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const q = params.get("q") || "";
  const specialty = params.get("specialty") || "";

  const [items, setItems] = useState<PublicProject[] | null>(null);
  const [specialties, setSpecialties] = useState<{ value: string; label: string }[]>([]);

  const load = useCallback(async () => {
    setItems(null);
    try {
      const data = await api.get<{ results: PublicProject[] }>("/public/projects/", { q, specialty });
      setItems(data.results);
    } catch {
      setItems([]);
    }
  }, [q, specialty]);

  useEffect(() => { void load(); }, [load]);

  // Mutaxassisliklar katalogi ham ochiq endpointdan keladi.
  useEffect(() => {
    void (async () => {
      try {
        // Endpoint {specialties, seniority} obyektini qaytaradi - massiv emas.
        const data = await api.get<{ specialties: { value: string; label: string }[] }>(
          "/auth/specialties/");
        setSpecialties((data.specialties || []).map(
          (s) => ({ value: String(s.value), label: s.label })));
      } catch { /* filtr bo'lmasa ham qidiruv ishlaydi */ }
    })();
  }, []);

  function setFilter(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("specialty", value);
    else next.delete("specialty");
    setParams(next);
  }

  return (
    <PublicShell query={q}>
      <div className="lp-wrap" style={{ padding: "36px 24px 64px" }}>
        <div className="sec-head" style={{ marginBottom: 26 }}>
          <div className="eyebrow">Ochiq loyihalar</div>
          <h2 style={{ marginBottom: 8 }}>
            {q ? `«${q}» bo'yicha qidiruv` : "Jamoaga qo'shiladigan loyihalar"}
          </h2>
          <p>
            Ro'yxatdan o'tmasdan ham ko'rishingiz mumkin. Qo'shilish uchun hisob kerak.
          </p>
        </div>

        <div className="filters">
          <div className="f" style={{ minWidth: 220 }}>
            <label>Mutaxassislik bo'yicha</label>
            <select value={specialty} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Hammasi</option>
              {specialties.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <span className="spacer" />
          {items !== null && (
            <span className="muted" style={{ fontSize: 13 }}>{items.length} ta loyiha</span>
          )}
        </div>

        {items === null && <Loading />}

        {items !== null && !items.length && (
          <Empty
            icon="🔍"
            title="Loyiha topilmadi"
            text={q
              ? "Boshqa so'z bilan qidirib ko'ring yoki mutaxassislik filtrini olib tashlang."
              : "Hozircha ochiq loyiha yo'q. O'zingiz birinchi bo'lib oching."}
          >
            {!user && (
              <Link className="btn btn-primary" to="/royxatdan-otish">Ro'yxatdan o'tish</Link>
            )}
          </Empty>
        )}

        <div className="lp-cards">
          {(items || []).map((p) => (
            <Link key={p.id} className="lp-card" to={`/ochiq-loyiha/${p.id}`}
                  style={{ display: "block", color: "inherit", textDecoration: "none" }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="lang-dot" style={{ background: p.color }} />
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                <span className="badge mono">{p.key}</span>
                <span className="spacer" />
                <span className="badge">{p.status_display}</span>
              </div>

              <p className="muted" style={{ marginTop: 10, minHeight: 40 }}>
                {p.description || "Tavsif kiritilmagan."}
              </p>

              <Progress value={p.progress} />

              <div className="repo-meta">
                <span>{p.member_count} a'zo</span>
                <span>{p.open_tasks} ochiq vazifa</span>
                <span>{p.workspace_name}</span>
              </div>

              {!!p.needed_specialties.length && (
                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Kerak:</span>
                  {p.needed_specialties.map((s) => (
                    <span className="badge badge-info" key={s.value}>{s.label}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
