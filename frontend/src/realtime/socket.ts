/**
 * WebSocket ulanishi - avtomatik qayta ulanish bilan.
 *
 * Brauzer WebSocket ochayotganda header qo'sha olmaydi, shuning uchun JWT
 * so'rov satrida yuboriladi. Ulanish uzilsa (tarmoq, server qayta yuklandi)
 * kechikish bilan qayta uriniladi - har safar tokenning eng yangi nusxasi
 * olinadi, chunki HTTP mijoz uni fonda yangilab turadi.
 */
import { api, tokens } from "@/api/client";

/**
 * Serverdan kelgan hodisa.
 *
 * `event` doim bor - qolgan maydonlar hodisa turiga qarab o'zgaradi
 * (`task.update` da `project`, chat xabarida `room` va hokazo). Shuning
 * uchun qolgani `unknown`: o'qigan joy o'zi tekshirib oladi.
 */
export interface SocketMessage {
  event?: string;
  /** `event: "notification"` bilan birga keladi - turi bildirishnomaniki. */
  notification?: { kind?: string; [key: string]: unknown };
  [key: string]: unknown;
}

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

  /**
   * Ulanish manzili - CHIPTA bilan.
   *
   * Ilgari bu yerga access tokenning o'zi qo'yilardi va so'rov satri
   * hamma jurnalga tushadi (nginx, proksi) - ya'ni 12 soat yashaydigan,
   * butun API ga yaraydigan token o'sha yerda qolardi. Chipta 30 soniya
   * yashaydi va faqat soket uchun yaraydi
   * (`backend/apps/core/wsticket.py`).
   *
   * Chiptani ololmasak ESKI yo'lga qaytamiz: server `?token=` ni hali
   * ham qabul qiladi, ya'ni ulanish uzilmaydi.
   */
  async function url() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = `${proto}//${window.location.host}${path}`;
    try {
      const { ticket } = await api.post<{ ticket: string }>("/ws-ticket/");
      if (ticket) return `${base}?ticket=${encodeURIComponent(ticket)}`;
    } catch {
      /* chipta olinmadi - pastda tokenga qaytamiz */
    }
    return `${base}?token=${encodeURIComponent(tokens.access || "")}`;
  }

  async function connect() {
    if (stopped) return;
    let target: string;
    try {
      target = await url();
    } catch {
      scheduleRetry();
      return;
    }
    // Chipta so'ralayotganda `close()` chaqirilgan bo'lishi mumkin.
    if (stopped) return;
    try {
      socket = new WebSocket(target);
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
    retryTimer = window.setTimeout(() => void connect(), delay);
  }

  void connect();

  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    window.clearInterval(pingTimer);
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    socket = null;
  };
}
