import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import {
  IconBoard, IconFile, IconHistory, IconReview, IconSearch, IconTasks, IconUsers,
  IconWorkspace,
} from "@/components/icons";
import { toSearch, useGo } from "@/nav";
import { tx } from "@/i18n";

const FEATURES = [
  { cls: "", ico: <IconWorkspace size={20} />, h: tx("common.loyihalar"),
    p: tx("landing.har_bir_loyihada_oz_kaliti") },
  { cls: "g", ico: <IconUsers size={20} />, h: tx("landing.mutaxassislik_boyicha_qoshilish"),
    p: tx("landing.royxatdan_otishda_mutaxassislik_tanlanadi_ti") },
  { cls: "p", ico: <IconBoard size={20} />, h: tx("landing.kanban_doska"),
    p: tx("landing.vazifalarni_surib_kochiring_har_bir") },
  { cls: "y", ico: <IconTasks size={20} />, h: tx("landing.koplab_vazifa_berish"),
    p: tx("landing.har_qatorga_bitta_vazifa_yozing") },
  { cls: "g", ico: <IconReview size={20} />, h: tx("landing.admin_tekshiruvi"),
    p: tx("landing.bajarilgan_ish_tekshiruv_navbatiga_tushadi") },
  { cls: "r", ico: <IconHistory size={20} />, h: tx("landing.ozgarmas_tarix"),
    p: tx("landing.kim_qachon_nima_qilgani_yozib") },
  { cls: "", ico: <IconFile size={20} />, h: tx("landing.vazifaga_fayl_biriktirish"),
    p: tx("landing.skrinshot_hujjat_log_yoki_arxivni") },
];

/** Raqam kelmaguncha - chiziqcha. Yolg'on raqam ko'rsatmaymiz. */
function num(value?: number | null) {
  return typeof value === "number" ? value.toLocaleString("uz-UZ") : "—";
}

const FLOW = [
  { n: 1, h: tx("landing.dasturchi_qoshiladi"),
    p: tx("landing.royxatdan_otadi_mutaxassisligini_tanlaydi_va") },
  { n: 2, h: tx("landing.menejer_taqsimlaydi"),
    p: tx("landing.sorovni_tasdiqlaydi_rol_beradi_vazifa") },
  { n: 3, h: tx("landing.ish_bajariladi"),
    p: tx("landing.dasturchi_taskni_jarayonda_holatiga_oladi") },
  { n: 4, h: tx("landing.admin_tekshiradi"),
    p: tx("landing.qabul_qiladi_yoki_aniq_izoh") },
];

interface PublicStats {
  projects: number;
  workspaces: number;
  people: number;
  tasks_done: number;
}

export default function Landing() {
  const go = useGo();
  const [q, setQ] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  // Raqamlar qo'lda yozilmaydi - ochiq endpointdan olinadi, hisobsiz ham ishlaydi.
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [specialtyCount, setSpecialtyCount] = useState<number | null>(null);

  useEffect(() => {
    void api.get<PublicStats>("/public/stats/").then(setStats).catch(() => setStats(null));
    void api.get<{ specialties: unknown[] }>("/auth/specialties/")
      .then((d) => setSpecialtyCount((d.specialties || []).length))
      .catch(() => setSpecialtyCount(null));
  }, []);

  // "/" bosilganda qidiruv ochiladi - headerdagi ishora shuni va'da qiladi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="lp-header">
        <div className="lp-wrap">
          <Link to="/" className="logo-link" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text)", fontWeight: 600 }}>
            <Logo size={30} /> <span>{tx("common.teamflow")}</span>
          </Link>
          <nav className="lp-nav">
            <a href="#imkoniyatlar">{tx("landing.imkoniyatlar")}</a>
            <a href="#oqim">{tx("landing.ish_oqimi")}</a>
            <a href="#tarix">{tx("landing.loyiha_tarixi")}</a>
          </nav>
          <span className="spacer" />
          <form
            className="gh-search"
            onSubmit={(e) => {
              e.preventDefault();
              go(toSearch(q.trim()));
            }}
          >
            <IconSearch size={14} />
            <input ref={searchInput} type="search" value={q} placeholder={tx("landing.loyiha_qidirish")}
                   onChange={(e) => setQ(e.target.value)} />
            <kbd>/</kbd>
          </form>
          <ThemeToggle />
          <Link className="btn" to="/kirish">{tx("common.kirish")}</Link>
          <Link className="btn btn-primary" to="/royxatdan-otish">{tx("landing.royxatdan_otish")}</Link>
        </div>
      </header>

      <div className="hero">
        <div className="lp-wrap">
          <span className="pill"><span className="dot" /> {tx("landing.loyiha_vazifa_tekshiruv_tarix")}</span>
          <h1>{tx("landing.jamoangiz_bir_joyda")}<br />{tx("landing.ishlaydigan_platforma")}</h1>
          <p className="lead">
            {tx("landing.loyiha_oching_jamoani_mutaxassisligi_boyicha")}
          </p>
          <div className="hero-actions">
            <Link className="btn btn-lg btn-primary" to="/royxatdan-otish">{tx("landing.bepul_boshlash")}</Link>
            <Link className="btn btn-lg" to="/kirish">{tx("landing.hisobga_kirish")}</Link>
          </div>
          <div className="mono muted" style={{ marginTop: 18, fontSize: 13 }}>
            {tx("landing.django_rest_react_typescript_ibm")}
          </div>

          <div className="terminal">
            <div className="terminal-bar">
              <span className="d" style={{ background: "#f85149" }} />
              <span className="d" style={{ background: "#d29922" }} />
              <span className="d" style={{ background: "#3fb950" }} />
              <span className="mono muted" style={{ marginLeft: 10 }}>{tx("landing.teamflow_docker")}</span>
            </div>
            <pre>
