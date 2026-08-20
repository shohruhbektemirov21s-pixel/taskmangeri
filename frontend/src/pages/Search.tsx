/**
 * Ochiq loyihalar qidiruvi — kirmagan odam ham ko'radi.
 *
 * Platformada nima borligini ko'rmasdan turib odam ro'yxatdan o'tmaydi.
 * Shu sabab bu sahifa autentifikatsiyasiz ishlaydi; serverdan faqat ochiq
 * loyihalarning xavfsiz maydonlari keladi.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { PublicProject } from "@/api/types";
import PublicShell from "@/components/PublicShell";
import { Empty, Loading, Progress } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { toPublicProject, useNavParams } from "@/nav";
import { tx } from "@/i18n";

export default function Search() {
  const fid = useId();
  const [params, setParams] = useNavParams();
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
          <div className="eyebrow">{tx("search.ochiq_loyihalar")}</div>
          <h2 style={{ marginBottom: 8 }}>
            {q ? tx("search.soz_boyicha_qidiruv", { soz: q }) : tx("search.jamoaga_qoshiladigan_loyihalar")}
          </h2>
          <p>
            {tx("search.royxatdan_otmasdan_ham_korishingiz_mumkin")}
          </p>
        </div>

        <div className="filters">
          <div className="f" style={{ minWidth: 220 }}>
            <label htmlFor={`${fid}-0`}>{tx("search.mutaxassislik_boyicha")}</label>
            <select id={`${fid}-0`} value={specialty} onChange={(e) => setFilter(e.target.value)}>
              <option value="">{tx("common.hammasi")}</option>
              {specialties.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <span className="spacer" />
          {items !== null && (
            <span className="muted" style={{ fontSize: 13 }}>{items.length} {tx("search.ta_loyiha")}</span>
          )}
        </div>

        {items === null && <Loading />}

        {items !== null && !items.length && (
          <Empty
            icon="🔍"
            title={tx("common.loyiha_topilmadi")}
            text={q
              ? tx("search.boshqa_soz_bilan_qidirib_koring")
              : tx("search.hozircha_ochiq_loyiha_yoq_ozingiz")}
          >
            {!user && (
              <Link className="btn btn-primary" to="/royxatdan-otish">{tx("common.royxatdan_otish")}</Link>
            )}
          </Empty>
        )}

        <div className="lp-cards">
          {(items || []).map((p) => (
            <Link key={p.id} className="lp-card" {...toPublicProject(p.id)}
                  style={{ display: "block", color: "inherit", textDecoration: "none" }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="lang-dot" style={{ background: p.color }} />
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                <span className="badge mono">{p.key}</span>
                <span className="spacer" />
                <span className="badge">{p.status_display}</span>
              </div>

              <p className="muted" style={{ marginTop: 10, minHeight: 40 }}>
                {p.description || tx("common.tavsif_kiritilmagan")}
              </p>

              <Progress value={p.progress} />

              <div className="repo-meta">
                <span>{p.member_count} {tx("search.azo")}</span>
                <span>{p.open_tasks} {tx("common.ochiq_vazifa")}</span>
                <span>{p.workspace_name}</span>
              </div>

              {!!p.needed_specialties.length && (
                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{tx("search.kerak")}</span>
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
