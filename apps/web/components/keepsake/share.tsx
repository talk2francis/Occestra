"use client";

import { useState } from "react";

export function ShareRow({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOnX = () => {
    const text = `${title} — made and sealed by Occestra, verifiable on X Layer.`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`,
      "_blank",
      "noopener",
    );
  };

  const chip =
    "rounded-full border border-ink/15 px-4 py-1.5 text-[0.8rem] font-medium text-ink/70 transition-colors hover:border-ink/40 hover:text-ink";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={copy} className={chip}>
        {copied ? "Link copied" : "Copy link"}
      </button>
      <button onClick={shareOnX} className={chip}>
        Share on X
      </button>
    </div>
  );
}
