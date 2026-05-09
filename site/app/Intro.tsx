"use client";

import { useCallback, useEffect, useState } from "react";
import { useAudio } from "./AudioProvider";

const FLAG_KEY = "kams-intro-shown";

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
  const audio = useAudio();

  // After mount, decide whether the intro should run for this visitor.
  useEffect(() => {
    if (shouldShowIntro()) {
      setPhase("gate");
    } else {
      setPhase("revealing");
      const t = setTimeout(() => setPhase("done"), 600);
      return () => clearTimeout(t);
    }
  }, []);

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
      <div
        className="flex flex-col items-center gap-7 transition-opacity duration-700"
        style={{ opacity: showTitle ? 1 : 0 }}
      >
        <span className="font-serif text-[40px] sm:text-[56px] leading-[1.1] tracking-[-0.01em] text-center px-6 select-none shimmer-text">
          <em className="italic">f</em>or your <em className="italic">eyes</em> onl<em className="italic">y</em>
        </span>
        <span
          className="text-[11px] uppercase tracking-[0.24em] text-white/40 select-none"
          style={{ fontFamily: '"Geist Pixel", ui-monospace, monospace' }}
        >
          tap to enter
        </span>
      </div>
    </div>
  );
}