<span className="c-gray">$</span> {tx("landing.docker_compose_up_build")}{"\n\n"}
<span className="c-green">==&gt;</span> {tx("landing.db2_tayyor")}{"\n"}
<span className="c-green">==&gt;</span> {tx("landing.migratsiyalar_qollandi")}        <span className="c-gray">{tx("landing.backend")}</span>{"\n"}
<span className="c-green">==&gt;</span> {tx("landing.admin_yaratildi")}              <span className="c-blue">{tx("landing.admin_teamflow_uz")}</span>{"\n"}
<span className="c-purple">==&gt;</span> {tx("landing.api")}                          <span className="c-blue">{tx("landing.http_localhost_8010_api")}</span>{"\n"}
<span className="c-purple">==&gt;</span> {tx("landing.interfeys")}                    <span className="c-blue">{tx("landing.http_localhost_5183")}</span>
            </pre>
          </div>
        </div>
      </div>

      <section className="lp-section" id="imkoniyatlar">
        <div className="lp-wrap">
          <div className="sec-head">
            <div className="eyebrow">{tx("landing.imkoniyatlar")}</div>
            <h2>{tx("landing.loyihani_boshqarish_uchun_kerak_bolgan")}</h2>
            <p>{tx("landing.vazifa_doskasidan_tortib_tekshiruv_navbati")}</p>
          </div>
          <div className="lp-cards">
            {FEATURES.map((f) => (
              <div className={`lp-card ${f.cls}`} key={f.h}>
                <div className="ico">{f.ico}</div>
                <h3>{f.h}</h3>
                <p>{f.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="oqim">
        <div className="lp-wrap">
          <div className="sec-head">
            <div className="eyebrow">{tx("landing.ish_oqimi")}</div>
            <h2>{tx("landing.kim_nima_qiladi_aniq_chegaralar")}</h2>
            <p>{tx("landing.rollar_aralashmaydi_shuning_uchun_hech")}</p>
          </div>
          <div className="flow">
            {FLOW.map((s) => (
              <div className="step" key={s.n}>
                <div className="n">{s.n}</div>
                <h4>{s.h}</h4>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="tarix">
        <div className="lp-wrap">
          <div className="sec-head">
            <div className="eyebrow">{tx("landing.loyiha_tarixi")}</div>
            <h2>{tx("landing.yangi_dasturchi_10_daqiqada_kontekstga")}</h2>
            <p>{tx("landing.avvalgi_dasturchilar_nima_qilgani_qanday")}</p>
          </div>
          <div className="demo">
            <div className="demo-head">
              <span className="mono muted">{tx("landing.teamflow_2")}</span>
              <span>{tx("landing.tolov_tizimi")}</span>
              <span className="badge badge-ok">{tx("landing.faol")}</span>
            </div>
            <div className="demo-body">
              <div className="ev">
                <span className="avatar sm" style={{ background: "#6c5ce7" }}>{tx("landing.jq")}</span>
                <span className="txt"><b>{tx("landing.jahongir")}</b> <span className="mono c-blue">{tx("landing.pay_14")}</span> {tx("landing.vazifasini_tekshiruvga_yubordi")}{" "}
                  <span className="badge badge-brand">{tx("common.tekshiruvda")}</span></span>
                <span className="time">{tx("landing.2_daqiqa_oldin")}</span>
              </div>
              <div className="ev">
                <span className="avatar sm" style={{ background: "#238636" }}>{tx("landing.ad")}</span>
                <span className="txt"><b>{tx("landing.admin")}</b> <span className="mono c-blue">{tx("landing.pay_13")}</span> {tx("landing.ni_tuzatishga_qaytardi")}{" "}
                  <span className="badge badge-warn">{tx("landing.tuzatish_kerak")}</span><br />
                  <span className="muted">{tx("landing.webhook_imzosi_tekshirilmagan_qayta_urinish")}</span>
                </span>
                <span className="time">{tx("landing.1_soat_oldin")}</span>
              </div>
              <div className="ev">
                <span className="avatar sm" style={{ background: "#d29922" }}>{tx("landing.sb")}</span>
                <span className="txt"><b>{tx("landing.sardor")}</b> {tx("landing.ish_jurnaliga_yozdi")} <span className="mono">{tx("landing.3_5_soat")}</span><br />
                  <span className="muted">{tx("landing.idempotentlik_kaliti_qoshildi_redis_emas")}</span>
                </span>
                <span className="time">{tx("landing.kecha")}</span>
              </div>
              <div className="ev">
                <span className="avatar sm" style={{ background: "#2f81f7" }}>{tx("landing.mk")}</span>
                <span className="txt"><b>{tx("landing.malika")}</b> <span className="mono c-blue">{tx("landing.pay_11")}</span> {tx("landing.vazifasini_yakunladi")}{" "}
                  <span className="badge badge-ok">{tx("common.bajarildi")}</span></span>
                <span className="time">{tx("landing.3_kun_oldin")}</span>
              </div>
            </div>
          </div>

          <div className="lp-cards" style={{ marginTop: 20 }}>
            <div className="lp-card">
              <h3>{tx("landing.dasturchi_hisoboti")}</h3>
              <p>{tx("landing.har_bir_odam_boyicha_nechta")}</p>
            </div>
            <div className="lp-card">
              <h3>{tx("landing.loyiha_arxitekturasi")}</h3>
              <p>{tx("landing.maqsad_texnologiyalar_arxitektura_ishga_tush")}</p>
            </div>
            <div className="lp-card">
              <h3>{tx("landing.topshiriq_eslatmasi")}</h3>
              <p>{tx("landing.dasturchi_loyihadan_chiqishda_keyingi_odam")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-stats">
            <div>
              <div className="v c-blue">{num(stats?.projects)}</div>
              <div className="k">{tx("landing.ochiq_loyiha")}</div>
            </div>
            <div>
              <div className="v c-green">{num(stats?.people)}</div>
              <div className="k">{tx("landing.royxatdan_otgan_odam")}</div>
            </div>
            <div>
              <div className="v c-purple">{num(stats?.tasks_done)}</div>
              <div className="k">{tx("landing.bajarilgan_vazifa")}</div>
            </div>
            <div>
              <div className="v" style={{ color: "var(--attention)" }}>{num(specialtyCount)}</div>
              <div className="k">{tx("landing.mutaxassislik_yonalishi")}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="cta">
        <div className="lp-wrap">
          <h2>{tx("landing.bugundan_boshlang")}</h2>
          <p>{tx("landing.akkaunt_yarating_mutaxassisligingizni_tanlan")}</p>
          <div className="hero-actions">
            <Link className="btn btn-lg btn-primary" to="/royxatdan-otish">{tx("landing.royxatdan_otish")}</Link>
            <Link className="btn btn-lg" to="/kirish">{tx("common.kirish")}</Link>
          </div>
        </div>
      </div>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <Logo size={24} />
          <span>{tx("landing.teamflow")}</span>
          <span className="spacer" />
          <span className="mono">{tx("landing.django_react_ibm_db2_docker")}</span>
        </div>
      </footer>
    </>
  );
}
