import { useId, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { Link } from "react-router-dom";
import { ApiError, listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Project } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { IconPlus } from "@/components/icons";
import { Empty, ErrorMsg, Loading, Progress, RowMenu } from "@/components/ui";
import { deleteProject } from "@/api/projects";
import { toNewProject, toProject, toProjectEdit, useGo } from "@/nav";

/**
 * Loyihalar - BITTA ro'yxat.
 *
 * Ilgari yuqorida kesim tugmalari turardi: «Meniki», «Boshqaruvim»,
 * «Ochiq» (adminda yana «Hammasi»). Ular bir xil ro'yxatni bo'laklarga
 * bo'lardi va odam qidirayotgan loyihasi qaysi bo'lakda ekanini oldindan
 * bilishi kerak edi. Yomoni: menejer o'z loyihasini «Meniki» da
 * topolmasdi - u a'zo emas, boshqaruvchi.
 *
 * Endi ro'yxat bitta va u odam OCHA OLADIGAN hamma loyihani ko'rsatadi
 * (serverdagi `scope=visible`). Kerakli loyiha qidiruv orqali topiladi.
 */
export default function Projects() {
  const fid = useId();
  const go = useGo();
  const { user } = useAuth();
  // O'chirish xatosi - yuklash xatosidan alohida.
  const [actionError, setActionError] = useState<string | null>(null);
  // `q` - maydonda yozilayotgan matn, `applied` - serverga yuborilgani.
  // Ikkovi ajratilgani uchun har harfda so'rov ketmaydi.
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");

  // Ilgari bu yerda `catch` yo'q edi: server xato bersa va'da rad etilib,
  // ro'yxat `null` bo'lib qolardi va sahifa abadiy «Yuklanmoqda» da turardi.
  const { data, error: loadError, loading, reload } =
    useFetch<any>("/projects/", { scope: "visible", search: applied, page_size: 100 });
  const projects = useMemo(() => (data ? listOf<Project>(data) : null), [data]);
  const error = actionError || loadError;

  /** Loyihani boshqara oladimi - menejeri yoki tizim admini. */
  const canManage = (p: Project) =>
    p.manager?.id === user?.id || Boolean(user?.is_platform_admin);

  /** Loyihani o'chirish - jarayondagi ish bo'lsa qo'shimcha tasdiq so'raladi. */
  async function removeProject(id: number, name: string) {
    setActionError(null);
    try {
      if (await deleteProject(id, name)) reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Loyihani ochirib bolmadi");
    }
  }

  return (
    <>
      <PageHead
        title={<strong>Loyihalar</strong>}
        subtitle="Faol loyihalar va jarayonlar monitoringi"
        actions={
          user?.can_create_project && (
            <Link className="btn btn-primary" {...toNewProject()}>
              <IconPlus size={15} /> Yangi loyiha
            </Link>
          )
        }
      />
      <div className="content">
        <ErrorMsg error={error} />

        {/* Nom, kalit va tavsif bo'yicha - qidiruv serverda
            (`ProjectViewSet.search_fields`), ya'ni yuklanmagan
            loyihalar ham topiladi. */}
        <form className="filters" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
          <div className="f grow">
            <label htmlFor={`${fid}-0`}>Qidiruv</label>
            <input id={`${fid}-0`} value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Nom, tavsif yoki hujjat nomi boyicha" />
          </div>
          <button className="btn">Qidirish</button>
          {!!applied && (
            <button type="button" className="btn btn-ghost"
                    onClick={() => { setQ(""); setApplied(""); }}>
              Tozalash
            </button>
          )}
        </form>

        {loading ? <Loading /> : !projects ? null : !projects.length ? (
          <div className="card">
            <Empty icon="☰" title="Loyiha topilmadi"
                   text={applied
                     ? `«${applied}» boyicha hech narsa topilmadi - boshqacha yozib koring.`
                     : "Ochiq loyihaga qoshiling yoki yangi yarating."}>
              <div className="row" style={{ justifyContent: "center" }}>
                {applied ? (
                  <button className="btn" onClick={() => { setQ(""); setApplied(""); }}>
                    Qidiruvni tozalash
                  </button>
                ) : (
                  <>
                    <Link className="btn btn-primary" to="/qoshilish">Loyiha topish</Link>
                    {user?.can_create_project && (
                      <Link className="btn" {...toNewProject()}>Yangi loyiha</Link>
                    )}
                  </>
                )}
              </div>
            </Empty>
          </div>
        ) : (
          /* Ro'yxat emas, kartalar setkasi: bir qatorda UCHTA karta -
             har loyihaning jarayoni va uchta asosiy raqami bir qarashda
             ko'rinadi. Ikkilamchi havolalar («Doska», «Tarix»,
             tahrirlash) kartaning o'ng yuqorisidagi menyuda. */
          <div className="grid grid-projects">
            {projects.map((p) => (
              /* Kartaning istalgan yeriga bosilsa loyiha ochiladi - nomni
                 aniq nishonga olish shart emas. Shu sabab alohida «Kirish»
                 tugmasi yo'q: u kartaning o'zi qiladigan ishni takrorlardi.
                 Ichidagi havola va menyu o'z ishini qiladi
                 (`stopPropagation`). */
              <div className="pcard" key={p.id} onClick={() => go(toProject(p.id))}>
                <div className="pcard-top">
                  <span className="lang-dot" style={{ background: p.color }} />
                  <Link className="pcard-name" {...toProject(p.id)}
                        onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                  {p.status !== "ACTIVE" && (
                    <span className="badge">{p.status_display}</span>
                  )}
                  <span className="spacer" />
                  {/* «⋯» menyusi FAQAT loyihani boshqaradigan odamga -
                      ichida boshqaruv amallari turadi.

                      Bu faqat KO'RINISH: tahrirlash va o'chirish ruxsati
                      serverda ham tekshiriladi (`ProjectAccess`). */}
                  {canManage(p) && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <RowMenu>
                        {/* «Doska» va «Tarix» bu yerdan olib tashlandi:
                            ikkovi ham loyiha ochilgandan keyin yuqorida
                            bo'lim bo'lib turadi, menyuda esa faqat
                            takrorlanardi. Bu yerda o'sha yerda yo'q
                            amallar qoladi. */}
                        <Link {...toProjectEdit(p.id)}>Tahrirlash</Link>
                        <button type="button" className="danger"
                                onClick={() => void removeProject(p.id, p.name)}>
                          Ochirish
                        </button>
                      </RowMenu>
                    </span>
                  )}
                </div>

                <div className="pcard-sub">
                  {p.workspace_name} · <span className="mono">{p.key}</span>
                </div>

                <div className="pcard-prog">
                  <span className="muted">Jarayon</span>
                  <span className="spacer" />
                  <strong>{p.progress}%</strong>
                </div>
                <Progress value={p.progress} />

                <div className="pcard-foot">
                  <span className="pcard-metric">
                    <small>Ochiq vazifa</small>
                    <strong>{p.open_tasks} ta</strong>
                  </span>
                  <span className="pcard-metric">
                    <small>A'zolar</small>
                    <strong>{p.member_count} kishi</strong>
                  </span>
                  <span className="pcard-metric">
                    <small>Menda</small>
                    <strong>{p.my_tasks} ta</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
