"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";

const LINKS = [
  { href: "/#studios", label: "Studios" },
  { href: "/#tribunal", label: "The Tribunal" },
  { href: "/gallery", label: "Gallery" },
  { href: "/standard", label: "The Standard" },
  { href: "/for-agents", label: "For agents" },
] as const;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow,border-color] duration-300 ${
        scrolled ? "border-b border-ink/8 bg-ground/90 shadow-[0_1px_0_rgb(23_20_26/0.04)] backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="font-serif text-[1.35rem] font-medium tracking-tight text-ink" style={{ fontVariationSettings: "'opsz' 40" }}>
          Occestra
        </Link>
        <div className="hidden items-center gap-7 md:flex">
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
        <ButtonLink href="/studio" size="sm">
          Open the Studio
        </ButtonLink>
      </nav>
    </header>
  );
}
