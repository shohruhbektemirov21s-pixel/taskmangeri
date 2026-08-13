/**
 * Kunduzgi/kechki rejim tugmasi.
 *
 * Bitta tugma — ikkita holat: quyosh belgisi turgan bo'lsa bosish kunduzgi
 * rejimga o'tkazadi. Tanlov brauzerda saqlanadi, keyingi kirishda ham shu
 * rejimda ochiladi (`theme.ts`).
 */
import { IconMoon, IconSun } from "./icons";
import { useTheme } from "@/theme";

export default function ThemeToggle({ className = "top-icon" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const toLight = theme === "dark";

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      title={toLight ? "Kunduzgi rejim" : "Kechki rejim"}
      aria-label={toLight ? "Kunduzgi rejimga o'tish" : "Kechki rejimga o'tish"}
      aria-pressed={!toLight}
    >
      {toLight ? <IconSun size={17} /> : <IconMoon size={17} />}
    </button>
  );
}
