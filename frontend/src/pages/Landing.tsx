import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import {
  IconBoard, IconFile, IconHistory, IconReview, IconSearch, IconTasks, IconUsers,
  IconWorkspace,
} from "@/components/icons";

const FEATURES = [
  { cls: "", ico: <IconWorkspace size={20} />, h: "Loyihalar",
    p: "Har bir loyihada oz kaliti (PAY-12), kanban doskasi, jamoasi va ozgarmas tarixi bor." },
  { cls: "g", ico: <IconUsers size={20} />, h: "Mutaxassislik boyicha qoshilish",
    p: "Royxatdan otishda mutaxassislik tanlanadi. Tizim sizga mos loyihalarni korsatadi va menejer mos odamni tanlaydi." },
  { cls: "p", ico: <IconBoard size={20} />, h: "Kanban doska",
    p: "Vazifalarni surib kochiring. Har bir karta prioritet, muddat va ijrochilarni korsatadi. Ruxsatsiz harakat toxtatiladi." },
  { cls: "y", ico: <IconTasks size={20} />, h: "Koplab vazifa berish",
    p: "Har qatorga bitta vazifa yozing - 20 ta task bir zumda yaratilib, mos mutaxassislar orasida taqsimlanadi." },
  { cls: "g", ico: <IconReview size={20} />, h: "Admin tekshiruvi",
    p: "Bajarilgan ish tekshiruv navbatiga tushadi. Admin qabul qiladi yoki izoh bilan qaytaradi - izohsiz qaytarish taqiqlangan." },
  { cls: "r", ico: <IconHistory size={20} />, h: "Ozgarmas tarix",
    p: "Kim, qachon, nima qilgani yozib boriladi. Statuslar, tekshiruvlar, ish jurnallari - hech biri ochirilmaydi." },
  { cls: "", ico: <IconFile size={20} />, h: "Vazifaga fayl biriktirish",
    p: "Skrinshot, hujjat, log yoki arxivni vazifa ostiga sudrab tashlang. Rasmlar darrov korinadi." },
];

/** Raqam kelmaguncha - chiziqcha. Yolg'on raqam ko'rsatmaymiz. */
function num(value?: number | null) {
  return typeof value === "number" ? value.toLocaleString("uz-UZ") : "—";
}

const FLOW = [
  { n: 1, h: "Dasturchi qoshiladi",
    p: "Royxatdan otadi, mutaxassisligini tanlaydi va mos loyihaga sorov yuboradi. Qabul qilingach Loyihaga kirish sahifasini oqiydi." },
  { n: 2, h: "Menejer taqsimlaydi",
    p: "Sorovni tasdiqlaydi, rol beradi, vazifa yaratadi va mos mutaxassislarni biriktiradi." },
  { n: 3, h: "Ish bajariladi",
    p: "Dasturchi taskni Jarayonda holatiga oladi, ish jurnaliga nima qilganini yozadi va tekshiruvga yuboradi." },
  { n: 4, h: "Admin tekshiradi",
    p: "Qabul qiladi yoki aniq izoh bilan tuzatishga qaytaradi. Har bir aylana tarixda saqlanadi." },
];

interface PublicStats {
  projects: number;
  workspaces: number;
  people: number;
  tasks_done: number;
}

