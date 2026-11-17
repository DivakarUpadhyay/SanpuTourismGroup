/** Brand mark: mountains, sun and sea on a rounded tile (original artwork). The same drawing is used for the favicon (app/icon.svg). */
export function BrandMark({ size = 28, className = "brand-mark" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="bm-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0B5CAD" /><stop offset="1" stopColor="#0B1F3A" /></linearGradient>
        <linearGradient id="bm-mt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#CFE3F7" /></linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#bm-bg)" />
      <circle cx="45" cy="19" r="6" fill="#F5B82E" />
      <path d="M8 46 L23 26 L31 36 L40 23 L56 46 Z" fill="url(#bm-mt)" />
      <path d="M8 52 C16 47 24 56 32 51 C40 46 48 55 56 50" fill="none" stroke="#7FD1E6" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

/** Full logo: mark + word mark. */
export function BrandLogo({ name, size = 28 }: { name: string; size?: number }) {
  return <span className="brand-logo"><BrandMark size={size} /><span className="brand-name">{name}</span></span>;
}
