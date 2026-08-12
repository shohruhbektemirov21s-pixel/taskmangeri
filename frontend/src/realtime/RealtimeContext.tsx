/**
 * Foydalanuvchining shaxsiy real-time kanali.
 *
 * Bitta WebSocket butun ilovaga xizmat qiladi: bildirishnomalar shu yerga
 * tushadi, boshqa komponentlar esa `subscribe()` orqali xohlagan hodisani
 * eshitadi (masalan taklif kelganda takliflar ro'yxatini yangilash).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, listOf } from "@/api/client";
import type { AppNotification } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { openSocket } from "./socket";
import type { SocketMessage } from "./socket";

interface RealtimeState {
  notifications: AppNotification[];
  unread: number;
  connected: boolean;
  reload: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  subscribe: (fn: (data: SocketMessage) => void) => () => void;
}

const Ctx = createContext<RealtimeState>(null as unknown as RealtimeState);

const KEEP = 50; // ro'yxatda saqlanadigan eng so'nggi bildirishnomalar soni

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [connected, setConnected] = useState(false);

  const listeners = useRef(new Set<(data: SocketMessage) => void>());
  const seen = useRef(new Set<number>());

  const reload = useCallback(async () => {
    try {
      const data = await api.get<any>("/notifications/", { page_size: KEEP });
      const items = listOf<AppNotification>(data);
      setNotifications(items);
      seen.current = new Set(items.map((n) => n.id));
      const { unread: n } = await api.get<{ unread: number }>("/notifications/unread-count/");
      setUnread(n);
    } catch {
      /* tarmoq yo'q bo'lsa ham ilova ishlayveradi */
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnread(0);
      seen.current.clear();
      return;
    }

    void reload();

    const close = openSocket("/ws/notifications/", {
      onStatus: setConnected,
      onMessage: (data) => {
        if (data.event === "ready") setUnread(Number(data.unread) || 0);

        if (data.event === "notification" && data.notification) {
          const item = data.notification as AppNotification;
          // Chat xabarlari bitta yozuvga yig'iladi - o'sha id qayta kelsa
          // o'qilmaganlar sonini oshirmaymiz.
          if (!seen.current.has(item.id)) {
            seen.current.add(item.id);
            setUnread((n) => n + 1);
          }
          setNotifications((prev) =>
            [item, ...prev.filter((n) => n.id !== item.id)].slice(0, KEEP));
        }

        listeners.current.forEach((fn) => fn(data));
      },
    });

    return () => {
      close();
      setConnected(false);
    };
  }, [user?.id, reload]);

  const markRead = useCallback(async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnread((n) => Math.max(0, n - 1));
    try {
      await api.post(`/notifications/${id}/read/`);
    } catch {
      void reload();
    }
  }, [reload]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    try {
      await api.post("/notifications/read-all/");
    } catch {
      void reload();
    }
  }, [reload]);

  const subscribe = useCallback((fn: (data: SocketMessage) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const value = useMemo(
    () => ({ notifications, unread, connected, reload, markRead, markAllRead, subscribe }),
    [notifications, unread, connected, reload, markRead, markAllRead, subscribe]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRealtime() {
  return useContext(Ctx);
}
