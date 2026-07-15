"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "oce-sound";
let sharedContext: AudioContext | undefined;

function primeAudio() {
  sharedContext ??= new window.AudioContext();
  if (sharedContext.state === "suspended") void sharedContext.resume();
  return sharedContext;
}

/** A short, original WebAudio press note: no asset, no autoplay, no licence ambiguity. */
function softSealNote() {
  const context = sharedContext;
  // A remembered preference is still subject to the browser's gesture policy.
  // Stay silent until the context has been explicitly unlocked; never fight it.
  if (!context || context.state !== "running") return;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(0.032, context.currentTime + 0.025);
  master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.82);
  master.connect(context.destination);

  for (const [frequency, offset, volume] of [[196, 0, 0.7], [293.66, 0.018, 0.3]] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + offset);
    gain.gain.setValueAtTime(volume, context.currentTime + offset);
    oscillator.connect(gain).connect(master);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + 0.86);
  }
  window.setTimeout(() => master.disconnect(), 1_100);
}

/**
 * Default OFF, persisted only after an explicit click. The commercially
 * licensed ambience track is intentionally not guessed or generated here;
 * when the owner supplies it this component is the single place to wire the
 * loop. For now the opt-in gates the seal foley and nothing else.
 */
export function SoundToggle({ className = "" }: { className?: string }) {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);

  useEffect(() => {
    let remembered = false;
    try {
      remembered = localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      /* private mode: remain safely off */
    }
    enabledRef.current = remembered;
    setEnabled(remembered);

    const unlock = () => {
      if (enabledRef.current) primeAudio();
    };
    if (remembered) {
      window.addEventListener("pointerdown", unlock, { once: true, passive: true });
      window.addEventListener("keydown", unlock, { once: true });
    }

    const seal = () => {
      if (enabledRef.current) softSealNote();
    };
    window.addEventListener("oce-seal-press", seal);
    return () => {
      window.removeEventListener("oce-seal-press", seal);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const toggle = () => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    if (next) primeAudio();
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      /* choice remains for this page */
    }
  };

  return (
    <button
      type="button"
      aria-label={enabled ? "Turn studio sound off" : "Turn studio sound on"}
      aria-pressed={enabled}
      title={enabled ? "Studio sound on" : "Studio sound off"}
      onClick={toggle}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-panel hover:text-ink ${className}`}
    >
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M3 7h2.5L9 4.3v9.4L5.5 11H3Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
        {enabled ? (
          <>
            <path d="M11.7 6.5c.75.7 1.1 1.53 1.1 2.5s-.35 1.8-1.1 2.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
            <path d="M13.7 4.7c1.25 1.18 1.85 2.62 1.85 4.3s-.6 3.12-1.85 4.3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          </>
        ) : (
          <path d="m12 7 3 3m0-3-3 3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        )}
      </svg>
      {enabled ? <span className="glow-live absolute right-1 bottom-1 size-1.5 rounded-full bg-lilac" aria-hidden /> : null}
    </button>
  );
}
