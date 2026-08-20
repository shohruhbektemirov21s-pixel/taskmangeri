import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { Activity, Project, Task, UserBrief } from "@/api/types";
import Timeline from "@/components/Timeline";
import { Avatar, Card, Empty, Priority, SpecialtyTag, Stat, StatusBadge, fmtDate } from "@/components/ui";
import { toDeveloper, toProject, toTask } from "@/nav";
import { tx } from "@/i18n";

export default function Overview({ project, onChange }: { project: Project; onChange: () => void }) {
  const [feed, setFeed] = useState<Activity[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  // Ochilgan mutaxassislik: «Frontend dasturchi» bosilsa - kimligi ko'rinsin.
  const [openSpec, setOpenSpec] = useState<string | null>(null);

  /**
   * Jamoa a'zolari mutaxassislik bo'yicha guruhlangan.
   *
   * Qo'shimcha so'rov YO'Q: `project.members` loyiha bilan birga keladi
   * (`ProjectDetailSerializer.get_members`), shuning uchun ro'yxat shu
   * yerda yig'iladi. Aks holda har bir mutaxassislik uchun alohida
   * so'rov ketardi.
   */
  const bySpecialty = useMemo(() => {
    const map = new Map<string, UserBrief[]>();
    for (const m of project.members || []) {
      const key = m.user.specialty || "";
      const list = map.get(key);
      if (list) list.push(m.user);
      else map.set(key, [m.user]);
    }
    return map;
  }, [project.members]);

  useEffect(() => {
    // Ikkovi ham yordamchi ro'yxat: kelmasa sahifa baribir ishlaydi,
    // shuning uchun xato bo'sh ro'yxatga aylanadi va konsolga chiqadi.
    let alive = true;
    void api.get<any>("/activity/", { project: project.id, page_size: 12 })
      .then((d) => { if (alive) setFeed(d.results || []); })
      .catch(() => { if (alive) setFeed([]); });
    void api.get<any>("/tasks/", { project: project.id, assignee: "me", open: "1", page_size: 6 })
      .then((d) => { if (alive) setMyTasks(d.results || []); })
      .catch(() => { if (alive) setMyTasks([]); });
    return () => { alive = false; };
  }, [project.id]);

  const c = project.status_counts || {};
  const tasksUrl = (status: string) =>
    toProject(project.id, "vazifalar", `status=${status}`);

  return (
    <div className="split">
      <div>
        {/* Raqamlar bosiladi: «Nazoratda 1» ni bosgan odam o'sha bitta
            vazifani ko'rishi kerak, uni vazifalar ro'yxatidan qo'lda
            qidirib emas. Har katak o'z holati bilan filtrlangan ro'yxatni
            ochadi - filtr manzilda emas, sahifa holatida uzatiladi. */}
        <div className="grid grid-4 mb">
          <Stat value={c.TODO || 0} label={tx("common.nazoratda")} tone="accent"
                to={tasksUrl("TODO")} title={tx("project_overview.nazoratdagi_vazifalarni_korish")} />
          <Stat value={c.IN_PROGRESS || 0} label={tx("common.jarayonda")} tone="warn"
                to={tasksUrl("IN_PROGRESS")} title={tx("project_overview.jarayondagi_vazifalarni_korish")} />
          <Stat value={c.IN_REVIEW || 0} label={tx("common.tekshiruvda")} tone="done"
                to={tasksUrl("IN_REVIEW")} title={tx("project_overview.tekshiruvda_turgan_vazifalarni_korish")} />
          <Stat value={c.DONE || 0} label={tx("common.bajarildi")} tone="ok"
                to={tasksUrl("DONE")} title={tx("project_overview.bajarilgan_vazifalarni_korish")} />
        </div>

        {project.description && (
          <Card title={tx("common.loyiha_haqida")}>
            <p className="pre-wrap">{project.description}</p>
            <div className="row wrap" style={{ gap: 8 }}>
              {project.repo_url && <a className="btn btn-sm" href={project.repo_url} target="_blank" rel="noreferrer">{tx("project_overview.repozitoriy")}</a>}
              {project.docs_url && <a className="btn btn-sm" href={project.docs_url} target="_blank" rel="noreferrer">{tx("common.hujjatlar")}</a>}
              <Link className="btn btn-sm" {...toProject(project.id, "kirish")}>{tx("project_overview.loyihaga_kirish_qollanmasi")}</Link>
            </div>
          </Card>
        )}

        {myTasks.length > 0 && (
          <Card title={tx("project_overview.sizning_ochiq_vazifalaringiz")} padded={false}>
            <div className="table-wrap"><table className="table">
              <tbody>
                {myTasks.map((t) => (
                  <tr key={t.id}>
                    <td className="mono muted nowrap">{t.code}</td>
                    <td><Link {...toTask(t.id)}>{t.title}</Link></td>
                    <td><StatusBadge task={t} /></td>
                    <td className="right"><Priority task={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        )}

        <Card title={tx("project_overview.songgi_harakatlar")}
              action={<Link className="btn btn-sm" {...toProject(project.id, "tarix")}>{tx("project_overview.toliq_tarix")}</Link>}>
          <Timeline items={feed} showProject={false} />
        </Card>
      </div>

      <div>
        {/* Jamoa o'ttizdan ortiq odam bo'lishi mumkin - ochiq holda u
            o'ng ustunni cho'zib, «Jamoa tarkibi» va «Ma'lumotlar»ni
            ekrandan chiqarib yuborardi. Sanoq nishonda ko'rinadi. */}
        <Card title={tx("common.jamoa")} padded={false} collapsible defaultOpen={false}
              badge={<span className="badge">{(project.members || []).length}</span>}
              action={<Link className="btn btn-sm" {...toProject(project.id, "jamoa")}>{tx("project_overview.boshqarish")}</Link>}>
          <div className="card-list">
            {(project.members || []).map((m) => (
              <div className="card-body tight row" key={m.id}>
                <Avatar user={m.user} />
                <div style={{ minWidth: 0 }}>
                  <Link {...toDeveloper(project.id, m.user.id)}>{m.user.full_name}</Link>
                  <br />
                  <small className="muted">{m.role_display} · {m.user.specialty_display}</small>
                </div>
                <span className="spacer" />
              </div>
            ))}
            {!(project.members || []).length && <Empty title={tx("project_overview.jamoa_bosh")} />}
          </div>
        </Card>

        <Card title={tx("project_overview.jamoa_tarkibi")}>
          {project.team_composition?.length ? (
            <div className="stack">
              {project.team_composition.map((t) => {
                const people = bySpecialty.get(t.value) || [];
                const open = openSpec === t.value;
                return (
                  <div key={t.value}>
                    {/* Qator bosiladi: «Frontend dasturchi 1» degani kim
                        ekanini aytmaydi - ochilganda ism-familiya chiqadi.
                        Ro'yxat bo'sh bo'lsa qator oddiy matn bo'lib qoladi
                        (bosiladigandek ko'rinib, hech narsa ochmasin). */}
                    {people.length ? (
                      <button type="button" className={`spec-row ${open ? "open" : ""}`}
                              aria-expanded={open}
                              onClick={() => setOpenSpec(open ? null : t.value)}>
                        <span>{t.label}</span>
                        <span className="spacer" />
                        <span className="badge">{t.count}</span>
                        <span className="spec-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
                      </button>
                    ) : (
                      <div className="row spec-row static">
                        <span>{t.label}</span>
                        <span className="spacer" />
                        <span className="badge">{t.count}</span>
                      </div>
                    )}

                    {open && (
                      <div className="spec-people">
                        {people.map((u) => (
                          <Link className="spec-person" key={u.id} {...toDeveloper(project.id, u.id)}>
                            <Avatar user={u} size="sm" />
                            <span className="spec-person-text">
                              <strong>{u.full_name}</strong>
                              {u.seniority_display && (
                                <small className="muted">{u.seniority_display}</small>
                              )}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">{tx("project_overview.malumot_yoq")}</p>}
        </Card>

        <Card title={tx("project_overview.malumotlar")}>
          <ul className="list-plain" style={{ fontSize: 13 }}>
            <li><span className="muted">{tx("common.menejer")}</span> {project.manager?.full_name || "—"}</li>
            <li><span className="muted">{tx("project_overview.muddat")}</span> {fmtDate(project.due_date)}</li>
            {project.access.can_manage && (
              <li><span className="muted">{tx("project_overview.qoshilish_kodi")}</span> <code>{project.join_code}</code></li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
