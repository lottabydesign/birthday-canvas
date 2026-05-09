"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAudio } from "./AudioProvider";

const FLAG_KEY = "kams-intro-shown";

// "for your eyes only" with stylised italics on f / eyes / y.
// Defined once at module scope so the per-char total is a stable constant
// the typewriter loop can rely on.
const TITLE_SEGMENTS: { text: string; italic: boolean }[] = [
  { text: "f", italic: true },
  { text: "or your ", italic: false },
  { text: "eyes", italic: true },
  { text: " onl", italic: false },
  { text: "y", italic: true },
];
const TITLE_TOTAL_CHARS = TITLE_SEGMENTS.reduce((n, s) => n + s.text.length, 0);
const TYPE_INTERVAL_MS = 70; // ~14 chars/sec — deliberate but not slow.

function shouldShowIntro(): boolean {
  if (typeof window === "undefined") return false;
  // ?intro forces a replay (dev / demos)
  const url = new URL(window.location.href);
  if (url.searchParams.has("intro")) return true;
  try {
    return localStorage.getItem(FLAG_KEY) !== "1";
  } catch {
    return true;
  }
}

function markIntroShown(): void {
  try {
    localStorage.setItem(FLAG_KEY, "1");
  } catch {
    /* no-op */
  }
}

/**
 * Phases:
 *   boot      → SSR + first paint, before we know whether to show
 *   gate      → "for your eyes only" with rainbow shimmer, tap to enter
 *   revealing → overlay fades out, music fades in, canvas reveals
 *   done      → unmounted (audio element keeps playing via AudioProvider)
 */
type Phase = "boot" | "gate" | "revealing" | "done";

export default function Intro() {
  const [phase, setPhase] = useState<Phase>("boot");
  // Number of characters of the title currently revealed by the typewriter.
  // 0 = nothing typed yet, TITLE_TOTAL_CHARS = fully typed.
  const [typedCount, setTypedCount] = useState(0);
  const audio = useAudio();

  // After mount, decide whether the intro should run for this visitor.
  // Return visitors skip the cinematic entirely — going through "revealing"
  // would run the 1.5s fade-out for no reason and produce a visible blue
  // flicker on reload. Going straight to "done" unmounts on the next render
  // (≤ 1 frame of dark overlay visible), which is as close to "no intro" as
  // we can get without an inline pre-React script.
  useEffect(() => {
    if (shouldShowIntro()) {
      setPhase("gate");
    } else {
      setPhase("done");
    }
  }, []);

  // Typewriter loop. Restarts whenever we (re-)enter the gate phase, including
  // when ?intro forces a replay. Naturally plays-once-per-device because
  // localStorage gates the whole intro from running on subsequent visits.
  useEffect(() => {
    if (phase !== "gate") return;
    setTypedCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTypedCount(i);
      if (i >= TITLE_TOTAL_CHARS) clearInterval(id);
    }, TYPE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase]);

  // Build the partially-typed title. Walk segments, taking up to `typedCount`
  // characters, preserving italic/non-italic groupings so the DOM stays stable.
  const typedTitle = useMemo<ReactNode[]>(() => {
    let remaining = typedCount;
    const out: ReactNode[] = [];
    for (let i = 0; i < TITLE_SEGMENTS.length; i++) {
      if (remaining <= 0) break;
      const seg = TITLE_SEGMENTS[i];
      const take = Math.min(seg.text.length, remaining);
      const text = seg.text.slice(0, take);
      out.push(
        seg.italic ? (
          <em key={i} className="italic">
            {text}
          </em>
        ) : (
          <span key={i}>{text}</span>
        )
      );
      remaining -= take;
    }
    return out;
  }, [typedCount]);

  const typingComplete = typedCount >= TITLE_TOTAL_CHARS;

  const enter = useCallback(async () => {
    // Audio.play() must be inside the same call stack as the user gesture
    // to satisfy the browser autoplay policy.
    try {
      await audio.play();
    } catch (e) {
      console.warn("[intro] audio.play() rejected:", e);
    }
    audio.fadeVolume(0.4, 1500);
    markIntroShown();
    setPhase("revealing");
    setTimeout(() => setPhase("done"), 1500);
  }, [audio]);

  if (phase === "done") return null;

  const isFading = phase === "revealing";
  const showTitle = phase === "gate";

  return (
    <div
      // data-intro-overlay is the hook the inline script + CSS use to hide
      // this whole tree on first paint for return visitors. See globals.css
      // and the INTRO_SKIP_SCRIPT in app/layout.tsx.
      data-intro-overlay
      onClick={() => {
        if (phase === "gate") enter();
      }}
      className="fixed inset-0 z-[200] bg-[#0a0a14] flex items-center justify-center transition-opacity duration-[1500ms] ease-out"
      style={{
        opacity: isFading ? 0 : 1,
        pointerEvents: isFading ? "none" : "auto",
        cursor: showTitle ? "pointer" : "default",
      }}
      aria-hidden={isFading}
    >
      {/* Only mount content during the gate (or while fading out from it).
          A separate opacity-fade-in on this container would race the typewriter:
          the 700ms fade made ~10 of 18 chars appear "instantly" because they
          were typed while still invisible. The typewriter IS the reveal. */}
      {phase !== "boot" && (
        <div className="flex flex-col items-center gap-7">
          <span className="font-serif text-[40px] sm:text-[56px] leading-[1.1] tracking-[-0.01em] text-center px-6 select-none shimmer-text">
            {typedTitle}
            {/* Blinking caret while typing; vanishes once the line is fully revealed.
                Explicit bg color (not bg-current) because .shimmer-text makes text
                transparent and clips a gradient through it — currentColor would be
                transparent and the caret would be invisible. */}
            {!typingComplete && (
              <span
                aria-hidden
                className="inline-block w-[2px] h-[0.85em] align-[-0.05em] ml-[2px] bg-white/80 animate-pulse"
              />
            )}
          </span>
          <span
            className="text-[11px] uppercase tracking-[0.24em] text-white/40 select-none transition-opacity duration-700"
            style={{
              fontFamily: '"Geist Pixel", ui-monospace, monospace',
              // Hide "tap to enter" until typing finishes, then fade in. Avoids
              // showing the prompt before the user has seen the typewriter.
              opacity: typingComplete ? 1 : 0,
            }}
          >
            tap to enter
          </span>
        </div>
      )}
    </div>
  );
}
