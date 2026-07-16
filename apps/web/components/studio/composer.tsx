"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Archive, ChevronDown, PartyPopper, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PRESETS,
  DETAILED_FIELDS,
  STUDIO_BLURB,
  STUDIO_FIELDS,
  STUDIO_IDENTITY,
  STUDIO_TOOL,
  type StudioId,
  type StyleSwatch,
} from "@/lib/studio";

const STUDIOS: StudioId[] = ["celebrate", "remember", "launch"];
const STUDIO_ICON = { celebrate: PartyPopper, remember: Archive, launch: Rocket } as const;

const inputClass =
  "w-full rounded-lg border border-ink/15 bg-ground px-3 py-2 text-[0.9rem] text-ink " +
  "placeholder:text-silver focus:border-amethyst focus:outline-none";

export function Composer({
  styles,
  running,
  remaining,
  cap,
  studio,
  onStudioChange,
  onRun,
}: {
  styles: StyleSwatch[];
  running: boolean;
  remaining: number;
  cap: number;
  studio: StudioId;
  onStudioChange: (studio: StudioId) => void;
  onRun: (tool: string, args: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [styleId, setStyleId] = useState<string>();
  const [depth, setDepth] = useState<"quick" | "detailed">("quick");
  const reduced = useReducedMotion();

  useEffect(() => {
    const remembered = window.localStorage.getItem("oce-brief-depth");
    if (remembered === "detailed") setDepth("detailed");
  }, []);

  const chooseDepth = (next: "quick" | "detailed") => {
    setDepth(next);
    window.localStorage.setItem("oce-brief-depth", next);
  };

  const fields = STUDIO_FIELDS[studio];
  const set = (name: string, value: string) => setValues((prev) => ({ ...prev, [name]: value }));

  const applyPreset = (index: number) => {
    const preset = PRESETS[index]!;
    onStudioChange(preset.studio);
    setValues(preset.fields);
    setStyleId(undefined);
  };

  const submit = () => {
    const args: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.name]?.trim();
      if (!raw) continue;
      args[field.name] = field.kind === "number" ? Number(raw) : raw;
    }
    if (depth === "detailed") {
      const context: Record<string, unknown> = {};
      for (const field of DETAILED_FIELDS[studio]) {
        const raw = values[field.name]?.trim();
        if (!raw) continue;
        context[field.name] = ["doList", "dontList", "referenceLinks"].includes(field.name)
          ? raw.split(/\n|,/).map((item) => item.trim()).filter(Boolean)
          : raw;
      }
      if (Object.keys(context).length > 0) args["briefContext"] = context;
    }
    if (styleId) args["styleId"] = styleId;
    onRun(STUDIO_TOOL[studio], args);
  };

  const missingRequired = fields.some((field) => field.required && !values[field.name]?.trim());

  return (
    <div className="flex flex-col gap-5">
      {/* presets */}
      <div>
        <p className="text-kicker text-[0.62rem] text-ink/60">Try a brief</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((preset, index) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(index)}
              disabled={running}
              className="rounded-full border border-ink/15 bg-ground px-3 py-1.5 text-[0.78rem] text-ink/75 transition-colors hover:border-amethyst/50 hover:text-ink disabled:opacity-40"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* studio selector — the room changes its icon, colour and promise */}
      <div>
        <p className="text-kicker text-[0.62rem] text-ink/60">Studio</p>
        <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-lg border border-ink/15">
          {STUDIOS.map((id) => (
            <button
              key={id}
              onClick={() => {
                onStudioChange(id);
                setValues({});
              }}
              disabled={running}
              className={`flex items-center justify-center gap-1.5 px-2 py-2 text-[0.75rem] font-medium capitalize transition-all ${
                studio === id ? "text-white shadow-inner" : "bg-ground text-ink/65 hover:bg-panel"
              }`}
              style={studio === id ? { background: STUDIO_IDENTITY[id].accent } : undefined}
            >
              {(() => {
                const Icon = STUDIO_ICON[id];
                return <Icon aria-hidden className="size-3.5" strokeWidth={1.7} />;
              })()}
              {id}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.78rem] leading-relaxed text-ink/60">{STUDIO_BLURB[studio]}</p>
      </div>

      {/* quick is frictionless; detailed is depth on demand, remembered across visits */}
      <div className="rounded-xl border border-ink/10 bg-panel/35 p-1">
        <div className="grid grid-cols-2 gap-1">
          {(["quick", "detailed"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => chooseDepth(mode)}
              disabled={running}
              aria-pressed={depth === mode}
              className={`rounded-lg px-3 py-2 text-left transition-all ${depth === mode ? "bg-ground shadow-lift" : "text-ink/55 hover:text-ink"}`}
            >
              <span className="block text-[0.76rem] font-medium capitalize text-ink/85">{mode} brief</span>
              <span className="block text-[0.62rem] text-ink/50">{mode === "quick" ? "about 20 seconds" : "more context, stronger work"}</span>
            </button>
          ))}
        </div>
      </div>

      {/* fields */}
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <label key={field.name} className="block">
            <span className="mb-1 block text-[0.72rem] font-medium tracking-wide text-ink/70">
              {field.label}
              {field.required && <span className="text-amethyst"> *</span>}
            </span>
            {field.kind === "textarea" ? (
              <textarea
                rows={3}
                className={inputClass}
                placeholder={field.placeholder}
                value={values[field.name] ?? ""}
                onChange={(event) => set(field.name, event.target.value)}
                disabled={running}
              />
            ) : (
              <input
                type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
                className={inputClass}
                placeholder={field.placeholder}
                value={values[field.name] ?? ""}
                onChange={(event) => set(field.name, event.target.value)}
                disabled={running}
              />
            )}
          </label>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {depth === "detailed" && (
          <motion.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mb-3 flex items-center gap-2 border-t border-ink/10 pt-4">
              <ChevronDown aria-hidden className="size-3.5 text-amethyst" />
              <p className="text-kicker text-[0.62rem] text-ink/60">The useful details</p>
            </div>
            <div className="flex flex-col gap-3">
              {DETAILED_FIELDS[studio].map((field) => (
                <label key={field.name} className="block">
                  <span className="mb-1 block text-[0.72rem] font-medium tracking-wide text-ink/70">{field.label}</span>
                  {field.kind === "textarea" ? (
                    <textarea rows={3} className={inputClass} placeholder={field.placeholder} value={values[field.name] ?? ""} onChange={(event) => set(field.name, event.target.value)} disabled={running} />
                  ) : (
                    <input type={field.kind === "url" ? "url" : "text"} className={inputClass} placeholder={field.placeholder} value={values[field.name] ?? ""} onChange={(event) => set(field.name, event.target.value)} disabled={running} />
                  )}
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* House Styles stay compact until someone actually wants to browse the catalogue. */}
      <div>
        <p className="text-kicker text-[0.62rem] text-ink/60">House Style</p>

        {(() => {
          // A style with no appliesTo (older manifest) is treated as universally applicable.
          const suits = (style: StyleSwatch) => !style.appliesTo || style.appliesTo.includes(studio);
          const recommended = styles.filter(suits);
          const others = styles.filter((style) => !suits(style));
          const selected = styles.find((style) => style.id === styleId);
          const preview = selected ?? recommended[0] ?? styles[0];

          const swatch = (style: StyleSwatch) => (
            <button
              key={style.id}
              type="button"
              onClick={() => setStyleId(styleId === style.id ? undefined : style.id)}
              disabled={running}
              aria-pressed={styleId === style.id}
              title={style.bestFor}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                styleId === style.id ? "border-amethyst bg-lilac/15" : "border-transparent hover:border-ink/12 hover:bg-ground"
              }`}
            >
              <span className="flex h-6 w-14 shrink-0 overflow-hidden rounded-md border border-ink/8">
                {style.palette.slice(0, 6).map((hex) => (
                  <span key={hex} className="h-full flex-1" style={{ background: hex }} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.72rem] font-medium text-ink/80">{style.name}</span>
                <span className="text-data block truncate text-[0.57rem] text-ink/50">v{style.version} · {style.id}</span>
              </span>
              {styleId === style.id && <span className="text-kicker text-[0.52rem] text-amethyst">Selected</span>}
            </button>
          );

          return (
            <details className="group mt-2 rounded-xl border border-ink/12 bg-ground open:shadow-lift">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 marker:hidden">
                {preview && (
                  <span className="flex h-7 w-16 shrink-0 overflow-hidden rounded-md border border-ink/8">
                    {preview.palette.slice(0, 6).map((hex) => (
                      <span key={hex} className="h-full flex-1" style={{ background: hex }} />
                    ))}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.76rem] font-medium text-ink/85">
                    {selected?.name ?? "Studio default"}
                  </span>
                  <span className="block text-[0.6rem] text-ink/45">
                    {selected ? "Custom style selected" : `A sensible ${studio} default`} · browse all {styles.length}
                  </span>
                </span>
                <ChevronDown aria-hidden className="size-4 shrink-0 text-ink/45 transition-transform group-open:rotate-180" />
              </summary>

              <div className="max-h-72 overflow-y-auto border-t border-ink/10 p-1.5">
                <p className="px-2 pb-1 pt-1.5 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                  Recommended for {studio}
                </p>
                <div>{recommended.map(swatch)}</div>
                {others.length > 0 && (
                  <>
                    <p className="mt-1 border-t border-ink/8 px-2 pb-1 pt-2 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                      Also available
                    </p>
                    <div className="opacity-80">{others.map(swatch)}</div>
                  </>
                )}
              </div>
            </details>
          );
        })()}

        <p className="mt-1.5 text-[0.67rem] text-ink/55">Optional — changing the style changes treatment, never the subject.</p>
      </div>

      {/* run */}
      <div className="border-t border-ink/10 pt-4">
        <Button
          size="md"
          className={`w-full ${running ? "shimmer" : ""}`}
          onClick={submit}
          disabled={running || missingRequired || remaining <= 0}
        >
          {running ? "The syndicate is working…" : "Run the syndicate"}
        </Button>
        {/* a disabled button must say why, or it reads as broken */}
        {!running && missingRequired && (
          <p className="mt-2 text-[0.74rem] text-repair">
            Fill the fields marked <span className="text-amethyst">*</span> above to run.
          </p>
        )}
        {!running && !missingRequired && remaining <= 0 && cap > 0 && (
          <p className="mt-2 text-[0.74rem] text-repair">
            Today&apos;s demo credits are spent — they reset within 24 hours. Agents can still pay
            per call right now; see <a href="/for-agents" className="underline">for agents</a>.
          </p>
        )}
        <p className="mt-3 text-[0.72rem] leading-relaxed text-ink/60">
          <span className="font-medium text-ink/80">
            {remaining} of {cap} demo credits left today.
          </span>{" "}
          Demo credits are our model budget, spent for real — agents pay per call on{" "}
          <a href="/for-agents" className="text-amethyst underline decoration-amethyst/30 underline-offset-2">
            OKX.AI
          </a>{" "}
          with no such limit. Runs take one to three minutes.
        </p>
      </div>
    </div>
  );
}
