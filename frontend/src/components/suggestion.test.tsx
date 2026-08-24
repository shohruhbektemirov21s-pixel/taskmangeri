/**
 * Boshliqning javob qutisi: nima ko'rsatiladi va nima KO'RSATILMAYDI.
 *
 * NEGA TEST KERAK. Ikkala qoida ham «yo'qlik» haqida - ular buzilganda
 * ekranda xato chiqmaydi, aksincha, ORTIQCHA narsa paydo bo'ladi va uni
 * faqat qarab turgan odam sezadi:
 *
 *   1. Qaror qilingan taklifda KIM qaror qilgani yozilmaydi - qaror
 *      qiladigan rol bitta va ismni takrorlash qutini uzaytiradi.
 *   2. Javob kutayotganda esa qator QOLADI - u boshqa narsani aytadi:
 *      taklif e'tibordan chetda emas.
 *
 * `tx()` lug'ati bu yerda bo'sh, ya'ni u kalitning o'zini qaytaradi.
 * Test shu sabab MATNGA emas, tuzilishga va ma'lumotga qaraydi.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DecisionBox } from "./suggestion";
import type { Suggestion } from "@/api/types";

const BOSS = {
  id: 7,
  full_name: "Katta Boshliq",
  email: "boss@teamflow.uz",
} as unknown as Suggestion["decided_by"];

function make(extra: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 1,
    title: "Ish vaqtini moslashuvchan qilaylik",
    body: "Ertalab 8 dan 11 gacha boshlash imkoni bo'lsin.",
    status: "PENDING",
    status_display: "Ko'rib chiqilmoqda",
    scope: "OPEN",
    scope_display: "Ochiq",
    is_anonymous: false,
    author: null,
    decided_by: null,
    decided_at: null,
    decision_note: "",
    created_at: "2026-08-01T10:00:00+0500",
    for_count: 0,
    against_count: 0,
    neutral_count: 0,
    my_vote: null,
    files: [],
    is_mine: false,
    can_edit: false,
    ...extra,
  } as unknown as Suggestion;
}

describe("DecisionBox — qaror qutisi", () => {
  it("qaror qilinganda KIM qaror qilgani yozilmaydi", () => {
    render(<DecisionBox item={make({
      status: "REJECTED",
      status_display: "Rad etilgan",
      decision_note: "bu turi kelmaydi",
      decided_by: BOSS,
      decided_at: "2026-08-03T09:00:00+0500",
    })} />);

    // Qaror va SABABI - kerak.
    expect(screen.getByText("Rad etilgan")).toBeDefined();
    expect(screen.getByText("bu turi kelmaydi")).toBeDefined();
    // Qaror qilgan odamning ismi - kerak emas.
    expect(screen.queryByText(/Katta Boshliq/)).toBeNull();
  });

  it("tasdiqlanganda ham ism chiqmaydi", () => {
    const { container } = render(<DecisionBox item={make({
      status: "APPROVED",
      status_display: "Tasdiqlangan",
      decision_note: "roziman",
      decided_by: BOSS,
      decided_at: "2026-08-03T09:00:00+0500",
    })} />);

    expect(container.textContent).not.toContain("Katta Boshliq");
    expect(container.querySelector(".sg-decision.ok")).not.toBeNull();
  });

  it("javob kutayotganda «ko'rilmoqda» qatori QOLADI", () => {
    const { container } = render(<DecisionBox item={make()} />);

    // Bu qator boshqa narsani aytadi: taklif e'tibordan chetda emas.
    expect(container.querySelector(".sg-decision.wait")).not.toBeNull();
    expect(container.querySelectorAll(".muted").length).toBeGreaterThanOrEqual(2);
  });

  it("izohsiz qarorda bo'sh xat qatori chizilmaydi", () => {
    const { container } = render(<DecisionBox item={make({
      status: "APPROVED",
      status_display: "Tasdiqlangan",
      decision_note: "",
      decided_by: BOSS,
    })} />);

    expect(container.querySelector("p")).toBeNull();
  });
});
