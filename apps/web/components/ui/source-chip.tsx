"use client";

/**
 * Every grounded fact carries its source and retrieval time — that honesty is
 * product, so it gets its own primitive. Hover/focus reveals retrievedAt.
 */
export function SourceChip({
  source,
  retrievedAt,
  url,
  className = "",
}: {
  source: string;
  retrievedAt: string;
  url?: string;
  className?: string;
}) {
  const stamp = new Date(retrievedAt);
  const pretty = isNaN(stamp.getTime())
    ? retrievedAt
    : stamp.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const chip = (
    <span
      className={`group relative inline-flex items-center gap-1.5 rounded-full border border-ink/12 bg-ground px-2.5 py-0.5 font-mono text-[0.68rem] text-ink/65 transition-colors hover:border-ink/30 hover:text-ink ${className}`}
      tabIndex={url ? undefined : 0}
    >
      <svg aria-hidden viewBox="0 0 12 12" className="size-2.5 shrink-0 opacity-60">
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 3.2V6l1.9 1.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      {source}
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-8 left-0 z-10 rounded-md bg-ink px-2 py-1 font-mono text-[0.62rem] whitespace-nowrap text-ground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        retrieved {pretty}
      </span>
    </span>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="no-underline">
        {chip}
      </a>
    );
  }
  return chip;
}
