"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "oce-sound";
const AMBIENCE_SRC = "/audio/ambience.mp3";

/**
 * Quiet enough to sit under reading, not over it. This is a room tone, not a soundtrack —
 * if a visitor notices it before they notice the writing, it is too loud.
 */
const AMBIENCE_VOLUME = 0.18;
const FADE_MS = 900;

let sharedContext: AudioContext | undefined;

/**
 * One element for the whole site, created on first opt-in and never before.
 *
 * `preload="none"` is the point: the track is 8.5 MB, and a visitor who never touches the
 * toggle must not pay a byte for it. Nothing is fetched until someone asks to hear it, and
 * the browser then streams it rather than waiting for the whole file.
 */
let ambience: HTMLAudioElement | undefined;
let fadeTimer: number | undefined;

function ambienceElement(): HTMLAudioElement {
  if (!ambience) {
    ambience = new Audio();
    ambience.preload = "none";
    ambience.loop = true; // ~12 minutes, so most visits never reach the seam
    ambience.volume = 0;
    ambience.src = AMBIENCE_SRC;
    ambience.dataset["oceAmbience"] = "true";
    // Parked in the document rather than kept in a closure: it costs nothing, and it means
    // the thing making noise on someone's machine can be inspected — by devtools, and by
    // scripts/audio-check.mjs, which otherwise can only prove the file was fetched.
    ambience.hidden = true;
    document.body.append(ambience);
  }
  return ambience;
}

/** Ramp rather than cut — an ambience that snaps on is worse than no ambience. */
function fadeTo(element: HTMLAudioElement, target: number, onDone?: () => void): void {
  if (fadeTimer) window.clearInterval(fadeTimer);

  const start = element.volume;
  const startedAt = performance.now();

  fadeTimer = window.setInterval(() => {
    const progress = Math.min(1, (performance.now() - startedAt) / FADE_MS);
    element.volume = start + (target - start) * progress;
    if (progress >= 1) {
      window.clearInterval(fadeTimer);
      fadeTimer = undefined;
      onDone?.();
    }
  }, 40);
}

function startAmbience(): void {
  const element = ambienceElement();
  // A promise rejection here is the browser's autoplay policy doing its job, not an error:
  // stay silent and wait for a real gesture rather than fighting it.
  void element.play().then(
    () => fadeTo(element, AMBIENCE_VOLUME),
    () => undefined,
  );
}

function stopAmbience(): void {
  if (!ambience) return;
  const element = ambience;
  fadeTo(element, 0, () => element.pause());
}

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
 * Default OFF, persisted only after an explicit click.
 *
 * Nothing here ever plays uninvited: no autoplay, no "this site would like to play sound"
 * prompt, no sound on a first visit. A visitor who never touches the toggle never downloads
 * the track and never hears anything. The owner-supplied ambience is wired to the same single
 * opt-in that already gated the seal foley, and a remembered "on" still waits for a real
 * gesture, because a remembered preference is not consent the browser will accept.
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

    // A remembered "on" is a preference, not a gesture. Browsers require the latter, so the
    // ambience waits here for the visitor's first real interaction with the page.
    const unlock = () => {
      if (!enabledRef.current) return;
      primeAudio();
      startAmbience();
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

    // The click itself is the gesture, so this is the one moment the ambience is allowed to
    // begin — and the only moment the file is ever fetched.
    if (next) {
      primeAudio();
      startAmbience();
    } else {
      stopAmbience();
    }

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
