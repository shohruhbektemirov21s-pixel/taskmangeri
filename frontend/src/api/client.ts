/**
 * Backend (Django REST) bilan ishlovchi yagona HTTP mijoz.
 * JWT tokenni localStorage da saqlaydi va 401 da avtomatik yangilaydi.
 */
import { tx } from "@/i18n";

export const BASE = import.meta.env.VITE_API_URL || "/api";

const ACCESS_KEY = "tf_access";
const REFRESH_KEY = "tf_refresh";

/**
 * Seans tugaganda yuboriladigan hodisa.
 *
 * Ilgari token yaroqsiz bo'lib qolsa (refresh ham o'tmadi) bu yerda
 * `tokens.clear()` chaqirilardi-yu, React bundan bexabar qolardi: yon panel,
 * avatar va menyular joyida turaverardi, lekin har bir so'rov 401 qaytarardi.
 * Odam nima bo'layotganini tushunmay, sahifani qo'lda yangilashga majbur edi.
 * Endi `AuthContext` shu hodisani eshitib, darrov kirish sahifasiga chiqaradi.
 */
export const AUTH_EXPIRED = "teamflow:auth-expired";

function sessionEnded() {
  tokens.clear();
  window.dispatchEvent(new Event(AUTH_EXPIRED));
}

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, data: any) {
    super(ApiError.readable(data) || tx("api_client.xatolik_kodi", { kod: status }));
    this.status = status;
    this.data = data;
  }

  /** DRF xatolik javobini o'qiladigan matnga aylantiradi */
  static readable(data: any): string {
    if (!data) return "";
    if (typeof data === "string") return ApiError.fromText(data);
    if (data.detail) return String(data.detail);
    const parts: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      const text = Array.isArray(val) ? val.join(" ") : String(val);
      parts.push(key === "non_field_errors" ? text : `${key}: ${text}`);
    }
    return parts.join(" | ");
  }

  /**
   * Matnli javobni qisqa xabarga aylantiradi.
   *
   * Server 500 qaytarganda Django to'liq HTML sahifa (bir necha o'n kilobayt
   * traceback) yuboradi. Uni o'z holicha ko'rsatish sahifani buzadi va ichki
   * ma'lumotni ochib qo'yadi. Shuning uchun HTML dan faqat sarlavhani olamiz -
   * u Django da aynan xatolik nomi bo'ladi ("AttributeError at /api/...").
   */
  static fromText(text: string): string {
    const trimmed = text.trim();
    if (!/^<(!doctype|html)/i.test(trimmed)) return trimmed;
    const title = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    return title
      ? tx("api_client.serverda_xatolik", { sarlavha: title })
      : tx("api_client.serverda_kutilmagan_xatolik_backend_loglarin");
  }

  /** Maydon bo'yicha xatoliklar (formalarda ko'rsatish uchun) */
  get fields(): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.data && typeof this.data === "object") {
      for (const [k, v] of Object.entries(this.data)) {
        out[k] = Array.isArray(v) ? (v as string[]).join(" ") : String(v);
      }
    }
    return out;
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: tokens.refresh }),
    })
      .then(async (r) => {
        if (!r.ok) return false;
        const data = await r.json();
        tokens.set(data.access, data.refresh);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  raw?: boolean;
  /** So'rovni bekor qilish uchun - sahifa almashsa eski javob kerak emas. */
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {};
  const isForm = opts.body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";
  if (tokens.access) headers["Authorization"] = `Bearer ${tokens.access}`;

  const res = await fetch(url.toString().replace(window.location.origin, ""), {
    method: opts.method || "GET",
    headers,
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    signal: opts.signal,
  });

  // 401: avval tokenni yangilab ko'ramiz. Yangilanmasa - seans tugagan.
  // Refresh token umuman bo'lmasa ham shu yo'l: aks holda ilova "kirgan"
  // ko'rinishida qolib, har so'rovda xato bergan bo'lardi.
  if (res.status === 401 && retry) {
    if (tokens.refresh && (await tryRefresh())) return request<T>(path, opts, false);
    if (tokens.access || tokens.refresh) sessionEnded();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/**
 * O'qish shlyuzi — hamma o'qish shu manzilga POST bo'lib ketadi.
 *
 * Ilgari `api.get("/projects/6/")` to'g'ridan-to'g'ri `GET /api/projects/6/`
 * ga aylanardi: identifikator manzilda, filtrlar esa `?` dan keyin turardi.
 * Endi ikkovi ham so'rov TANASIDA ketadi:
 *
 *     POST /api/read/
 *     {"path": "/projects/6/", "params": {"status": "ACTIVE"}}
 *
 * Chaqiruvchi kod o'zgarmadi - `api.get` o'sha-o'sha. Shu sabab ellikdan
 * ortiq joyni qayta yozish shart bo'lmadi va serverda ham ikkinchi kod
 * yo'li paydo bo'lmadi: shlyuz ichkarida O'SHA view ni chaqiradi
 * (`backend/apps/core/read.py`).
 */
const READ_PATH = "/read/";

export const api = {
  get: <T,>(path: string, params?: RequestOptions["params"], signal?: AbortSignal) =>
    request<T>(READ_PATH, { method: "POST", body: { path, params: params || {} }, signal }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Sahifalangan javobdan ro'yxatni oladi (paginated yoki oddiy massiv) */
export function listOf<T>(data: any): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && Array.isArray(data.results)) return data.results as T[];
  return [];
}
