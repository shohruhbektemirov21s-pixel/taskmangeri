import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, tokens } from "@/api/client";
import type { MetaData, User } from "@/api/types";

interface AuthState {
  user: User | null;
  meta: MetaData | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: Record<string, unknown>) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMeta = useCallback(async () => {
    try {
      setMeta(await api.get<MetaData>("/meta/"));
    } catch {
      /* meta bo'lmasa ham ilova ishlaydi */
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!tokens.access) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<User>("/auth/me/");
      setUser(me);
      await loadMeta();
    } catch {
      tokens.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [loadMeta]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<{ access: string; refresh: string; user: User }>(
        "/auth/login/",
        { email, password }
      );
      tokens.set(data.access, data.refresh);
      setUser(data.user);
      await loadMeta();
    },
    [loadMeta]
  );

  const register = useCallback(
    async (payload: Record<string, unknown>) => {
      const data = await api.post<{ access: string; refresh: string; user: User }>(
        "/auth/register/",
        payload
      );
      tokens.set(data.access, data.refresh);
      setUser(data.user);
      await loadMeta();
    },
    [loadMeta]
  );

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, meta, loading, login, register, logout, refreshUser }),
    [user, meta, loading, login, register, logout, refreshUser]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
