/**
 * Navigatsiya: identifikator manzilda emas, sahifa holatida.
 *
 * TALAB. Manzil qatorida `/loyiha/6` emas, `/loyiha` tursin — vazifa,
 * profil va ish maydoni uchun ham shunday.
 *
 * QAYERDA SAQLANADI. Ikki joyda, ataylab:
 *
 *   1. `history.state` — React Router `<Link state={...}>` bilan yozadi.
 *      Bu ORQAGA/OLDINGA tugmalari uchun to'g'ri javob beradi: har bir
 *      tarix yozuvi o'z identifikatorini olib yuradi, ya'ni ikkita
 *      loyiha orasida orqaga qaytganda o'sha loyiha ochiladi. F5 bosilsa
 *      ham saqlanadi — brauzer `history.state` ni tiklaydi.
 *
 *   2. `sessionStorage` — zaxira. Holat yo'qolgan yagona holat: odam
 *      manzilni qo'lda yozib kirdi yoki havolani boshqa oynada ochdi.
 *      Unda oxirgi ochilgan yozuv ishlatiladi. Ilova ichida esa holat
 *      har doim bo'ladi, ya'ni zaxira kamdan-kam ishga tushadi.
 *
 * NIMA YO'QOLADI. Havolani birovga yuborib bo'lmaydi: `/loyiha` hammada
 * o'zining oxirgi loyihasini ochadi. Bu talabning narxi, kamchilik emas.
 *
 * TOZALASH. Ba'zi havolalar identifikatorni ataylab O'CHIRISHI kerak:
 * yon paneldagi «Profil» o'z profiliga olib boradi, lekin sessiyada
 * begona odamning raqami turgan bo'lsa u ochilib qolardi. Shuning uchun
 * `toSelfProfile()` kabi maqsadlar `null` yuboradi — «bu yerda hech kim».
 */
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Manzildan olib tashlangan identifikatorlar. */
export type EntityKey = "project" | "task" | "user" | "workspace";

/** `null` — «tozala», `undefined` (kalit yo'q) — «tegma». */
export type EntityIds = Partial<Record<EntityKey, string | number | null>>;

/**
 * Sahifa holati: identifikatorlar + FILTRLAR.
 *
 * `f` — filtrlarning `URLSearchParams` matni ("status=TODO&open=1").
 * Ilgari u manzilda turardi (`/loyiha/vazifalar?status=TODO`). Endi u ham
 * tanadan uzatiladi: manzil qatorida na identifikator, na so'rov qoladi.
 */
export type NavState = EntityIds & { f?: string };

/** `<Link {...target}>` ga to'g'ridan-to'g'ri tarqatiladigan maqsad. */
export interface NavTarget {
  to: string;
  state: NavState;
}

const storeKey = (key: EntityKey) => `tf_nav_${key}`;

function remember(key: EntityKey, value: string | number | null | undefined) {
  try {
    if (value === null || value === undefined) sessionStorage.removeItem(storeKey(key));
    else sessionStorage.setItem(storeKey(key), String(value));
  } catch {
    // Shaxsiy rejimda `sessionStorage` yozishga ruxsat bermasligi mumkin -
    // bunda faqat zaxira yo'qoladi, ilova o'zi ishlayveradi.
  }
}

function recall(key: EntityKey): string | null {
  try {
    return sessionStorage.getItem(storeKey(key));
  } catch {
    return null;
  }
}

/**
 * Joriy sahifadagi identifikator. Topilmasa `null` — sahifa buni
 * ko'rsatishi kerak («loyiha tanlanmagan»), oq ekran qoldirmasin.
 */
export function useEntityId(key: EntityKey): string | null {
  const location = useLocation();
  const state = (location.state || null) as NavState | null;
  const given = state && key in state ? state[key] : undefined;
  const fromState = given !== undefined;

  useEffect(() => {
    if (fromState) remember(key, given);
  }, [fromState, given, key]);

  if (fromState) return given === null ? null : String(given);
  return recall(key);
}

