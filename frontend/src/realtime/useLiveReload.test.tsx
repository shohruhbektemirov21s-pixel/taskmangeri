/**
 * Jonli yangilanish BITTA so'rovga yig'ilishi kerak.
 *
 * NEGA AYNAN SHU. Buzilganda hech qanday xato chiqmaydi va ekranda ham
 * bilinmaydi - faqat server yuklanadi. Aynan shunday bo'lgan edi:
 * sahifalar `useLive((d) => ... reload())` deb yozardi, `task.update`
 * esa loyihaning HAMMA a'zosiga ketadi va bitta amal bir nechta signal
 * tug'diradi. O'n kishi ishlayotganda har bir ochiq sahifa har bir
 * harakatga bittadan to'liq so'rov yuborardi.
 *
 * TEST HAQIQIY PROVAYDER bilan ishlaydi - faqat soket va HTTP mijoz
 * almashtirilgan. `useLive` ni alohida mock qilib bo'lmaydi: u
 * `useLiveReload` bilan bitta modulda va ichkaridan chaqiriladi.
 */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SocketMessage } from "./socket";

/** Soketning `onMessage` ilgagi - test shu orqali signal yuboradi. */
let push: ((d: SocketMessage) => void) | null = null;

vi.mock("./socket", () => ({
  openSocket: (_path: string, opts: { onMessage: (d: SocketMessage) => void }) => {
    push = opts.onMessage;
    return () => { push = null; };
  },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock("@/api/client", () => ({
  // Provayder ko'tarilganda bildirishnomalarni o'qiydi - bo'sh javob yetadi.
  api: { get: vi.fn().mockResolvedValue({ results: [], unread: 0 }), post: vi.fn() },
  listOf: () => [],
}));

const { RealtimeProvider, useLiveReload } = await import("./RealtimeContext");

function emit(data: SocketMessage) {
  push?.(data);
}

function Page({ reload, match, delay }: {
  reload: () => void;
  match?: (d: SocketMessage) => boolean;
  delay?: number;
}) {
  useLiveReload(reload, match ?? ((d) => d.event === "task.update"), delay);
  return null;
}

function mount(el: React.ReactElement) {
  return render(<RealtimeProvider>{el}</RealtimeProvider>);
}

describe("useLiveReload — signallar bitta so'rovga yig'iladi", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push = null;
  });
  afterEach(() => vi.useRealTimers());

  it("ketma-ket kelgan o'nta signal bitta qayta so'rovga aylanadi", () => {
    const reload = vi.fn();
    mount(<Page reload={reload} />);

    for (let i = 0; i < 10; i += 1) emit({ event: "task.update" });
    // Hali kutmoqda - taymer har signalda qayta qo'yiladi.
    expect(reload).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("oraliq uzun bo'lsa har biri alohida so'rov bo'ladi", () => {
    const reload = vi.fn();
    mount(<Page reload={reload} />);

    emit({ event: "task.update" });
    vi.advanceTimersByTime(400);
    emit({ event: "task.update" });
    vi.advanceTimersByTime(400);

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("mos kelmagan hodisa umuman o'tmaydi", () => {
    const reload = vi.fn();
    mount(<Page reload={reload} />);

    emit({ event: "chat.message" });
    emit({ event: "notification" });
    vi.advanceTimersByTime(1000);

    expect(reload).not.toHaveBeenCalled();
  });

  it("sahifa yopilganda kutayotgan so'rov ketmaydi", () => {
    const reload = vi.fn();
    const view = mount(<Page reload={reload} />);

    emit({ event: "task.update" });
    view.unmount();
    vi.advanceTimersByTime(1000);

    // Yopilgan sahifa uchun ma'lumot so'rashning ma'nosi yo'q.
    expect(reload).not.toHaveBeenCalled();
  });
});
