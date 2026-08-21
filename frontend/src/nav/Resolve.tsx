/**
 * Tashqaridan kelgan havolani ichki manzilga aylantiruvchi kirish nuqtasi.
 *
 * MUAMMO. Ilova marshrutlarida identifikator yo'q (`/vazifa`, `/loyiha`) -
 * qaysi yozuv ochilgani sahifa holatida uzatiladi (`nav/index.ts`). Lekin
 * havola HAR DOIM ham ilova ichidan bosilmaydi:
 *
 *   * bildirishnoma yozuvida manzil bazada saqlanadi (`Notification.url`)
 *     va u yozilgan paytdagi ko'rinishda qoladi - `/vazifa/75`;
 *   * Telegramdagi «Ochish» tugmasi umuman boshqa ilovadan keladi
 *     (`SITE_URL + notification.url`), ya'ni unda holat bo'lishi mumkin emas.
 *
 * Bunday manzilga mos marshrut yo'q edi va `path="*"` ishlab, odam
 * «Bosh panel» ga tushib qolardi. Ya'ni qo'ng'iroqdagi har bir vazifa
 * xabari, Telegramdagi har bir tugma ishlamas edi.
 *
 * YECHIM. Identifikatorli manzil ENDI QABUL QILINADI, lekin faqat kirish
 * nuqtasi sifatida: shu komponent uni o'qib, o'sha zahoti holat asosidagi
 * manzilga `replace` bilan almashtiradi. Natijada:
 *
 *   /vazifa/75  ->  /vazifa   (holatda `{task: 75}`)
 *
 * Talab buzilmaydi - manzil qatorida identifikator TURMAYDI. U bir kadr
 * ko'rinadi va tarixda ham iz qoldirmaydi (`replace`), ya'ni orqaga
 * qaytgan odam yana shu yerga tushib qolmaydi.
 *
 * Yon foyda: backendda hech narsa o'zgarmadi va BAZADAGI ESKI YOZUVLAR
 * ham ishlab ketdi.
 */
import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { Loading } from "@/components/ui";
import { tx } from "@/i18n";
import { toMessages, toProject, toTask, toWorkspaceChat, useGo, type NavTarget } from "./index";

/** Qaysi yozuv turini yechayotganimiz - marshrut shabloni bilan juftlashadi. */
export type ResolveKind = "task" | "project" | "messages" | "workspace-chat";

/** Yechib bo'lmagan havola shu yerga olib boradi - oq ekran qolmasin. */
const FALLBACK = "/bildirishnomalar";

function build(kind: ResolveKind, params: Record<string, string | undefined>): NavTarget | null {
  const { id, tab, slug } = params;

  switch (kind) {
    case "task":
      // Faqat raqam: `/vazifa/tahrir` allaqachon o'z marshrutiga ega va bu
      // yerga tushmaydi, lekin kelajakda yangi bo'lim qo'shilsa u
      // «vazifa 0» bo'lib ochilmasin.
      return isId(id) ? toTask(id!) : null;
    case "project":
      return isId(id) ? toProject(id!, tab || undefined) : null;
    case "messages":
      return isId(id) ? toMessages(id!) : null;
    case "workspace-chat":
      // Ish maydoni raqam emas, manzil (slug) bilan ochiladi.
      return slug ? toWorkspaceChat(slug) : null;
    default:
      return null;
  }
}

function isId(value?: string) {
  return !!value && /^\d+$/.test(value);
}

export default function Resolve({ kind }: { kind: ResolveKind }) {
  const params = useParams();
  const go = useGo();
  // `params` har renderda yangi obyekt - bog'liqlik ro'yxatiga uni o'z
  // holicha qo'yib bo'lmaydi (`useFetch` dagi bilan bir xil sabab).
  const key = `${kind}:${params.id ?? ""}:${params.tab ?? ""}:${params.slug ?? ""}`;

  useEffect(() => {
    const target = build(kind, params);
    // `replace`: bu manzil tarixda qolmaydi. Aks holda orqaga bosgan odam
    // yana shu yerga tushib, cheksiz aylanardi.
    go(target ?? FALLBACK, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <Loading text={tx("app.yuklanmoqda")} />;
}
