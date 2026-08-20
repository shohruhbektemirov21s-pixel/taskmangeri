import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listOf, pagesOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Project } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, Empty, ErrorMsg, Loading, Pager, SpecialtyTag } from "@/components/ui";
import { toProject, toProjectJoin, useGo } from "@/nav";
import { tx } from "@/i18n";

/** Bir sahifada nechta ochiq loyiha. */
const PER_PAGE = 30;

/**
 * «Loyihaga qo'shilish» - ochiq loyihalar ro'yxati.
 *
 * Ilgari bu yerda `api.get(...)` `catch` siz chaqirilardi va sahifa
 * serverdagi har qanday xatoda abadiy «Yuklanmoqda» da muzlab qolardi -
 * odam sababini bilmasdi. Endi `useFetch`: xato matn bo'lib ekranga
 * chiqadi, eski so'rov bekor qilinadi va komponent yo'q bo'lgach holat
 * yozilmaydi (`api/useFetch.ts` dagi izohga qarang).
 */
export default function Discover() {
  const fid = useId();
  const go = useGo();
  const { user } = useAuth();
  // `q` - maydonda yozilayotgan matn, `applied` - serverga yuborilgani.
  // «Qidirish» bosilgunicha so'rov ketmaydi - `Projects.tsx` dagi bilan
  // bir xil tartib.
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);

  // `page_size: 100` ilgari shift edi - yuzinchidan keyingi ochiq loyiha
  // hech qanday belgisiz yo'qolardi.
  const { data, error, loading } = useFetch<any>(
    "/projects/", { scope: "discover", search: applied, page, page_size: PER_PAGE });
  const projects = useMemo(() => (data ? listOf<Project>(data) : null), [data]);
  const pages = pagesOf(data, PER_PAGE);

  return (
    <>
      <PageHead title={<strong>{tx("discover.loyihaga_qoshilish")}</strong>} />
      <div className="content">
        <div className="split">
          <div>
            <ErrorMsg error={error} />

            <form className="filters"
                  onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); setPage(1); }}>
              <div className="f grow">
                <label htmlFor={`${fid}-0`}>{tx("common.qidiruv")}</label>
                <input id={`${fid}-0`} value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder={tx("discover.loyiha_nomi_yoki_kaliti")} />
              </div>
              <button className="btn">{tx("discover.qidirish")}</button>
              {!!applied && (
                <button type="button" className="btn btn-ghost"
                        onClick={() => { setQ(""); setApplied(""); setPage(1); }}>
                  {tx("common.tozalash")}
                </button>
              )}
            </form>

            {loading ? <Loading /> : projects && (
              <div className="card">
                <div className="card-list">
                  {projects.map((p) => (
                    /* Butun karta bosiladi - loyihaga kirish uchun tugmani
                       qidirib o'tirish shart emas. Bu SICHQONCHA uchun
                       qulaylik; klaviatura yo'li ichidagi havolalar orqali
                       allaqachon ochiq, shuning uchun kartaning o'zi
                       qo'shimcha tab to'xtashiga aylantirilmaydi. */
                    <div className="repo-item clickable" key={p.id}
                         onClick={() => go(toProject(p.id))}>
                      <div className="row wrap">
                        <h3 style={{ margin: 0 }}>
                          <span className="lang-dot" style={{ background: p.color }} />{" "}
                          <Link {...toProject(p.id)}
                                onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                        </h3>
                        <span className="badge mono">{p.key}</span>
                        {p.auto_accept && <span className="badge badge-ok">{tx("discover.avtomatik_qabul")}</span>}
                        <span className="spacer" />
                        {/* Ochiq loyihani qo'shilmasdan ham ko'rish mumkin:
                            vazifalar va tarix ko'rinadi, fayllar esa faqat
                            jamoaga (serverda shunday cheklangan). */}
                        <Link className="btn btn-sm btn-primary" {...toProjectJoin(p.id)}
                              onClick={(e) => e.stopPropagation()}>
                          {tx("common.qoshilish")}
                        </Link>
                      </div>
                      {p.description && <p className="muted" style={{ margin: "8px 0 0" }}>{p.description}</p>}
                      <div className="repo-meta">
                        <span>{p.workspace_name}</span>
                        <span>{p.member_count} {tx("common.azo")}</span>
                        <span>{p.open_tasks} {tx("common.ochiq_vazifa")}</span>
                        {p.manager && <span>{tx("common.pm")} {p.manager.full_name}</span>}
                      </div>
                    </div>
                  ))}
                  {!projects.length && (
                    <Empty title={tx("common.loyiha_topilmadi")}
                           text={tx("discover.hozircha_ochiq_loyiha_yoq_yoki")} />
                  )}
                </div>
              </div>
            )}
            {pages > 1 && <Pager page={page} pages={pages} onPick={setPage} />}
          </div>

          <div>
            <Card title={tx("discover.sizning_yonalishingiz")}>
              <div className="row mb"><SpecialtyTag user={user} /></div>
              <strong style={{ fontSize: 13 }}>{tx("discover.konikmalaringiz")}</strong>
              <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
                {user?.skill_list.map((s) => <span className="badge" key={s}>{s}</span>)}
              </div>
            </Card>

          </div>
        </div>
      </div>
    </>
  );
}
