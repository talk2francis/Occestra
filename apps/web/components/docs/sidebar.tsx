"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV, docHref } from "@/lib/docs-nav";

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      {/* horizontal scroll on small screens, quiet column on large */}
      <nav className="no-scrollbar flex min-w-0 gap-1 overflow-x-auto lg:flex-col">
        {DOCS_NAV.map((entry) => {
          const href = docHref(entry.slug);
          const active = pathname === href;
          return (
            <Link
              key={entry.slug}
              href={href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[0.85rem] transition-colors ${
                active ? "bg-panel font-medium text-ink" : "text-ink/60 hover:bg-panel/60 hover:text-ink"
              }`}
            >
              {entry.title}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