export default function Landing() {
  const nav = useNavigate();
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
            <Logo size={30} /> <span>TeamFlow</span>
          </Link>
          <nav className="lp-nav">
            <a href="#imkoniyatlar">Imkoniyatlar</a>
            <a href="#oqim">Ish oqimi</a>
            <a href="#tarix">Loyiha tarixi</a>
          </nav>
          <span className="spacer" />
          <form
            className="gh-search"
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/qidiruv?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <IconSearch size={14} />
            <input ref={searchInput} type="search" value={q} placeholder="Loyiha qidirish…"
                   onChange={(e) => setQ(e.target.value)} />
            <kbd>/</kbd>
          </form>
          <ThemeToggle />
          <Link className="btn" to="/kirish">Kirish</Link>
          <Link className="btn btn-primary" to="/royxatdan-otish">Royxatdan otish</Link>
        </div>
      </header>

      <div className="hero">
        <div className="lp-wrap">
          <span className="pill"><span className="dot" /> Loyiha · Vazifa · Tekshiruv · Tarix</span>
          <h1>Jamoangiz bir joyda<br />ishlaydigan platforma</h1>
          <p className="lead">
            Loyiha oching, jamoani mutaxassisligi boyicha qabul qiling, vazifa taqsimlang va
            bajarilganini tekshiring. Har bir harakat tarixda qoladi — yangi dasturchi kelganda
            hech narsa yoqolmaydi.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-lg btn-primary" to="/royxatdan-otish">Bepul boshlash</Link>
            <Link className="btn btn-lg" to="/kirish">Hisobga kirish</Link>
          </div>
          <div className="mono muted" style={{ marginTop: 18, fontSize: 13 }}>
            Django REST + React TypeScript + IBM Db2 + Docker
          </div>

          <div className="terminal">
            <div className="terminal-bar">
              <span className="d" style={{ background: "#f85149" }} />
              <span className="d" style={{ background: "#d29922" }} />
              <span className="d" style={{ background: "#3fb950" }} />
              <span className="mono muted" style={{ marginLeft: 10 }}>teamflow — docker</span>
            </div>
            <pre>
<span className="c-gray">$</span> docker compose up --build{"\n\n"}
<span className="c-green">==&gt;</span> Db2 tayyor{"\n"}
<span className="c-green">==&gt;</span> Migratsiyalar qollandi        <span className="c-gray">backend</span>{"\n"}
<span className="c-green">==&gt;</span> Admin yaratildi              <span className="c-blue">admin@teamflow.uz</span>{"\n"}
<span className="c-purple">==&gt;</span> API                          <span className="c-blue">http://localhost:8010/api</span>{"\n"}
<span className="c-purple">==&gt;</span> Interfeys                    <span className="c-blue">http://localhost:5183</span>
            </pre>
          </div>
        </div>
      </div>

      <section className="lp-section" id="imkoniyatlar">
        <div className="lp-wrap">
          <div className="sec-head">
            <div className="eyebrow">Imkoniyatlar</div>
            <h2>Loyihani boshqarish uchun kerak bolgan hamma narsa</h2>
            <p>Vazifa doskasidan tortib tekshiruv navbati va toliq tarixgacha.</p>
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
            <div className="eyebrow">Ish oqimi</div>
            <h2>Kim nima qiladi — aniq chegaralar</h2>
            <p>Rollar aralashmaydi, shuning uchun hech kim ortiqcha vaqt sarflamaydi.</p>
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
            <div className="eyebrow">Loyiha tarixi</div>
            <h2>Yangi dasturchi 10 daqiqada kontekstga kiradi</h2>
            <p>Avvalgi dasturchilar nima qilgani, qanday qaror qabul qilingani va qayerda
               xato qilingani — hammasi bitta sahifada.</p>
          </div>
          <div className="demo">
            <div className="demo-head">
              <span className="mono muted">teamflow /</span>
              <span>Tolov tizimi</span>
              <span className="badge badge-ok">Faol</span>
            </div>
            <div className="demo-body">
              <div className="ev">
                <span className="avatar sm" style={{ background: "#6c5ce7" }}>JQ</span>
                <span className="txt"><b>Jahongir</b> <span className="mono c-blue">PAY-14</span> vazifasini tekshiruvga yubordi{" "}
                  <span className="badge badge-brand">Tekshiruvda</span></span>
                <span className="time">2 daqiqa oldin</span>
              </div>
              <div className="ev">
                <span className="avatar sm" style={{ background: "#238636" }}>AD</span>
                <span className="txt"><b>Admin</b> <span className="mono c-blue">PAY-13</span> ni tuzatishga qaytardi{" "}
                  <span className="badge badge-warn">Tuzatish kerak</span><br />
                  <span className="muted">Webhook imzosi tekshirilmagan — qayta urinish logikasini qoshing</span>
                </span>
                <span className="time">1 soat oldin</span>
              </div>
              <div className="ev">
                <span className="avatar sm" style={{ background: "#d29922" }}>SB</span>
                <span className="txt"><b>Sardor</b> ish jurnaliga yozdi: <span className="mono">3.5 soat</span><br />
                  <span className="muted">Idempotentlik kaliti qoshildi, Redis emas DB tanlandi — sabab: tranzaksiya kerak</span>
                </span>
                <span className="time">Kecha</span>
              </div>
              <div className="ev">
                <span className="avatar sm" style={{ background: "#2f81f7" }}>MK</span>
                <span className="txt"><b>Malika</b> <span className="mono c-blue">PAY-11</span> vazifasini yakunladi{" "}
                  <span className="badge badge-ok">Bajarildi</span></span>
                <span className="time">3 kun oldin</span>
              </div>
            </div>
          </div>

          <div className="lp-cards" style={{ marginTop: 20 }}>
            <div className="lp-card">
              <h3>Dasturchi hisoboti</h3>
              <p>Har bir odam boyicha: nechta task bajargan, necha soat sarflagan,
                 qaysi tasklari qaytarilgan va nima yozib qoldirgan.</p>
            </div>
            <div className="lp-card">
              <h3>Loyiha brifi</h3>
              <p>Maqsad, texnologiyalar, arxitektura, ishga tushirish qadamlari,
                 kelishuvlar va ehtiyot boling royxati.</p>
            </div>
            <div className="lp-card">
              <h3>Topshiriq eslatmasi</h3>
              <p>Dasturchi loyihadan chiqishda keyingi odam uchun izoh qoldiradi —
                 bilim jamoada qoladi.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-stats">
            <div>
              <div className="v c-blue">{num(stats?.projects)}</div>
              <div className="k">ochiq loyiha</div>
            </div>
            <div>
              <div className="v c-green">{num(stats?.people)}</div>
              <div className="k">royxatdan otgan odam</div>
            </div>
            <div>
              <div className="v c-purple">{num(stats?.tasks_done)}</div>
              <div className="k">bajarilgan vazifa</div>
            </div>
            <div>
              <div className="v" style={{ color: "var(--attention)" }}>{num(specialtyCount)}</div>
              <div className="k">mutaxassislik yonalishi</div>
            </div>
          </div>
        </div>
      </section>

      <div className="cta">
        <div className="lp-wrap">
          <h2>Bugundan boshlang</h2>
          <p>Akkaunt yarating, mutaxassisligingizni tanlang va loyihaga qoshiling.</p>
          <div className="hero-actions">
            <Link className="btn btn-lg btn-primary" to="/royxatdan-otish">Royxatdan otish</Link>
            <Link className="btn btn-lg" to="/kirish">Kirish</Link>
          </div>
        </div>
      </div>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <Logo size={24} />
          <span>© TeamFlow</span>
          <span className="spacer" />
          <span className="mono">Django · React · IBM Db2 · Docker</span>
        </div>
      </footer>
    </>
  );
}
