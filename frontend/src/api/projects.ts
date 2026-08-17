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
    [d.in_progress, "jarayonda"],
    [d.in_review, "tekshiruvda"],
    [d.changes_requested, "tuzatishda"],
    [d.blocked, "to'xtab qolgan"],
    [d.todo, "nazoratda"],
  ];
  const parts = rows.filter(([n]) => Number(n) > 0).map(([n, label]) => `${n} ta ${label}`);
  const head = `Diqqat: loyihada ${d.open_tasks || 0} ta tugallanmagan ish bor`;
  return parts.length ? `${head} — ${parts.join(", ")}.` : `${head}.`;
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
      title: `«${name}» rostdan o'chirilsinmi?`,
      warning: workText(err.data as LiveWork),
      body: "Bu ishlar loyiha bilan birga ro'yxatlardan, doskadan va taqvimdan "
            + "yo'qoladi. Tasdiqlasangiz — o'chiriladi.",
      confirmText: "Ha, o'chirilsin",
      cancelText: "Yo'q, qolsin",
      danger: true,
    });
    if (!ok) return false;
    await api.delete(`/projects/${id}/?confirm=1`);
    return true;
  }
}
