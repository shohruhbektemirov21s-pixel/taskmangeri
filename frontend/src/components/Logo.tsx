/**
 * TeamFlow brend belgisi.
 * Uchta oqim chizigi - vazifa backlogdan bajarilgangacha harakatlanishini bildiradi.
 */
export function Logo({ size = 30 }: { size?: number }) {
  const gid = `tf-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="TeamFlow">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3fb950" />
          <stop offset="0.55" stopColor="#2f81f7" />
          <stop offset="1" stopColor="#a371f7" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${gid})`} />
      <rect x="7" y="9" width="18" height="3.4" rx="1.7" fill="#0d1117" opacity="0.9" />
      <rect x="7" y="14.3" width="12.5" height="3.4" rx="1.7" fill="#0d1117" opacity="0.72" />
      <rect x="7" y="19.6" width="7" height="3.4" rx="1.7" fill="#0d1117" opacity="0.54" />
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
