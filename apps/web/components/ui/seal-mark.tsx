import { useId } from "react";

/**
 * The provenance seal. Ring text + the concentric-square check from the real
 * generated brand mark. One color, stamped — like ink, not like a badge icon.
 */
export function SealMark({
  size = 96,
  className = "text-amethyst",
  title = "Sealed on X Layer",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <path id={`${id}-ring`} d="M 60,60 m -44,0 a 44,44 0 1,1 88,0 a 44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="60" cy="60" r="53.5" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
      <text
        fontSize="9.2"
        fontWeight="600"
        letterSpacing="2.6"
        fill="currentColor"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <textPath href={`#${id}-ring`} startOffset="0">
          SEALED ON X LAYER · OCCESTRA · EIP-712 ·
        </textPath>
      </text>
      <g transform="translate(60 60)">
        <rect x="-19" y="-19" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <rect x="-12" y="-12" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M -6.5 0.5 L -1.5 5.5 L 7.5 -5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
