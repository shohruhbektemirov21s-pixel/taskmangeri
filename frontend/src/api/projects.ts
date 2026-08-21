/**
 * Loyihani o'chirish — ikki bosqichli tasdiq bilan.
 *
 * Loyiha o'chirilganda uning jarayondagi ishlari ham ro'yxatlardan yo'qoladi.
 * Ilgari bu bitta savol bilan bo'lardi: «o'chirilsinmi?» — odam esa o'sha
 * paytda loyihada nechta ish ochiq turganini bilmasdi.
 *
 * Endi tartib shunday:
 *   1. odatdagi savol («o'chirilsinmi?»);
 *   2. server tugallanmagan ish borligini ko'rsa 409 qaytaradi va SANOQNI
 *      beradi (nechtasi jarayonda, nechtasi tekshiruvda);
 *   3. shu raqamlar qizil ogohlantirish bo'lib chiqadi va odam ataylab
 *      ikkinchi marta tasdiqlaydi — shundagina `?confirm=1` bilan o'chadi.
 *
 * Qoida serverda ham bor (`ProjectViewSet.perform_destroy`): tasdiqsiz so'rov
 * baribir o'tmaydi, bu yerdagisi esa odamga nima yo'qolishini ko'rsatadi.
 */
import { ApiError, api } from "./client";
import { confirmDialog } from "@/components/Confirm";
import { confirmDelete } from "@/components/ui";
import { tx } from "@/i18n";

/** Server 409 bilan qaytaradigan sanoq. */
interface LiveWork {
  needs_confirm?: boolean;
  open_tasks?: number;
  in_progress?: number;
  in_review?: number;
  todo?: number;
  blocked?: number;
  changes_requested?: number;
}

/** «3 ta tugallanmagan ish bor — 1 ta jarayonda, 2 ta tekshiruvda.» */
function workText(d: LiveWork) {
  // Noldan katta bo'lgani yoziladi: "0 ta tekshiruvda" degan qator
  // ogohlantirishni uzaytiradi-yu, hech narsa demaydi.
  const rows: [number | undefined, string][] = [
    [d.in_progress, tx("api_projects.holat_jarayonda")],
    [d.in_review, tx("api_projects.holat_tekshiruvda")],
    [d.changes_requested, tx("api_projects.holat_tuzatishda")],
    [d.blocked, tx("api_projects.toxtab_qolgan")],
    [d.todo, tx("api_projects.holat_nazoratda")],
  ];
  const parts = rows.filter(([n]) => Number(n) > 0).map(([n, label]) =>
    tx("api_projects.nechta_holatda", { n: Number(n), holat: label }));
  const head = tx("api_projects.tugallanmagan_ish_bor", { n: d.open_tasks || 0 });
  return parts.length
    ? tx("api_projects.ogohlantirish_royxat", { bosh: head, royxat: parts.join(", ") })
    : `${head}.`;
}

/**
 * Loyihani o'chiradi. `true` — o'chirildi, `false` — odam voz kechdi.
 * Xatolik bo'lsa `ApiError` uloqtiradi: chaqiruvchi uni ekranga chiqaradi.
 */
export async function deleteProject(id: number | string, name: string): Promise<boolean> {
  if (!(await confirmDelete(name))) return false;
  try {
    await api.delete(`/projects/${id}/`);
    return true;
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 409 || !err.data?.needs_confirm) throw err;

    const ok = await confirmDialog({
      title: tx("api_projects.rostdan_ochirilsinmi", { nom: name }),
      warning: workText(err.data as LiveWork),
      body: tx("api_projects.bu_ishlar_loyiha_bilan_birga")
            + tx("api_projects.yoqoladi_tasdiqlasangiz_ochiriladi"),
      confirmText: tx("api_projects.ha_ochirilsin"),
      cancelText: tx("api_projects.yoq_qolsin"),
      danger: true,
    });
    if (!ok) return false;
    await api.delete(`/projects/${id}/?confirm=1`);
    return true;
  }
}