/** `useEntityId` ning raqamli varianti — API chaqiruvlari uchun. */
export function useEntityNum(key: EntityKey): number | null {
  const raw = useEntityId(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * `useNavigate` o'rniga. Uch xil chaqiriladi:
 *   `go(toProject(6))` — identifikatorni holat bilan birga uzatadi;
 *   `go("/loyihalar")` — oddiy manzil;
 *   `go(-1)`           — orqaga (brauzer tarixi bo'yicha).
 * Shu sabab bitta komponentda ikkita hook saqlash shart emas.
 */
export function useGo() {
  const navigate = useNavigate();
  return useCallback(
    (target: NavTarget | string | number, opts?: { replace?: boolean }) => {
      if (typeof target === "number") return navigate(target);
      if (typeof target === "string") return navigate(target, { replace: opts?.replace });
      return navigate(target.to, { state: target.state, replace: opts?.replace });
    },
    [navigate],
  );
}

/* ------------------------------------------------------------------ loyiha */

type Id = string | number;

/**
 * Loyiha sahifasi. `tab` — bo'lim slug'i (`doska`, `jamoa`, ...),
 * `filters` — bo'lim ichidagi filtr ("status=DONE").
 *
 * Filtr manzilga EMAS, holatga qo'yiladi: `/loyiha/vazifalar?status=DONE`
 * emas, `/loyiha/vazifalar`. Bo'limni filtrsiz ochish uchun `filters`
 * berilmaydi - unda eski filtr `useNavParams` orqali o'z joyida qoladi.
 */
export const toProject = (id: Id, tab?: string, filters?: string): NavTarget => ({
  to: `/loyiha${tab ? "/" + tab : ""}`,
  state: filters === undefined ? { project: id } : { project: id, f: filters },
});

/**
 * «Yangi loyiha» — sessiyadagi ESKI raqamni tozalab ketadi.
 *
 * Aks holda shunday bo'lardi: odam 6-loyihani ochadi (sessiyaga 6 yoziladi),
 * keyin «Yangi loyiha» ni bosadi va forma o'zini TAHRIRLASH rejimida
 * ochadi - chunki raqam hamon sessiyada turibdi.
 */
export const toNewProject = (): NavTarget => ({
  to: "/loyiha/yangi", state: { project: null, task: null },
});

export const toProjectEdit = (id: Id): NavTarget => ({
  to: "/loyiha/tahrir", state: { project: id },
});

export const toProjectJoin = (id: Id): NavTarget => ({
  to: "/loyiha/qoshilish", state: { project: id },
});

export const toNewTask = (projectId: Id): NavTarget => ({
  to: "/loyiha/vazifa-yaratish", state: { project: projectId, task: null },
});

export const toBulkTasks = (projectId: Id): NavTarget => ({
  to: "/loyiha/koplab-vazifa", state: { project: projectId },
});

/** Dasturchining SHU loyihadagi hisoboti — ikkita identifikator kerak. */
export const toDeveloper = (projectId: Id, userId: Id): NavTarget => ({
  to: "/loyiha/dasturchi", state: { project: projectId, user: userId },
});

export const toPublicProject = (id: Id): NavTarget => ({
  to: "/ochiq-loyiha", state: { project: id },
});

/* ------------------------------------------------------------------ vazifa */

export const toTask = (id: Id): NavTarget => ({ to: "/vazifa", state: { task: id } });

export const toTaskEdit = (id: Id): NavTarget => ({
  to: "/vazifa/tahrir", state: { task: id },
});

/* -------------------------------------------------------------------- odam */

export const toUser = (id: Id): NavTarget => ({ to: "/profil", state: { user: id } });

/** O'z profili — begona odam raqami sessiyada qolib ketmasin. */
export const toSelfProfile = (): NavTarget => ({ to: "/profil", state: { user: null } });

/** Yozishmalar. Suhbatdosh berilmasa — ro'yxat ochiladi. */
export const toMessages = (userId?: Id): NavTarget => ({
  to: "/xabarlar", state: { user: userId ?? null },
});

/* ------------------------------------------------------------- ish maydoni */

export const toWorkspace = (slug: string): NavTarget => ({
  to: "/ish-maydoni", state: { workspace: slug },
});

export const toWorkspaceChat = (slug: string): NavTarget => ({
  to: "/ish-maydoni/chat", state: { workspace: slug },
});

export const toNewWorkspace = (): NavTarget => ({
  to: "/ish-maydoni/yangi", state: { workspace: null },
});

/* ------------------------------------------------------- filtrli sahifalar */

/** Filtr matnini holatga tayyorlaydi. */
const withFilter = (to: string, filters?: string): NavTarget => ({
  to, state: filters === undefined ? {} : { f: filters },
});

/** «Umumiy tarix». Qidiruv so'zi manzilda emas, holatda ketadi. */
export const toFeed = (q?: string): NavTarget =>
  withFilter("/tarix", q === undefined ? undefined : new URLSearchParams({ q }).toString());

/** Ochiq qidiruv sahifasi (kirmagan odam ham ko'radi). */
export const toSearch = (q: string): NavTarget =>
  withFilter("/qidiruv", new URLSearchParams({ q }).toString());

/** «Mening ishim» — holat bo'yicha filtr bilan yoki filtrsiz. */
export const toMyWork = (filters?: string): NavTarget =>
  withFilter("/mening-ishim", filters);

/* ------------------------------------------------------------------ filtrlar */

const filterKey = (path: string) => `tf_flt_${path}`;

/**
 * `useSearchParams` ning o'rnini bosadi — lekin filtr manzilda emas,
 * sahifa holatida saqlanadi.
 *
 * Qaytaradigan obyekt haqiqiy `URLSearchParams`, ya'ni chaqiruvchi kod
 * o'zgarmaydi: `params.get("status")`, `params.toString()` va
 * `new URLSearchParams(params)` oldingidek ishlayveradi.
 *
 * Saqlash `useEntityId` bilan bir xil: `history.state` (orqaga tugmasi va
 * F5 uchun) + `sessionStorage` (manzil qo'lda yozilganda). Kalit yo'lga
 * bog'langan - «Vazifalar» dagi filtr «Taqvim» ga o'tib ketmasin.
 */
export function useNavParams(): [
  URLSearchParams,
  (next: URLSearchParams, opts?: { replace?: boolean }) => void,
] {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state || null) as NavState | null;
  const given = state && typeof state.f === "string" ? state.f : undefined;

  let raw = given;
  if (raw === undefined) {
    try {
      raw = sessionStorage.getItem(filterKey(location.pathname)) ?? "";
    } catch {
      raw = "";
    }
  }

  useEffect(() => {
    if (given === undefined) return;
    try {
      sessionStorage.setItem(filterKey(location.pathname), given);
    } catch {
      // shaxsiy rejimda yozib bo'lmaydi - zaxira yo'qoladi, xolos
    }
  }, [given, location.pathname]);

  const params = useMemo(() => new URLSearchParams(raw || ""), [raw]);

  const setParams = useCallback(
    (next: URLSearchParams, opts?: { replace?: boolean }) => {
      // Identifikatorlar saqlanadi: filtrni o'zgartirish qaysi loyiha
      // ochilganini unutmasin.
      navigate(location.pathname, {
        replace: opts?.replace,
        state: { ...(state || {}), f: next.toString() },
      });
    },
    [navigate, location.pathname, state],
  );

  return [params, setParams];
}

/* ------------------------------------------------------------------- yordam */

/**
 * Joriy manzil aynan shu yo'lmi.
 *
 * «Yangi ...» sahifalari uchun ikkinchi qavat himoya: havola sessiyani
 * tozalab ketadi (`toNewProject`), lekin odam manzilni qo'lda yozib
 * kirsa tozalanmaydi. Shunda sahifa REJIMNI havoladan emas, marshrutdan
 * aniqlaydi va eski raqam forma ichiga sizib o'tmaydi.
 */
export function useIsPath(path: string): boolean {
  return useLocation().pathname === path;
}
