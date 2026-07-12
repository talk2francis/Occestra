import type { ComponentPropsWithoutRef } from "react";

/**
 * A quiet paper panel. Deliberately not a "product card" — hairline border,
 * warm panel tone, no uniform drop shadow. Compose freely; never grid these
 * identically (AGENTS.md).
 */
export function Card({
  className = "",
  children,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={`rounded-2xl border border-ink/10 bg-panel/70 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
