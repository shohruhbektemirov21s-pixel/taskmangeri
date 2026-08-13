import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Workspace } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Card, Empty, ErrorMsg, Loading } from "@/components/ui";

export default function Workspaces() {
  const { user } = useAuth();
  const [mine, setMine] = useState<Workspace[] | null>(null);
  const [others, setOthers] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function load() {
    setMine(listOf<Workspace>(await api.get<any>("/workspaces/", { scope: "mine" })));
    setOthers(listOf<Workspace>(await api.get<any>("/workspaces/", { scope: "open" })));
  }

  useEffect(() => { void load(); }, []);

  async function join(ws: Workspace) {
    setError(null);
    try {
      await api.post(`/workspaces/${ws.slug}/join/`, { code });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Qoshilib bolmadi");
    }
  }

  const row = (w: Workspace, joined: boolean) => (
    <div className="repo-item" key={w.id}>
      <div className="row wrap">
        <h3 style={{ margin: 0 }}>
          <span className="lang-dot" style={{ background: w.color }} />{" "}
          <Link to={`/ish-maydoni/${w.slug}`}>{w.name}</Link>
        </h3>
        {w.is_open && <span className="badge badge-ok">ochiq</span>}
        {joined && <span className="badge">{w.my_role}</span>}
        <span className="spacer" />
        {joined ? (
          <Link className="btn btn-sm" to={`/ish-maydoni/${w.slug}`}>Ochish</Link>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => void join(w)}>Qoshilish</button>
        )}
      </div>
      {w.description && <p className="muted" style={{ margin: "8px 0 0" }}>{w.description}</p>}
      <div className="repo-meta">
        <span>{w.project_count} loyiha</span>
        <span>{w.member_count} aʼzo</span>
        <span>Egasi: {w.owner.full_name}</span>
      </div>
    </div>
  );

  return (
    <>
      <PageHead
        title={<strong>Ish maydonlari</strong>}
        actions={user?.can_create_project
                 ? <Link className="btn btn-sm btn-primary" to="/ish-maydoni/yangi">Yangi maydon</Link>
                 : undefined}
      />
      <div className="content">
        <ErrorMsg error={error} />
        <div className="split">
          <div>
            <Card title="Mening maydonlarim" padded={false}>
              <div className="card-list">
                {!mine ? <Loading /> : mine.length ? mine.map((w) => row(w, true)) : (
                  <Empty title="Siz hali ish maydonida emassiz"
                         text="Yangi maydon yarating yoki ochiq maydonga qoshiling." />
                )}
              </div>
            </Card>

            {others.length > 0 && (
              <Card title="Ochiq maydonlar" padded={false}>
                <div className="card-list">{others.map((w) => row(w, false))}</div>
              </Card>
            )}
          </div>

          <div>
            <Card title="Taklif kodi bilan qoshilish">
              <div className="field">
                <label>Kod</label>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                       placeholder="ABC123XYZ" />
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                Kodni kiritib, quyidagi royxatdan kerakli maydonga Qoshilish tugmasini bosing.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
