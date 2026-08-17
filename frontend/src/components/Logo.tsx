/**
 * TeamFlow brend belgisi.
 * Uchta oqim chizigi - vazifa backlogdan bajarilgangacha harakatlanishini bildiradi.
 */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    // Bir tekis ko'k kvadratcha, ustida oq oqim chiziqlari - dizayndagidek.
    // Rang `--accent` dan olinadi: kechki rejimda u yorug'roq ko'kka
    // aylanadi va belgi qorong'i sathda ham ajralib turadi.
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="TeamFlow">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--accent, #3562ff)" />
      <rect x="7" y="9" width="18" height="3.4" rx="1.7" fill="#fff" />
      <rect x="7" y="14.3" width="12.5" height="3.4" rx="1.7" fill="#fff" opacity="0.8" />
      <rect x="7" y="19.6" width="7" height="3.4" rx="1.7" fill="#fff" opacity="0.6" />
    </svg>
  );
}

export function LogoWord({ size = 30 }: { size?: number }) {
  return (
    <>
      <Logo size={size} />
      <span>TeamFlow</span>
    </>
  );
}
