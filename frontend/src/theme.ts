/**
 * Kunduzgi / kechki rejim.
 *
 * Tanlov `<html data-theme="light|dark">` da turadi — CSS shu belgiga qarab
 * boshqa palitrani oladi (`styles/app.css`). Sahifa ochilishidayoq to'g'ri
 * rangda bo'lishi uchun uni `index.html` dagi kichik skript qo'yib ketadi:
 * React yuklanguncha kutsak, kunduzgi rejimdagi odam bir lahza qora ekranni
 * ko'rib qoladi.
 *
 * Odam o'zi tanlamagan bo'lsa tizim sozlamasiga ergashamiz — noutbuk kechqurun
 * qorong'i rejimga o'tsa, TeamFlow ham o'tadi.
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

/** localStorage kaliti — `index.html` dagi skript ham shuni o'qiydi. */
export const THEME_KEY = "teamflow.theme";

export function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Odam tanlagan rejim; tanlamagan bo'lsa `null`. */
export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    // Shaxsiy rejimda localStorage taqiqlangan bo'lishi mumkin - rejim
    // ishlayveradi, faqat esda qolmaydi.
    return null;
  }
}

export function currentTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === "light" || attr === "dark") return attr;
  return storedTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch { /* jim */ }
}

/** Rejimni o'qish va almashtirish. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // `index.html` dagi skript negadir ishlamay qolsa ham belgi joyida tursin -
  // aks holda tugma "kunduzgi" deb tursa-yu, sahifa qorong'i qolib ketardi.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Tizim rejimi almashsa ergashamiz - lekin faqat odam o'zi tanlamagan bo'lsa.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (storedTheme()) return;
      const next = systemTheme();
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
