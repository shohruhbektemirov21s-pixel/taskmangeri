import { useId, useState } from "react";
import { useFetch } from "@/api/useFetch";
import type { MyWorkData } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Empty, ErrorMsg, Loading, TaskRow } from "@/components/ui";

export default function MyWork() {
  const fid = useId();
  const [project, setProject] = useState("");
  const { data, error } = useFetch<MyWorkData>("/my-work/", { project });

  return (
    <>
      <PageHead title={<strong>Mening ishim</strong>} />
      <div className="content">
        {error ? (
          <ErrorMsg error={error} />
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <div className="filters">
              <div className="f">
                <label htmlFor={`${fid}-0`}>Loyiha</label>
                <select id={`${fid}-0`} value={project} onChange={(e) => setProject(e.target.value)}>
                  <option value="">Barcha loyihalar</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {data.groups.map((g) => (
              <div className="card" key={g.status}>
                <div className="card-head">
                  <span className={`badge st-${g.status}`}>{g.label}</span>
                  <span className="badge">{g.count}</span>
                </div>
                <div className="table-wrap"><table className="table">
                  <thead>
                    <tr>
                      <th>Kod</th><th>Vazifa</th><th>Holat</th>
                      <th>Muhimlik</th><th>Ijrochilar</th><th>Muddat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.tasks.map((t) => <TaskRow key={t.id} task={t} showProject />)}
                  </tbody>
                </table></div>
              </div>
            ))}

            {!data.groups.length && (
              <div className="card">
                <Empty icon="☐" title="Sizga hali vazifa biriktirilmagan"
                       text="Loyihaga qoshiling - menejer mutaxassisligingizga mos vazifa beradi." />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
