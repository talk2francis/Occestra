import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium " +
  "transition-[background-color,color,border-color,transform,box-shadow] duration-200 " +
  "ease-(--ease-editorial) active:scale-[0.985] select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  // Ink, not purple: the primary action is confident, the accent stays scarce.
  // glow-cta is inert by day; by night the primary action blooms softly.
  primary:
    "bg-ink text-ground shadow-lift hover:bg-plum hover:shadow-keepsake glow-cta",
  outline:
    "border border-ink/20 text-ink hover:border-ink/50 hover:bg-panel",
  ghost: "text-ink/70 hover:text-ink hover:bg-panel",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[0.83rem]",
  md: "h-11 px-6 text-[0.93rem]",
  lg: "h-13 px-8 text-base",
};

interface ButtonOwnProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonOwnProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  children,
  href,
  ...rest
}: ButtonOwnProps & ComponentPropsWithoutRef<typeof Link>) {
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
