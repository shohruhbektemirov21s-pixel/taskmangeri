/**
 * Tashqaridan kelgan identifikatorli havola to'g'ri yechiladimi.
 *
 * NEGA AYNAN SHU. Bu buzilganda hech qanday xato chiqmaydi: sahifa
 * ochiladi, faqat boshqa sahifa. Aynan shunday bo'lgan edi -
 * `/vazifa/75` mos marshrut topmay `path="*"` ga tushar va odam
 * «Bosh panel» da paydo bo'lardi. Bildirishnomadagi va Telegramdagi
 * har bir havola shu yo'ldan o'tadi.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";

import Resolve from "./Resolve";

/** Yechilgandan keyin qayerga tushganini ko'rsatadigan yordamchi sahifa. */
function Landed({ name }: { name: string }) {
  const loc = useLocation();
  return (
    <div>
      <span data-testid="path">{name}</span>
      <span data-testid="state">{JSON.stringify(loc.state ?? null)}</span>
    </div>
  );
}

function open(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/vazifa/:id" element={<Resolve kind="task" />} />
        <Route path="/loyiha/:id/:tab" element={<Resolve kind="project" />} />
        <Route path="/xabarlar/:id" element={<Resolve kind="messages" />} />
        <Route path="/ish-maydoni/:slug/chat" element={<Resolve kind="workspace-chat" />} />

        <Route path="/vazifa" element={<Landed name="/vazifa" />} />
        <Route path="/loyiha/:tab?" element={<Landed name="/loyiha" />} />
        <Route path="/xabarlar" element={<Landed name="/xabarlar" />} />
        <Route path="/ish-maydoni/chat" element={<Landed name="/ish-maydoni/chat" />} />
        <Route path="/bildirishnomalar" element={<Landed name="/bildirishnomalar" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Resolve — identifikatorli havolani holatga aylantiradi", () => {
  beforeEach(() => sessionStorage.clear());

  it("vazifa havolasi vazifa sahifasini ochadi", async () => {
    open("/vazifa/75");
    expect((await screen.findByTestId("path")).textContent).toBe("/vazifa");
    expect(screen.getByTestId("state").textContent).toBe('{"task":"75"}');
  });

  it("loyiha havolasi bo'limi bilan birga ochiladi", async () => {
    open("/loyiha/6/jamoa");
    expect((await screen.findByTestId("path")).textContent).toBe("/loyiha");
    expect(screen.getByTestId("state").textContent).toBe('{"project":"6"}');
  });

  it("yozishma havolasi suhbatdosh bilan ochiladi", async () => {
    open("/xabarlar/12");
    expect((await screen.findByTestId("path")).textContent).toBe("/xabarlar");
    expect(screen.getByTestId("state").textContent).toBe('{"user":"12"}');
  });

  it("ish maydoni suhbati manzil (slug) bilan ochiladi", async () => {
    open("/ish-maydoni/mening-maydonim/chat");
    expect((await screen.findByTestId("path")).textContent).toBe("/ish-maydoni/chat");
    expect(screen.getByTestId("state").textContent).toBe('{"workspace":"mening-maydonim"}');
  });

  it("raqam bo'lmagan identifikator «vazifa 0» ni ochmaydi", async () => {
    // Yaroqsiz havola bildirishnomalar ro'yxatiga olib boradi - oq ekran
    // ham, tasodifiy yozuv ham qolmaydi.
    open("/vazifa/qaysidir");
    expect((await screen.findByTestId("path")).textContent).toBe("/bildirishnomalar");
  });
});
