import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Workspace } from "@/api/types";
import Chat from "@/components/Chat";
import { PageHead } from "@/components/Layout";
import { ErrorMsg, Loading } from "@/components/ui";
import { toWorkspace, useEntityId } from "@/nav";

export default function WorkspaceChat() {
  const slug = useEntityId("workspace");
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const w = await api.get<Workspace>(`/workspaces/${slug}/`);
        if (alive) setWs(w);
      } catch (err) {
        if (alive) setError(err instanceof ApiError ? err.message : "Ish maydonini ochib bo'lmadi");
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (!ws) {
    return <div className="content">{error ? <ErrorMsg error={error} /> : <Loading />}</div>;
  }

  return (
    <>
      <PageHead
        title={
          <>
            <span className="lang-dot" style={{ background: ws.color }} />{" "}
            <Link className="muted" {...toWorkspace(ws.slug)}>{ws.name}</Link>
            <span className="muted"> / </span>
            <strong>suhbat</strong>
          </>
        }
      />
      <div className="content" style={{ maxWidth: 900 }}>
        <Chat workspaceId={ws.id} workspaceSlug={ws.slug} height={520} />
      </div>
    </>
  );
}
