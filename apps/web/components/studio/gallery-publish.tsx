"use client";

import { ChevronDown, Eye, EyeOff, GalleryHorizontalEnd, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FinishedPack } from "@/lib/studio";
import type { StudioCapability } from "./use-run";

interface ManagedSubmission {
  packId: string;
  publicPage: string;
  managementToken: string;
}

const storageKey = (id: string) => `oce-gallery-management:${id}`;

export function GalleryPublish({ pack, capability }: { pack: FinishedPack; capability?: StudioCapability }) {
  const isPrivate = pack.private === true || pack.studio === "remember";
  const delivered = useMemo(() => pack.artifacts.filter((artifact) => !artifact.undelivered), [pack.artifacts]);
  const images = delivered.filter((artifact) => artifact.format === "png" && artifact.url);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(isPrivate ? "" : (pack.artifacts[0]?.title ?? ""));
  const [selected, setSelected] = useState<string[]>(isPrivate ? [] : delivered.map((artifact) => artifact.id));
  const [cover, setCover] = useState<string | undefined>(isPrivate ? undefined : images[0]?.id);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [managed, setManaged] = useState<ManagedSubmission>();

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey(pack.keepsakeId)) ?? "null") as ManagedSubmission | null;
      if (stored?.packId && stored.managementToken) setManaged(stored);
    } catch {
      window.localStorage.removeItem(storageKey(pack.keepsakeId));
    }
  }, [pack.keepsakeId]);

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    if (cover === id) setCover(undefined);
  };

  const publish = async () => {
    if (!capability || title.trim().length < 3 || selected.length === 0 || !consent) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...capability,
          displayTitle: title.trim(),
          artifactIds: selected,
          ...(cover && selected.includes(cover) ? { coverArtifactId: cover } : {}),
          consent: true,
        }),
      });
      const body = (await response.json()) as ManagedSubmission & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The Gallery submission could not be created.");
      const record = { packId: body.packId, publicPage: body.publicPage, managementToken: body.managementToken };
      window.localStorage.setItem(storageKey(pack.keepsakeId), JSON.stringify(record));
      setManaged(record);
      setMessage(isPrivate ? "A separate public showcase is now in the Gallery. Your original remains private." : "This pack is now in the Gallery.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Gallery submission could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!managed) return;
    setBusy(true);
    const response = await fetch("/api/gallery", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId: managed.packId, managementToken: managed.managementToken }),
    });
    if (response.ok) {
      window.localStorage.removeItem(storageKey(pack.keepsakeId));
      setManaged(undefined);
      setMessage("Removed from the Gallery. Its public showcase link still works.");
    } else {
      setMessage("This browser no longer has the capability needed to remove that submission.");
    }
    setBusy(false);
  };

  return (
    <section className="rounded-xl border border-ink/12 bg-ground p-3.5">
      <div className="flex items-start gap-2.5">
        {isPrivate ? <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0 text-amethyst" /> : <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-amethyst" />}
        <div className="min-w-0 flex-1">
          <p className="text-[0.78rem] font-semibold text-ink/85">{isPrivate ? "Private by default" : "Unlisted by default"}</p>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-ink/55">
            {isPrivate
              ? "The /k page reveals provenance only. Publishing makes a new, redacted showcase; this keepsake never becomes public."
              : "Its /k link is shareable, but it will not appear in the Gallery unless you choose to submit it."}
          </p>
        </div>
      </div>

      {managed ? (
        <div className="mt-3 rounded-lg bg-panel/55 p-3 text-[0.7rem] leading-relaxed text-ink/65">
          <p className="flex items-center gap-1.5 font-medium text-pass"><ShieldCheck aria-hidden className="size-3.5" /> Published by you</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <a href={managed.publicPage} className="text-amethyst underline underline-offset-2">Open showcase</a>
            <button type="button" disabled={busy} onClick={() => void withdraw()} className="text-fail underline underline-offset-2 disabled:opacity-50">Remove from Gallery</button>
          </div>
        </div>
      ) : capability ? (
        <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="mt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-full border border-ink/15 px-3 py-2 text-[0.72rem] font-medium text-ink/75 hover:border-amethyst/40">
            <span className="flex items-center gap-1.5"><GalleryHorizontalEnd aria-hidden className="size-3.5" />{isPrivate ? "Create a public showcase" : "Submit to Gallery"}</span>
            <ChevronDown aria-hidden className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </summary>
          <div className="mt-3 space-y-3 border-t border-ink/8 pt-3">
            <label className="block text-[0.68rem] font-medium text-ink/65">
              Public title
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder={isPrivate ? "Use a title without names or locations" : "Gallery title"} className="mt-1 w-full rounded-lg border border-ink/15 bg-panel/35 px-2.5 py-2 text-[0.76rem] text-ink outline-none focus:border-amethyst" />
            </label>
            <fieldset>
              <legend className="text-[0.68rem] font-medium text-ink/65">Artifacts to make public</legend>
              <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto pr-1">
                {delivered.map((artifact) => (
                  <label key={artifact.id} className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-[0.68rem] text-ink/65 hover:bg-panel/60">
                    <input type="checkbox" checked={selected.includes(artifact.id)} onChange={() => toggle(artifact.id)} className="mt-0.5 accent-amethyst" />
                    <span>{artifact.title}<span className="ml-1 text-ink/40">· {artifact.kind}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {images.some((image) => selected.includes(image.id)) && (
              <label className="block text-[0.68rem] font-medium text-ink/65">
                Gallery cover
                <select value={cover ?? ""} onChange={(event) => setCover(event.target.value || undefined)} className="mt-1 w-full rounded-lg border border-ink/15 bg-panel/35 px-2.5 py-2 text-[0.72rem] text-ink">
                  <option value="">No image cover</option>
                  {images.filter((image) => selected.includes(image.id)).map((image) => <option key={image.id} value={image.id}>{image.title}</option>)}
                </select>
              </label>
            )}
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-repair/25 bg-repair/5 p-2.5 text-[0.66rem] leading-relaxed text-ink/65">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 accent-amethyst" />
              <span>{isPrivate ? "I reviewed these artifacts and understand the selected copies will be public. The original private pack, uploads, title and id remain hidden." : "I reviewed this title, cover and pack and want them discoverable in Occestra’s public Gallery."}</span>
            </label>
            <button type="button" disabled={busy || title.trim().length < 3 || selected.length === 0 || !consent} onClick={() => void publish()} className="w-full rounded-full bg-ink px-4 py-2 text-[0.72rem] font-medium text-ground disabled:cursor-not-allowed disabled:opacity-35">
              {busy ? "Publishing…" : isPrivate ? "Publish selected copies" : "Publish this pack"}
            </button>
          </div>
        </details>
      ) : (
        <p className="mt-3 text-[0.66rem] text-ink/45">Publishing controls are available in the browser that created or recovered this run.</p>
      )}
      {message && <p aria-live="polite" className="mt-2 text-[0.68rem] leading-relaxed text-ink/60">{message}</p>}
    </section>
  );
}
