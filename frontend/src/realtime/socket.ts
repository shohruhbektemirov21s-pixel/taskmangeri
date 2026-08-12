/**
 * WebSocket ulanishi - avtomatik qayta ulanish bilan.
 *
 * Brauzer WebSocket ochayotganda header qo'sha olmaydi, shuning uchun JWT
 * so'rov satrida yuboriladi. Ulanish uzilsa (tarmoq, server qayta yuklandi)
 * kechikish bilan qayta uriniladi - har safar tokenning eng yangi nusxasi
 * olinadi, chunki HTTP mijoz uni fonda yangilab turadi.
 */
import { tokens } from "@/api/client";

export type SocketMessage = Record<string, any>;

export interface SocketOptions {
  onMessage: (data: SocketMessage) => void;
  onStatus?: (connected: boolean) => void;
}

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

export function openSocket(path: string, { onMessage, onStatus }: SocketOptions) {
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retryTimer: number | undefined;
  let pingTimer: number | undefined;

  function url() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = encodeURIComponent(tokens.access || "");
    return `${proto}//${window.location.host}${path}?token=${token}`;
  }

  function connect() {
    if (stopped) return;
    try {
      socket = new WebSocket(url());
    } catch {
      scheduleRetry();
      return;
    }

    socket.onopen = () => {
      attempt = 0;
      onStatus?.(true);
      pingTimer = window.setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ event: "ping" }));
        }
      }, PING_MS);
    };

    socket.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        /* noto'g'ri formatdagi xabarni e'tiborsiz qoldiramiz */
      }
    };

    socket.onclose = () => {
      window.clearInterval(pingTimer);
      onStatus?.(false);
      scheduleRetry();
    };

    socket.onerror = () => socket?.close();
  }

  function scheduleRetry() {
    if (stopped) return;
    attempt += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 800 * 2 ** Math.min(attempt, 5));
    retryTimer = window.setTimeout(connect, delay);
  }

  connect();

  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    window.clearInterval(pingTimer);
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    socket = null;
  };
}
