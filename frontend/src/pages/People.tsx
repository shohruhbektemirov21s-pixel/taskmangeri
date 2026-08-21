import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf, pagesOf, totalOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, ErrorMsg, Loading, Pager } from "@/components/ui";
import { toUser } from "@/nav";
import { tx } from "@/i18n";

/** Bir sahifada nechta odam. */
const PER_PAGE = 30;

export default function People() {
  const fid = useId();
  const { user, meta } = useAuth();
  const [f, setF] = useState({ search: "", specialty: "", role: "", seniority: "" });
  const [page, setPage] = useState(1);

  /** Filtr o'zgarganda birinchi sahifaga qaytamiz.
   *
   * Aks holda beshinchi sahifada turib qidiruv yozgan odam bo'sh ekran
   * ko'rardi: natija ikki sahifa, u esa hamon beshinchisini so'rayapti. */
  const setFilter = (patch: Partial<typeof f>) => {
    setF({ ...f, ...patch });
    setPage(1);
  };
  // Rol o'zgartirish xatosi - yuklash xatosidan alohida.
  const [actionError, setActionError] = useState<string | null>(null);

  // Ilgari bu ro'yxat har bosilgan tugma uchun qaytadan so'ralardi (200 tagacha
  // foydalanuvchi), so'rovlar bekor qilinmasdi va `catch` ham yo'q edi - server
  // xato bersa sahifa abadiy «Yuklanmoqda» da qolardi. Endi so'rov yozish
  // to'xtagach ketadi, eskisi bekor qilinadi, xato esa ekranga chiqadi.
  //
  // SAHIFALASH. Ilgari `page_size: 200` so'ralardi - bu serverdagi eng
  // katta ruxsat etilgan qiymat (`config/pagination.py`). Ya'ni ro'yxat
  // 200 kishida JIMGINA kesilardi: 201-xodim hech qanday belgisiz
  // yo'qolardi va sarlavhadagi «... ta» ham yolg'on bo'lib qolardi.
  const { data, error: loadError, loading, reload } =
    useFetch<any>("/users/", { ...f, page, page_size: PER_PAGE }, { debounceMs: 300 });
  const users = useMemo(() => (data ? listOf<User>(data) : null), [data]);
  // Jami son - serverdan (`count`), ekrandagi qatorlar sonidan EMAS.
  const total = totalOf(data);
  const pages = pagesOf(data, PER_PAGE);
  const error = actionError || loadError;

  // Taqsimot ham serverdan va O'SHA filtr bilan: aks holda u faqat
  // ochilgan sahifani sanardi.
  const { data: spec } = useFetch<{ items: { label: string; count: number }[] }>(
    "/users/specialty-stats/", f, { debounceMs: 300 });

  async function change(target: User, patch: Record<string, unknown>) {
    setActionError(null);
    try {
      await api.patch(`/users/${target.id}/role/`, patch);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tx("people.ozgartirib_bolmadi"));
    }
  }

  const isAdmin = user?.is_platform_admin;

  return (
    <>
      <PageHead title={<strong>{tx("people.foydalanuvchilar")}</strong>}
                actions={!!data && <span className="badge">{total} {tx("common.ta")}</span>} />
      <div className="content">
        <ErrorMsg error={error} />

        <div className="filters">
          <div className="f grow">
            <label htmlFor={`${fid}-0`}>{tx("common.qidiruv")}</label>
            <input id={`${fid}-0`} value={f.search} onChange={(e) => setFilter({ search: e.target.value })}
                   placeholder={tx("people.ism_email_yoki_konikma")} />
          </div>
          <div className="f">
            <label htmlFor={`${fid}-1`}>{tx("common.mutaxassislik")}</label>
            <select id={`${fid}-1`} value={f.specialty} onChange={(e) => setFilter({ specialty: e.target.value })}>
              <option value="">{tx("common.hammasi")}</option>
              {(meta?.specialties || []).map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor={`${fid}-2`}>{tx("common.daraja")}</label>
            <select id={`${fid}-2`} value={f.seniority} onChange={(e) => setFilter({ seniority: e.target.value })}>
              <option value="">{tx("common.hammasi")}</option>
              {(meta?.seniority || []).map((s) => (
                <option key={s.value} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor={`${fid}-3`}>{tx("people.tizim_roli")}</label>
            <select id={`${fid}-3`} value={f.role} onChange={(e) => setFilter({ role: e.target.value })}>
              <option value="">{tx("common.hammasi")}</option>
              {(meta?.global_role || []).map((s) => (
                <option key={s.value} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="split">
          <div className="card">
            {loading ? <Loading /> : !users ? null : (
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>{tx("people.foydalanuvchi")}</th><th>{tx("common.mutaxassislik")}</th><th>{tx("people.tizim_roli")}</th>
                    <th>{tx("common.loyihalar")}</th><th>{tx("people.ochiq_ish")}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="row">
                          <Avatar user={u} size="sm" />
                          <div>
                            <Link {...toUser(u.id)}>{u.full_name}</Link>
                            {!u.is_active && <span className="badge badge-danger">{tx("people.bloklangan")}</span>}
                            <br /><small className="muted">{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {isAdmin ? (
                          <select defaultValue={u.specialty} style={{ width: 160 }}
                                  onChange={(e) => void change(u, { specialty: e.target.value })}>
                            {(meta?.specialties || []).map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge" style={{ color: u.specialty_color }}>
                            {u.specialty_display}
                          </span>
                        )}
                        <br /><small className="muted">{u.seniority_display} · {u.years_experience} {tx("people.yil")}</small>
                      </td>
                      <td>
                        {isAdmin ? (
                          <select defaultValue={u.global_role} style={{ width: 150 }}
                                  onChange={(e) => void change(u, { global_role: e.target.value })}>
                            {(meta?.global_role || []).map((s) => (
                              <option key={s.value} value={String(s.value)}>{s.label}</option>
                            ))}
                          </select>
                        ) : <span className="badge">{u.global_role_display}</span>}
                      </td>
                      <td>{u.project_count ?? 0}</td>
                      <td>{u.open_tasks ?? 0}</td>
                      <td className="right">
                        {isAdmin && u.id !== user?.id && (
                          <button className={`btn btn-sm ${u.is_active ? "btn-danger" : ""}`}
                                  onClick={() => void change(u, { is_active: !u.is_active })}>
                            {u.is_active ? tx("people.bloklash") : tx("people.faollashtirish")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            {pages > 1 && (
              <div className="card-body">
                <Pager page={page} pages={pages} onPick={setPage} />
              </div>
            )}
          </div>

          <div>
            <Card title={tx("people.mutaxassisliklar_taqsimoti")}>
              <ul className="list-plain" style={{ fontSize: 13 }}>
                {(spec?.items || []).map((row) => (
                  <li className="row" key={row.label}>
                    <span>{row.label}</span><span className="spacer" /><strong>{row.count}</strong>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
