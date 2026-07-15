"use client";

import { useState } from "react";

/** Ink panel, mono type, one-tap copy. The docs' workhorse. */
export function CodeBlock({
  title,
  children,
  lang,
}: {
  title?: string;
  lang?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-5 min-w-0 overflow-hidden rounded-2xl border border-night-fg/12 bg-night">
      <div className="flex items-center justify-between border-b border-night-fg/10 px-4 py-2">
        <p className="text-data text-night-fg/60">{title ?? lang ?? "shell"}</p>
        <button
          onClick={copy}
          className="rounded-full border border-night-fg/20 px-3 py-0.5 text-[0.7rem] font-medium text-night-fg/70 transition-colors hover:border-night-fg/50 hover:text-night-fg"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[0.74rem] leading-relaxed text-night-fg/85">
        <code>{children.trim()}</code>
      </pre>
    </div>
  );
}
