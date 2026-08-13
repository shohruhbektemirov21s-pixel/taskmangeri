import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { Activity, Project, ProjectMember } from "@/api/types";
import Timeline from "@/components/Timeline";
import { Avatar, Card, Loading } from "@/components/ui";

const CATEGORIES = [
  { value: "", label: "Hammasi" },
  { value: "task", label: "Vazifalar" },
  { value: "review", label: "Tekshiruvlar" },
  { value: "member", label: "Jamoa" },
  { value: "project", label: "Loyiha" },
];

export default function History({ project }: { project: Project }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [f, setF] = useState({ actor: "", category: "", search: "", days: "" });

  useEffect(() => {
    void api.get<any>(`/projects/${project.id}/members/`).then(setMembers);
  }, [project.id]);

  useEffect(() => {
    setItems(null);
    void api.get<any>("/activity/", { project: project.id, ...f, page, page_size: 50 })
      .then((d) => { setItems(d.results || []); setCount(d.count || 0); });
  }, [project.id, f, page]);

  const set = (k: string, v: string) => { setPage(1); setF((p) => ({ ...p, [k]: v })); };

  return (
    <div className="split">
      <div>
        <div className="filters">
          <div className="f">
            <label>Kim</label>
            <select value={f.actor} onChange={(e) => set("actor", e.target.value)}>
              <option value="">Hamma</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Turkum</label>
            <select value={f.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Davr</label>
            <select value={f.days} onChange={(e) => set("days", e.target.value)}>
              <option value="">Butun tarix</option>
              <option value="7">Songgi 7 kun</option>
              <option value="30">Songgi 30 kun</option>
              <option value="90">Songgi 90 kun</option>
            </select>
          </div>
          <div className="f" style={{ flex: 1 }}>
            <label>Qidiruv</label>
            <input value={f.search} onChange={(e) => set("search", e.target.value)}
                   placeholder="Matn boyicha" />
          </div>
        </div>

        <Card title={`Loyiha tarixi (${count} yozuv)`}>
          {!items ? <Loading /> : <Timeline items={items} showProject={false} />}
          {count > 50 && (
            <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
              <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                ← Oldingi
              </button>
              <span className="muted">{page} / {Math.ceil(count / 50)}</span>
              <button className="btn btn-sm" disabled={page >= Math.ceil(count / 50)}
                      onClick={() => setPage(page + 1)}>Keyingi →</button>
            </div>
          )}
        </Card>
      </div>

      <div>
        <Card title="Loyihada ishlaganlar" padded={false}>
          <div className="card-list">
            {members.map((m) => (
              <Link className="card-body tight row" key={m.id}
                    to={`/loyiha/${project.id}/dasturchi/${m.user.id}`}
                    style={{ color: "inherit", textDecoration: "none" }}>
                <Avatar user={m.user} size="sm" />
                <div>
                  <strong style={{ fontSize: 13 }}>{m.user.full_name}</strong>
                  <br />
                  <small className="muted">
                    {m.user.specialty_display}
                    {!m.is_active && " · sobiq aʼzo"}
                  </small>
                </div>
                <span className="spacer" />
                <span className="muted">→</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Nima uchun bu kerak">
          <Link className="btn btn-sm btn-block" to={`/loyiha/${project.id}/kirish`}>
            Loyihaga kirish qollanmasi
          </Link>
        </Card>
      </div>
    </div>
  );
}
