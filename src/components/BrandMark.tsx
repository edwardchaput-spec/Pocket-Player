interface BrandMarkProps {
  className?: string;
}

/**
 * Pocket Player's compact equalizer/pocket/play mark.
 *
 * The surrounding UI supplies the violet tile so this glyph stays crisp from
 * the 30 px sidebar treatment through to the larger login treatment.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 20v-6" stroke="#9EF2D4" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 20V9" stroke="#9EF2D4" strokeWidth="4" strokeLinecap="round" />
      <path d="M43 20v-7" stroke="#9EF2D4" strokeWidth="4" strokeLinecap="round" />
      <path d="M13 20h38v17.7C51 46 44.3 52.1 32 56 19.7 52.1 13 46 13 37.7V20Z" fill="#FBFAFF" />
      <path
        d="M13 23c9.5 4.4 28.5 4.4 38 0"
        stroke="#D9D2FF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="m28.5 31 10 6.5-10 6.5V31Z" fill="#6048D5" />
    </svg>
  );
}
