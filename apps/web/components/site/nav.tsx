"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme";
import { Wordmark } from "@/components/site/wordmark";

const LINKS = [
  { href: "/#studios", label: "Studios" },
  { href: "/gallery", label: "Gallery" },
  { href: "/standard", label: "The Standard" },
  { href: "/evaluation", label: "Evaluation" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-agents", label: "For agents" },
  { href: "/docs", label: "Docs" },
] as const;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow,border-color] duration-300 ${
        scrolled || open
          ? "border-b border-ink/8 bg-ground/90 shadow-[0_1px_0_rgb(23_20_26/0.04)] backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Wordmark height={30} priority />

        <div className="hidden items-center gap-6 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              className="text-[0.85rem] text-ink/60 transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/stats"
            prefetch={false}
            className="hidden items-center gap-1.5 rounded-full border border-ink/10 px-2.5 py-1 text-[0.78rem] text-ink/60 transition-colors hover:border-ink/20 hover:text-ink sm:inline-flex"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amethyst/70" />
              <span className="glow-live relative inline-flex h-1.5 w-1.5 rounded-full bg-amethyst" />
            </span>
            Live stats
          </Link>

          <ThemeToggle className="-ml-1" />

          <ButtonLink href="/studio" size="sm">
            Open the Studio
          </ButtonLink>

          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="-mr-1 flex h-9 w-9 items-center justify-center rounded-md text-ink/70 transition-colors hover:text-ink lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d={open ? "M4 4 L14 14 M14 4 L4 14" : "M2 5h14 M2 9h14 M2 13h14"}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>
      </nav>

      {open ? (
        <div className="border-t border-ink/8 bg-ground/95 backdrop-blur-md lg:hidden">
          <div className="mx-auto grid max-w-6xl gap-1 px-5 py-4 sm:px-8">
            {[...LINKS, { href: "/stats", label: "Live stats" } as const].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                onClick={() => setOpen(false)}
                className="rounded-md py-2 text-[0.95rem] text-ink/70 transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}
