import { useId, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { Link } from "react-router-dom";
import { ApiError, listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { MyWorkData, Project, Task } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { IconCalendar, IconPlus } from "@/components/icons";
import { DUE_PERIODS, DateField, Empty, ErrorMsg, Loading, Progress, RowMenu, fmtDate } from "@/components/ui";
import { deleteProject } from "@/api/projects";
import { toNewProject, toProject, toProjectEdit, toTask, useGo } from "@/nav";
import { tx } from "@/i18n";

/**
 * «Loyihalar» bo'limi ikki xil odamga ikki xil ochiladi.
 *
 * MENEJER va ADMIN loyihalarni ko'radi - ular ish taqsimlaydi, ya'ni
 * "qaysi loyihalar bor va ular qay ahvolda" degan savol aynan ularniki.
 * "Kim nima qilayapti" esa alohida sahifada - `pages/Tasks.tsx`.
 *
 * IJROCHI (dasturchi, QA) loyiha kartalarini ko'rmaydi: unga loyihaning
 * jarayon foizi ham, a'zolar soni ham kerak emas - unga O'Z ISHI kerak.
 * Shuning uchun bu yerda uning vazifalari LOYIHA bo'yicha guruhlanadi va
 * vazifani bosib o'sha loyihaning ichiga kiradi.
 *
 * Chegara ROLdan emas, AMALDAGI holatdan olinadi: `can_create_project`
 * global rolni aytadi, `manages_projects` esa odam biror loyihaga menejer
 * qilib qo'yilgan-qo'yilmaganini. Ikkinchisisiz global roli «Dasturchi»
 * bo'lgan menejer o'z loyihalarini ko'rmay qolardi.
 */
export default function Projects() {
  const { user } = useAuth();
  const manages = Boolean(user?.can_create_project || user?.manages_projects);
  return manages ? <ManagerProjects /> : <MyProjectTasks />;
}

/* ------------------------------------------------------ menejer va admin */

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
function ManagerProjects() {
  const fid = useId();
  const go = useGo();
  const { user } = useAuth();
  // O'chirish xatosi - yuklash xatosidan alohida.
  const [actionError, setActionError] = useState<string | null>(null);
  // `q` - maydonda yozilayotgan matn, `applied` - serverga yuborilgani.
  // Ikkovi ajratilgani uchun har harfda so'rov ketmaydi.
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  // MUDDAT kesimi - tanlangan zahoti ishlaydi. Qidiruv esa «Qidirish»
  // bosilganda: matn har harfda so'rov yubormasin, tanlov esa bitta
  // harakat va uni yana tasdiqlatish ortiqcha bosish bo'lardi.
  const [period, setPeriod] = useState("");

  // Ilgari bu yerda `catch` yo'q edi: server xato bersa va'da rad etilib,
  // ro'yxat `null` bo'lib qolardi va sahifa abadiy «Yuklanmoqda» da turardi.
  const { data, error: loadError, loading, reload } =
    useFetch<any>("/projects/", { scope: "visible", search: applied, period,
                                  page_size: 100 });
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
      setActionError(err instanceof ApiError ? err.message : tx("projects.loyihani_ochirib_bolmadi"));
    }
  }

  return (
    <>
      <PageHead
        title={<strong>{tx("common.loyihalar")}</strong>}
        actions={
          user?.can_create_project && (
            <Link className="btn btn-primary" {...toNewProject()}>
              <IconPlus size={15} /> {tx("common.yangi_loyiha")}
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
            <label htmlFor={`${fid}-0`}>{tx("common.qidiruv")}</label>
            <input id={`${fid}-0`} value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder={tx("projects.nom_tavsif_yoki_hujjat_nomi")} />
          </div>
          {/* Loyihaning MUDDATI bo'yicha. Davrlar kalendar bo'yicha va
              hisob serverda (`due_date_span`) - «shu hafta» bu yerda ham,
              vazifalar ro'yxatida ham bitta hafta bo'lsin. */}
          <div className="f">
            <label htmlFor={`${fid}-r`}>{tx("common.muddat")}</label>
            <select id={`${fid}-r`} value={period}
                    onChange={(e) => setPeriod(e.target.value)}>
              <option value="">{tx("projects.barcha_muddatlar")}</option>
              {DUE_PERIODS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button className="btn">{tx("projects.qidirish")}</button>
          {(!!applied || !!period) && (
            <button type="button" className="btn btn-ghost"
                    onClick={() => { setQ(""); setApplied(""); setPeriod(""); }}>
              {tx("common.tozalash")}
            </button>
          )}
        </form>

        {loading ? <Loading /> : !projects ? null : !projects.length ? (
          <div className="card">
            {/* Bo'sh holat SABABINI aytadi. Muddat kesimi alohida yoziladi:
                muddati QO'YILMAGAN loyiha bunday kesimga umuman tushmaydi
                (server tomonda `due_date` bo'sh bo'lsa solishtiruv NULL
                beradi) - buni aytmasak, ro'yxatdan yo'qolgan loyiha
                xatodek tuyulardi. */}
            <Empty icon="☰" title={tx("common.loyiha_topilmadi")}
                   text={applied
                     ? tx("projects.qidiruv_natijasi_yoq", { soz: applied })
                     : period
                       ? tx("projects.bu_davrga_muddati_tushadigan_loyiha")
                         + tx("projects.muddati_qoyilmagan_loyihalar_bu_kesimda")
                       : tx("projects.ochiq_loyihaga_qoshiling_yoki_yangi")}>
              <div className="row" style={{ justifyContent: "center" }}>
                {applied || period ? (
                  <button className="btn"
                          onClick={() => { setQ(""); setApplied(""); setPeriod(""); }}>
                    {tx("common.filtrni_tozalash")}
                  </button>
                ) : (
                  <>
                    <Link className="btn btn-primary" to="/qoshilish">{tx("projects.loyiha_topish")}</Link>
                    {user?.can_create_project && (
                      <Link className="btn" {...toNewProject()}>{tx("common.yangi_loyiha")}</Link>
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
                        <Link {...toProjectEdit(p.id)}>{tx("common.tahrirlash")}</Link>
                        <button type="button" className="danger"
                                onClick={() => void removeProject(p.id, p.name)}>
                          {tx("common.ochirish_2")}
                        </button>
                      </RowMenu>
                    </span>
                  )}
                </div>

                <div className="pcard-sub">
                  {p.workspace_name} · <span className="mono">{p.key}</span>
                </div>

                <div className="pcard-prog">
                  <span className="muted">{tx("projects.jarayon")}</span>
                  <span className="spacer" />
                  <strong>{p.progress}%</strong>
                </div>
                <Progress value={p.progress} />

                <div className="pcard-foot">
                  <span className="pcard-metric">
                    <small>{tx("common.ochiq_vazifa_2")}</small>
                    <strong>{p.open_tasks} {tx("common.ta")}</strong>
                  </span>
                  <span className="pcard-metric">
                    <small>{tx("projects.azolar")}</small>
                    <strong>{p.member_count} {tx("common.kishi")}</strong>
                  </span>
                  <span className="pcard-metric">
                    <small>{tx("projects.menda")}</small>
                    <strong>{p.my_tasks} {tx("common.ta")}</strong>
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

/* ------------------------------------------------------------- ijrochiga */

/**
 * Ijrochining «Loyihalar» bo'limi - loyiha kartalari EMAS, o'z vazifalari.
 *
 * «Mening ishim» bilan takrorlanmaydi: u yerda ish HOLAT bo'yicha ustunlarga
 * bo'linadi ("nima qilinishi kerak"), bu yerda esa LOYIHA bo'yicha
 * ("qaysi loyihada nima bor"). Loyihaga kirish yo'li ham shu: vazifa
 * ochiladi, uning sarlavhasida loyiha nomi havola bo'lib turadi.
 */
function MyProjectTasks() {
  const fid = useId();
  const { meta } = useAuth();
  const [f, setF] = useState({ search: "", period: "", due: "", status: "" });

  const set = (k: keyof typeof f, v: string) =>
    // Davr va aniq sana bir-birini almashtiradi - ikkovi birga turgan
    // ekranda "qaysi biri ishlayapti?" degan savol tug'ilardi.
    setF((prev) => ({
      ...prev,
      [k]: v,
      ...(k === "period" ? { due: "" } : {}),
      ...(k === "due" ? { period: "" } : {}),
    }));

  // Qidiruv va muddat kesimi serverda (`/my-work/`), holat esa shu yerda:
  // javob allaqachon holatlarga bo'lingan holda keladi. Loyiha bo'yicha
  // filtr yo'q - ro'yxatning O'ZI loyihalarga bo'lingan.
  const { data, error, loading } = useFetch<MyWorkData>(
    "/my-work/", { search: f.search, period: f.period, due: f.due }, { debounceMs: 300 });

  const groups = useMemo(() => {
    if (!data) return null;
    const color = new Map(data.projects.map((p) => [p.id, p.color]));
    const rows = new Map<number, { name: string; color: string; tasks: Task[] }>();
    data.groups
      .filter((g) => !f.status || g.status === f.status)
      .forEach((g) => g.tasks.forEach((t) => {
        const row = rows.get(t.project)
          || { name: t.project_name, color: color.get(t.project) || "var(--accent)", tasks: [] };
        row.tasks.push(t);
        rows.set(t.project, row);
      }));
    // Ko'p ish turgan loyiha tepada - odam kunini o'sha yerdan boshlaydi.
    return [...rows.entries()].sort((a, b) => b[1].tasks.length - a[1].tasks.length);
  }, [data, f.status]);

  const total = (groups || []).reduce((n, [, g]) => n + g.tasks.length, 0);
  const dirty = Boolean(f.search || f.period || f.due || f.status);

  return (
    <>
      <PageHead
        title={<strong>{tx("projects.vazifalarim")}</strong>}
        actions={!!total && <span className="badge">{total} {tx("projects.ta_vazifa")}</span>}
      />
      {/* Filtr qatori «Vazifalar» sahifasidagi bilan bir xil: qidiruv
          chapda, tanlovlar o'ngda. Shu sabab `wl` sinfi ham shu yerda -
          o'lchamlar bitta joyda yozilgan. */}
      <div className="content wl">
        <ErrorMsg error={error} />

        <div className="filters">
          <div className="f wl-search">
            <label htmlFor={`${fid}-q`}>{tx("common.qidiruv")}</label>
            {/* Vazifa nomi, tavsifi, kodi yoki LOYIHA nomi bo'yicha -
                «Vazifalar» sahifasidagi bilan bir xil qoidadan
                (`task_search_q`). */}
            <input id={`${fid}-q`} value={f.search} onChange={(e) => set("search", e.target.value)}
                   placeholder={tx("projects.vazifa_kod_hir_75_yoki")} />
          </div>
          <div className="wl-filters">
            <div className="f">
              <label htmlFor={`${fid}-r`}>{tx("common.davr")}</label>
              <select id={`${fid}-r`} value={f.period} onChange={(e) => set("period", e.target.value)}>
                <option value="">{tx("projects.barcha_muddatlar")}</option>
                {DUE_PERIODS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="f wl-date">
              <label htmlFor={`${fid}-d`}>{tx("common.sana")}</label>
              <DateField id={`${fid}-d`} value={f.due} onChange={(v) => set("due", v)} />
            </div>
            <div className="f">
              <label htmlFor={`${fid}-s`}>{tx("common.holat")}</label>
              {/* Bu yerda standart - HAMMASI: odam o'z bajarganini ham
                  ko'rib turadi («Vazifalar» sahifasi boshqacha: u menejerga
                  "hozir nima bo'layapti" ni ko'rsatadi). */}
              <select id={`${fid}-s`} value={f.status} onChange={(e) => set("status", e.target.value)}>
                <option value="">{tx("projects.barcha_holatlar")}</option>
                {(meta?.task_status || []).map((s) => (
                  <option key={s.value} value={String(s.value)}>{s.label}</option>
                ))}
              </select>
            </div>
            {dirty && (
              <button type="button" className="btn btn-ghost"
                      onClick={() => setF({ search: "", period: "", due: "", status: "" })}>
                {tx("common.tozalash")}
              </button>
            )}
          </div>
        </div>

        {loading ? <Loading /> : !groups ? null : !groups.length ? (
          <div className="card">
            <Empty icon="☐"
                   title={dirty ? tx("projects.bu_kesimda_vazifa_yoq") : tx("projects.sizga_hali_vazifa_biriktirilmagan")}
                   text={dirty
                     ? tx("projects.tanlangan_kesim_boyicha_sizda_ish")
                     : tx("projects.menejer_vazifa_berganda_u_shu")}>
              {dirty ? (
                <button className="btn"
                        onClick={() => setF({ search: "", period: "", due: "", status: "" })}>
                  {tx("common.filtrni_tozalash")}
                </button>
              ) : (
                <Link className="btn btn-primary" to="/qoshilish">{tx("projects.loyiha_topish")}</Link>
              )}
            </Empty>
          </div>
        ) : (
          groups.map(([id, g]) => (
            <div className="card mb" key={id}>
              <div className="card-head">
                <span className="lang-dot" style={{ background: g.color }} />
                {/* Loyiha nomi ham havola: vazifasiz ham loyihaning
                    o'ziga kirish yo'li ochiq qolsin. */}
                <h3><Link {...toProject(id)} className="wl-name">{g.name}</Link></h3>
                <span className="badge">{g.tasks.length} {tx("common.ta")}</span>
                <span className="spacer" />
                <Link className="btn btn-sm" {...toProject(id)}>{tx("projects.loyihaga_kirish")}</Link>
              </div>
              <div className="card-body wl-tasks">
                {g.tasks.map((t) => (
                  <Link className={`tline ${t.is_overdue ? "overdue" : ""}`} {...toTask(t.id)} key={t.id}>
                    <span className="tline-code mono muted">{t.code}</span>
                    <span className="tline-title">{t.title}</span>
                    {t.due_date && (
                      <span className={t.is_overdue ? "badge badge-danger" : "wl-due"}>
                        <IconCalendar size={11} /> {fmtDate(t.due_date)}
                      </span>
                    )}
                    <span className="badge">{t.status_display}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
