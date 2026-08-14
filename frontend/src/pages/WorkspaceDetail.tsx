import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Project, Workspace } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import AddMemberBox from "@/components/AddMemberBox";
import { IconChat } from "@/components/icons";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, Empty, ErrorMsg, Loading, Progress } from "@/components/ui";

export default function WorkspaceDetail() {
  const { slug } = useParams();
  const { meta, user } = useAuth();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setWs(await api.get<Workspace>(`/workspaces/${slug}/`));
      setProjects(listOf<Project>(await api.get<any>("/projects/", {
        workspace: slug, scope: "discover",
      })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ish maydonini ochib bolmadi");
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Amalni bajarib bolmadi");
    }
  }

  if (!ws) {
    return (
      <div className="content">
        {error ? <div className="msg msg-error">{error}</div> : <Loading />}
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={
          <>
            <span className="lang-dot" style={{ background: ws.color }} />{" "}
            <Link className="muted" to="/ish-maydonlari">ish maydonlari</Link>
            <span className="muted"> / </span>
            <strong>{ws.name}</strong>
            {ws.my_role && <span className="badge">{ws.my_role}</span>}
          </>
        }
        actions={
          <>
            {!ws.my_role && (
              <button className="btn btn-sm btn-primary"
                      onClick={() => void act(() => api.post(`/workspaces/${ws.slug}/join/`, {}))}>
                Qoshilish
              </button>
            )}
            {ws.my_role && (
              <Link className="btn btn-sm" to={`/ish-maydoni/${ws.slug}/chat`}>
                <IconChat size={14} /> Suhbat
              </Link>
            )}
            {user?.can_create_project && (
              <Link className="btn btn-sm btn-primary" to="/loyiha/yangi">Yangi loyiha</Link>
            )}
          </>
        }
      />
      <div className="content">
        <ErrorMsg error={error} />
        <div className="split">
          <div>
            {ws.description && (
              <Card title="Maydon haqida"><p className="pre-wrap">{ws.description}</p></Card>
            )}

            <Card title="Loyihalar" padded={false}
                  badge={<span className="badge">{projects.length}</span>}>
              <div className="card-list">
                {projects.map((p) => (
                  <div className="repo-item" key={p.id}>
                    <div className="row wrap">
                      <h3 style={{ margin: 0 }}>
                        <span className="lang-dot" style={{ background: p.color }} />{" "}
                        <Link to={`/loyiha/${p.id}`}>{p.name}</Link>
                      </h3>
                      <span className="badge mono">{p.key}</span>
                      {p.matches_my_specialty && <span className="badge badge-info">sizga mos</span>}
                      <span className="spacer" />
                      <Link className="btn btn-sm" to={`/loyiha/${p.id}/doska`}>Doska</Link>
                    </div>
                    {p.description && (
                      <p className="muted" style={{ margin: "8px 0 0" }}>{p.description}</p>
                    )}
                    <div style={{ marginTop: 8 }}><Progress value={p.progress} /></div>
                    <div className="repo-meta">
                      <span>{p.open_tasks} ochiq</span>
                      <span>{p.member_count} aʼzo</span>
                      {p.manager && <span>PM: {p.manager.full_name}</span>}
                    </div>
                  </div>
                ))}
                {!projects.length && (
                  <Empty title="Loyiha yoq" text="Bu maydonda hali loyiha yaratilmagan.">
                    {user?.can_create_project && (
                      <Link className="btn btn-primary btn-sm" to="/loyiha/yangi">Loyiha yaratish</Link>
                    )}
                  </Empty>
                )}
              </div>
            </Card>
          </div>

          <div>
            <Card title="Aʼzolar" padded={false}
                  badge={<span className="badge">{ws.member_count}</span>}>
              <div className="card-list">
                {(ws.members || []).map((m) => (
                  <div className="card-body tight row" key={m.id}>
                    <Avatar user={m.user} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <Link to={`/profil/${m.user.id}`}>{m.user.full_name}</Link>
                      <br /><small className="muted">{m.user.specialty_display}</small>
                    </div>
                    <span className="spacer" />
                    {ws.can_manage && m.role !== "OWNER" ? (
                      <select defaultValue={m.role} style={{ width: 130 }}
                              onChange={(e) => void act(() =>
                                api.post(`/workspaces/${ws.slug}/members/`, {
                                  member_id: m.id, role: e.target.value,
                                }))}>
                        {(meta?.workspace_role || [])
                          .filter((r) => r.value !== "OWNER")
                          .map((r) => (
                            <option key={String(r.value)} value={String(r.value)}>{r.label}</option>
                          ))}
                      </select>
                    ) : <span className="badge">{m.role_display}</span>}
                  </div>
                ))}
                {!(ws.members || []).length && <Empty title="Aʼzo yoq" />}
              </div>
            </Card>

            {ws.can_manage && (
              <AddMemberBox
                workspaceSlug={ws.slug}
                roles={(meta?.workspace_role || []).filter((r) => r.value !== "OWNER")}
                defaultRole="MEMBER"
                onChange={() => void load()}
              />
            )}

            <Card title="Maʼlumot">
              <ul className="list-plain" style={{ fontSize: 13 }}>
                <li><span className="muted">Egasi:</span> {ws.owner.full_name}</li>
                <li><span className="muted">Loyihalar:</span> {ws.project_count}</li>
                <li><span className="muted">Turi:</span> {ws.is_open ? "ochiq" : "yopiq"}</li>
                {ws.can_manage && (
                  <li><span className="muted">Qoshilish kodi:</span> <code>{ws.join_code}</code></li>
                )}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
