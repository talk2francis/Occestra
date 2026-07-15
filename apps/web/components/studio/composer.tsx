"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PRESETS,
  STUDIO_BLURB,
  STUDIO_FIELDS,
  STUDIO_TOOL,
  type StudioId,
  type StyleSwatch,
} from "@/lib/studio";

const STUDIOS: StudioId[] = ["celebrate", "remember", "launch"];

const inputClass =
  "w-full rounded-lg border border-ink/15 bg-ground px-3 py-2 text-[0.9rem] text-ink " +
  "placeholder:text-silver focus:border-amethyst focus:outline-none";

export function Composer({
  styles,
  running,
  remaining,
  cap,
  onRun,
}: {
  styles: StyleSwatch[];
  running: boolean;
  remaining: number;
  cap: number;
  onRun: (tool: string, args: Record<string, unknown>) => void;
}) {
  const [studio, setStudio] = useState<StudioId>("celebrate");
  const [values, setValues] = useState<Record<string, string>>({});
  const [styleId, setStyleId] = useState<string>();

  const fields = STUDIO_FIELDS[studio];
  const set = (name: string, value: string) => setValues((prev) => ({ ...prev, [name]: value }));

  const applyPreset = (index: number) => {
    const preset = PRESETS[index]!;
    setStudio(preset.studio);
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

      {/* studio selector */}
      <div>
        <p className="text-kicker text-[0.62rem] text-ink/60">Studio</p>
        <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-lg border border-ink/15">
          {STUDIOS.map((id) => (
            <button
              key={id}
              onClick={() => {
                setStudio(id);
                setValues({});
              }}
              disabled={running}
              className={`px-2 py-2 text-[0.78rem] font-medium capitalize transition-colors ${
                studio === id ? "bg-ink text-ground" : "bg-ground text-ink/65 hover:bg-panel"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.78rem] leading-relaxed text-ink/60">{STUDIO_BLURB[studio]}</p>
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

      {/* house style — recommended for this studio first, the rest below the rule */}
      <div>
        <p className="text-kicker text-[0.62rem] text-ink/60">House Style</p>

        {(() => {
          // A style with no appliesTo (older manifest) is treated as universally applicable.
          const suits = (style: StyleSwatch) => !style.appliesTo || style.appliesTo.includes(studio);
          const recommended = styles.filter(suits);
          const others = styles.filter((style) => !suits(style));

          const swatch = (style: StyleSwatch) => (
            <button
              key={style.id}
              onClick={() => setStyleId(styleId === style.id ? undefined : style.id)}
              disabled={running}
              aria-pressed={styleId === style.id}
              title={style.bestFor}
              className={`rounded-lg border p-2 text-left transition-colors ${
                styleId === style.id ? "border-amethyst bg-lilac/15" : "border-ink/12 bg-ground hover:border-ink/30"
              }`}
            >
              <span className="flex h-4 overflow-hidden rounded-sm">
                {style.palette.slice(0, 6).map((hex) => (
                  <span key={hex} className="h-full flex-1" style={{ background: hex }} />
                ))}
              </span>
              <span className="mt-1.5 block text-[0.72rem] font-medium text-ink/80">{style.name}</span>
              <span className="text-data block text-[0.6rem] text-ink/60">v{style.version} · {style.id}</span>
            </button>
          );

          return (
            <>
              <p className="mt-2 text-[0.64rem] text-ink/45">Recommended for {studio}</p>
              <div className="mt-1 grid grid-cols-2 gap-2">{recommended.map(swatch)}</div>
              {others.length > 0 && (
                <>
                  <p className="mt-3 text-[0.64rem] text-ink/45">Other styles</p>
                  <div className="mt-1 grid grid-cols-2 gap-2 opacity-75">{others.map(swatch)}</div>
                </>
              )}
            </>
          );
        })()}

        <p className="mt-1.5 text-[0.7rem] text-ink/60">Optional — each studio has a sensible default.</p>
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
