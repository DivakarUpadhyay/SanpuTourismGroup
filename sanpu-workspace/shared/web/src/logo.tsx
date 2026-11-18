/** Brand mark: a plain drawn symbol that takes the text colour, so it works on light and dark. The favicons (app/icon.svg) use the same drawing. */
export function BrandMark({ size = 28 }: { size?: number; className?: string }) {
  const erp = process.env.NEXT_PUBLIC_COOKIE_PREFIX === "erp";
  return (
    <svg className="brand-glyph" width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden="true">
      {erp
        // Sanpu Travel: an S drawn as a winding route that ends at a destination point
        ? <path d="M42 10H24a12.5 12.5 0 0 0 0 25h16a9.5 9.5 0 0 1 0 19H12" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        // Sanpu AI Travel: the assistant's spark
        : <path d="M28 10c2.6 14.5 9.5 21.4 24 24-14.5 2.6-21.4 9.5-24 24-2.6-14.5-9.5-21.4-24-24 14.5-2.6 21.4-9.5 24-24Z" fill="currentColor" />}
      <circle cx={erp ? 54 : 52} cy={erp ? 10 : 12} r="7" fill="#F5B82E" />
    </svg>
  );
}

/** Full logo: mark + word mark. */
export function BrandLogo({ name, size = 28 }: { name: string; size?: number }) {
  return <span className="brand-logo"><BrandMark size={size} /><span className="brand-name">{name}</span></span>;
}
