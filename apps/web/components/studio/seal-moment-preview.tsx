"use client";

/**
 * Styleguide-only harness: replays the SealMoment with the real sealed pack's
 * numbers so the animation can be tuned and recorded. A component preview,
 * clearly labelled — not product data.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefusalNotice, SealMoment } from "./seal-moment";

export function SealMomentPreview() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" data-testid="play-seal" onClick={() => setPlaying(true)}>
          Play the seal moment
        </Button>
      </div>
      {playing && (
        <SealMoment
          data={{
            passRate: 0.8,
            repairedCount: 2,
            sealed: true,
            keepsakeId: "oce_01kxbz33bb4grnd1xh0gev",
          }}
          onDone={() => setPlaying(false)}
        />
      )}
      <div className="max-w-lg">
        <RefusalNotice message="Occestra doesn't produce work involving third-party franchises or a real person's likeness — that rule protects everyone whose moment we make. Rework the brief around your own people and your own story, and the studio is yours." />
      </div>
    </div>
  );
}
