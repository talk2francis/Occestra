"use client";

/**
 * Amethyst Daylight / Amethyst Nocturne switching.
 *
 * The theme is a data-theme attribute on <html>, decided BEFORE first paint by
 * the inline THEME_SCRIPT below (explicit choice in localStorage, else system
 * preference) — so there is never a flash of the wrong theme. The toggle just
 * flips the attribute and persists; the icon is driven by CSS visibility rules
 * on [data-theme], so the SSR markup is theme-agnostic and hydration can never
 * mismatch.
 */

export type Theme = "daylight" | "nocturne";

export const THEME_STORAGE_KEY = "oce-theme";

/** Runs inline in <head>-position, before any content paints. Keep it tiny. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="daylight"&&t!=="nocturne"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"nocturne":"daylight"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="daylight"}})()`;

function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* private mode: the choice just doesn't persist */
  }
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", next === "nocturne" ? "#17131C" : "#FAF7F2");
  });
  window.dispatchEvent(new CustomEvent<Theme>("oce-themechange", { detail: next }));
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Switch between day and night theme"
      onClick={() => {
        const current = document.documentElement.dataset.theme;
        applyTheme(current === "nocturne" ? "daylight" : "nocturne");
      }}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-panel hover:text-ink ${className}`}
    >
      {/* moon shown by day (what you'd switch to), sun shown by night */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="theme-daylight-only"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M13.2 9.7a5.6 5.6 0 0 1-6.9-6.9 5.6 5.6 0 1 0 6.9 6.9Z" strokeLinejoin="round" />
      </svg>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="theme-nocturne-only"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <circle cx="8" cy="8" r="3.1" />
        <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" />
      </svg>
    </button>
  );
}
