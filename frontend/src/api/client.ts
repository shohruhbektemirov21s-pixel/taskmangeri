/**
 * Backend (Django REST) bilan ishlovchi yagona HTTP mijoz.
 * JWT tokenni localStorage da saqlaydi va 401 da avtomatik yangilaydi.
 */

const BASE = import.meta.env.VITE_API_URL || "/api";

const ACCESS_KEY = "tf_access";
const REFRESH_KEY = "tf_refresh";

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
    super(ApiError.readable(data) || `Xatolik (${status})`);
    this.status = status;
    this.data = data;
  }

  /** DRF xatolik javobini o'qiladigan matnga aylantiradi */
  static readable(data: any): string {
    if (!data) return "";
    if (typeof data === "string") return data;
    if (data.detail) return String(data.detail);
    const parts: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      const text = Array.isArray(val) ? val.join(" ") : String(val);
      parts.push(key === "non_field_errors" ? text : `${key}: ${text}`);
    }
    return parts.join(" | ");
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
  });

  if (res.status === 401 && retry && tokens.refresh) {
    if (await tryRefresh()) return request<T>(path, opts, false);
    tokens.clear();
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

export const api = {
  get: <T,>(path: string, params?: RequestOptions["params"]) => request<T>(path, { params }),
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
