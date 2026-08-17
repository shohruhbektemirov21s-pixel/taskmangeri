/**
 * Bosh panel — RAQAMLAR paneli.
 *
 * Ilgari bu yerda jamoaning so'nggi harakatlari lentasi va o'z vazifalari
 * ro'yxati turardi. Ikkovi ham boshqa sahifalarda to'liq bor («Umumiy tarix»
 * va «Mening ishim»), panelda esa ekranni to'ldirib, asosiy savolni —
 * «bugun nima qilishim kerak va nima qoldi» — pastga surib yuborardi.
 * Shuning uchun panel qisqartirildi: bugungi kesim, umumiy sanoq va
 * menejer uchun jamoa holati.
 */
import { Link } from "react-router-dom";
import { useFetch } from "@/api/useFetch";
import type { DashboardData } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { useLive } from "@/realtime/RealtimeContext";
import TeamBuilder from "@/components/TeamBuilder";
import {
  Avatar, AvatarStack, Card, Empty, ErrorMsg, Loading, Progress,
  Stat, fmtDate, timeAgo,
} from "@/components/ui";

export default function Dashboard() {
  const { user } = useAuth();
  // Ilgari xato `.catch(() => setD(null))` bilan yutilardi va sahifa abadiy
  // «Panel yuklanmoqda...» da qolardi. Endi sabab ekranga chiqadi.
  const { data: d, error, loading, reload } = useFetch<DashboardData>("/dashboard/");

  // Jonli: vazifa yoki loyiha o'zgarsa panel o'zini yangilaydi.
  useLive((e) => {
    if (e.event === "task.update" || e.event === "project.update") reload();
  });

  if (loading) return <div className="content"><Loading text="Panel yuklanmoqda..." /></div>;
  if (!d) return <div className="content"><ErrorMsg error={error || "Panelni yuklab bo'lmadi."} /></div>;

  // Menejer kesimi faqat loyiha boshqaradigan odamga ko'rinadi.
  const team = d.team;
  const isLead = team.projects > 0;

  const projectsCard = (
    <Card title="Loyihalarim" padded={false}
          action={<Link className="btn btn-sm" to="/qoshilish">Qoshilish</Link>}>
      <div className="card-list">
        {d.my_projects.map((p) => (
          <div className="repo-item" key={p.id}>
            <h3>
              <span className="lang-dot" style={{ background: p.color }} />{" "}
              <Link to={`/loyiha/${p.id}`}>{p.name}</Link>
            </h3>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {p.workspace_name} · <span className="mono">{p.key}</span>
            </div>
            <div style={{ marginTop: 8 }}><Progress value={p.progress} /></div>
            <div className="repo-meta">
              <span>{p.open_tasks} ochiq</span>
              <span>{p.member_count} azo</span>
              <span>menda: {p.my_tasks}</span>
            </div>
          </div>
        ))}
        {!d.my_projects.length && (
          <Empty title="Loyihada emassiz" text="Ochiq loyihaga qoshiling.">
            <Link className="btn btn-primary btn-sm" to="/qoshilish">Loyiha topish</Link>
          </Empty>
        )}
      </div>
    </Card>
  );

  return (
    <div className="content">
      {/* Salomlashuv chapda, bugungi sana o'ngda - dizayndagidek.
          «Yangi loyiha» bu yerdan olib tashlandi: u yuqori paneldagi «+»
          tugmasida ham, «Loyihalar» sahifasida ham bor. */}
      <div className="row wrap mb">
        <div>
          <h1 style={{ margin: 0 }}>Salom, {user?.full_name.split(" ")[0]}</h1>
          <div className="row" style={{ marginTop: 2 }}>
            <span className="muted">{user?.seniority_display}</span>
          </div>
        </div>
        <span className="spacer" />
        {/* BUGUN - panelning asosiy savoli. Muddati bugun yoki o'tib ketgan
            ishlar bitta katakda: kechikkani ham bugungi ish hisoblanadi. */}
        <div className="row" style={{ gap: 8 }}>
          <strong style={{ fontSize: 14 }}>Bugun</strong>
          <span className="muted" style={{ fontSize: 13 }}>{fmtDate(d.today.date)}</span>
        </div>
      </div>

      <div className="grid grid-stats mb">
        <Stat value={d.today.todo} label="Nazoratda" tone="accent"
              to="/mening-ishim" title="Muddati bugun yoki o'tib ketgan ochiq ishlaringiz" />
        <Stat value={d.today.done} label="Bugun bajarildi" tone="ok"
              to="/mening-ishim" title="Bugun yakunlangan ishlaringiz" />
        <Stat value={d.today.review} label="Tekshiruvda" tone="done"
              to="/mening-ishim" title="Bugun topshirgan, javob kutayotgan ishlaringiz" />
      </div>

      {/* Raqamlar bosiladi - "bu 3 ta qayerda?" degan savol qolmasin. */}
      <div className="grid grid-stats mb">
        <Stat value={d.stats.open} label="Ochiq vazifa" tone="accent"
              to="/mening-ishim" title="Nazoratda va jarayondagi ishlaringiz" />
        <Stat value={d.stats.review} label="Tekshiruvda" tone="done"
              to="/mening-ishim" title="Topshirgan, javob kutayotgan ishlaringiz" />
        <Stat value={d.stats.returned} label="Tuzatish kerak" tone="danger"
              to="/mening-ishim" title="Tekshiruvdan qaytarilgan ishlar" />
        <Stat value={d.stats.done_week} label="Shu haftada bajarildi" tone="ok"
              to="/tarix" title="Nima qilganingiz - umumiy tarixda" />
      </div>

      {(d.stats.returned > 0 || d.stats.overdue > 0) && (
        <div className="callout danger mb">
          <strong>Diqqat:</strong>{" "}
          {d.stats.returned > 0 && `${d.stats.returned} ta vazifa tuzatishga qaytarilgan. `}
          {d.stats.overdue > 0 && `${d.stats.overdue} ta vazifa muddati otgan.`}
        </div>
      )}

      {/* MENEJER KESIMI: nechta loyiha, nechta dasturchi va qancha ish
          uning tekshiruvini kutyapti. Pastda esa kim qaysi loyihada va
          qancha ish bilan band - biriktirish shu yerdan ko'rinadi. */}
      {isLead && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Boshqaruvim</h2>
          </div>
          <div className="grid grid-stats mb">
            <Stat value={team.projects} label="Loyihalarim" tone="accent"
                  to="/loyihalar" title="Siz boshqarayotgan loyihalar" />
            <Stat value={team.developers} label="Dasturchilarim"
                  title="Loyihalaringizga biriktirilgan dasturchi va testerlar" />
            <Stat value={team.pending_reviews} label="Tekshirilmagan ish" tone="danger"
                  to="/tekshiruv" title="Topshirilgan, lekin hali tekshirilmagan ishlar" />
          </div>
        </>
      )}

      <div className="split">
        <div>
          {/* Loyihalar ro'yxati menejerda o'ng ustunda (chapda uning jamoasi
              turadi), oddiy foydalanuvchida esa CHAPDA: o'ng ustunda yolg'iz
              qolsa, ekranning chap yarmi bo'm-bo'sh ko'rinardi. */}
          {!isLead && projectsCard}

          {/* Tekshirilmagan ishlar - menejerning navbati. Ro'yxat shu yerda
              turadi: "nechta" raqamidan keyin darrov "qaysilari" kerak. */}
          {isLead && (
            <Card title="Tekshirilmagan ishlar" padded={false}
                  badge={<span className="badge badge-danger">{team.pending_reviews}</span>}
                  action={<Link className="btn btn-sm" to="/tekshiruv">Navbatga otish</Link>}>
              {!d.review_queue.length ? (
                <Empty icon="✓" title="Navbat bosh"
                       text="Tekshiruvni kutayotgan ish yoq." />
              ) : (
                <div className="table-wrap"><table className="table">
                  <tbody>
                    {d.review_queue.map((x) => (
                      <tr key={x.id}>
                        <td className="nowrap mono muted">{x.code}</td>
                        <td>
                          <Link to={`/vazifa/${x.id}`}>{x.title}</Link>
                          <br /><small className="muted">{x.project_name} · {timeAgo(x.submitted_at)}</small>
                        </td>
                        <td className="right"><AvatarStack users={x.assignees} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </Card>
          )}

          {/* Kim qaysi loyihaga biriktirilgan va qancha ish bilan band. */}
          {isLead && (
            <Card title="Jamoam" padded={false}
                  badge={<span className="badge">{team.developers}</span>}>
              {!team.people.length ? (
                <Empty icon="👥" title="Dasturchi yoq"
                       text="Loyihangizga hali dasturchi biriktirilmagan." />
              ) : (
                <div className="table-wrap"><table className="table">
                  <thead>
                    <tr>
                      <th>Odam</th>
                      <th>Loyihalari</th>
                      <th className="right">Ochiq</th>
                      <th className="right">Tekshiruvda</th>
                      <th className="right">Bajargan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.people.map((p) => (
                      <tr key={p.user.id}>
                        <td>
                          <div className="row">
                            <Avatar user={p.user} size="sm" />
                            <div style={{ minWidth: 0 }}>
                              <Link to={`/profil/${p.user.id}`}>{p.user.full_name}</Link>
                              <br /><small className="muted">{p.role_label}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="row wrap" style={{ gap: 6 }}>
                            {/* Loyiha nishoni - shu odamning O'SHA loyihadagi
                                hisoboti: nima qilgan, nima qolgan. */}
                            {p.projects.map((pr) => (
                              <Link key={pr.id} className="badge"
                                    to={`/loyiha/${pr.id}/dasturchi/${p.user.id}`}>
                                <span className="lang-dot" style={{ background: pr.color }} />{" "}
                                {pr.name}
                              </Link>
                            ))}
                          </div>
                        </td>
                        <td className="right">{p.open_tasks}</td>
                        <td className="right">
                          {p.review_tasks > 0
                            ? <span className="badge badge-danger">{p.review_tasks}</span>
                            : 0}
                        </td>
                        <td className="right muted">{p.done_tasks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </Card>
          )}

          {/* Menejer jamoani nol holatdan shu yerda yig'adi: odamni
              qidirib qo'shish, so'rovni qabul qilish, a'zoni chiqarish. */}
          {d.managed_projects.length > 0 && (
            <div className="mb">
              <TeamBuilder projects={d.managed_projects} onChange={reload} />
            </div>
          )}

          {/* Loyihasi yo'q odamga panel bo'm-bo'sh ko'rinmasin. */}
          {!isLead && !d.my_projects.length && (
            <div className="callout mb row wrap">
              <span>
                <strong>Siz hali loyihada emassiz.</strong>{" "}
                <span className="muted">Ochiq loyihaga qo'shiling yoki menejerdan vazifa so'rang.</span>
              </span>
              <span className="spacer" />
              <Link className="btn btn-sm btn-primary" to="/qoshilish">Loyihaga qo'shilish</Link>
            </div>
          )}
        </div>

        <div>
          {isLead && projectsCard}

          {d.managed_projects.length > 0 && (
            <Card title="Boshqarayotganlarim" padded={false}>
              <div className="card-list">
                {d.managed_projects.map((p) => (
                  <div className="card-body tight row" key={p.id}>
                    <span className="lang-dot" style={{ background: p.color }} />
                    <Link to={`/loyiha/${p.id}`}>{p.name}</Link>
                    <span className="spacer" />
                    <Link className="btn btn-sm" to={`/loyiha/${p.id}/koplab-vazifa`}>Task berish</Link>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
