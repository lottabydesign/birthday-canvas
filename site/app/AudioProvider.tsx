"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Persistent within the tab — resets on next visit so the cinematic always
// gets a fresh chance to play music for the user.
const MUTE_KEY = "kams-muted";

type AudioControl = {
  /** Has audio.play() been called and succeeded? */
  isPlaying: boolean;
  /** User-toggled mute (persisted in sessionStorage). */
  isMuted: boolean;
  /** Smart toggle for the BrowserBar control. Calls play() the first time,
   *  then mutes/unmutes on subsequent calls. */
  toggle: () => Promise<void>;
  /** Used by Intro to start audio inside the gate's user-gesture handler. */
  play: () => Promise<void>;
  /** RAF-based fade. Respects mute (will not fade up while muted). */
  fadeVolume: (target: number, durationMs: number) => void;
};

const Ctx = createContext<AudioControl | null>(null);

export function AudioProvider({
  children,
  src,
}: {
  children: ReactNode;
  src: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  // Last non-zero volume — restored when the user unmutes.
  const lastVolumeRef = useRef<number>(0.4);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Hydrate mute state from sessionStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(MUTE_KEY) === "1") {
        setIsMuted(true);
        if (audioRef.current) audioRef.current.volume = 0;
      }
    } catch {
      // sessionStorage may throw in private mode — silently OK.
    }
  }, []);

  const fadeVolume = useCallback(
    (target: number, durationMs: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current);
      // Sticky mute: if user has muted, any fade-up request is overridden to 0.
      const effectiveTarget = isMuted ? 0 : Math.max(0, Math.min(1, target));
      if (durationMs <= 0) {
        audio.volume = effectiveTarget;
        return;
      }
      const start = audio.volume;
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        audio.volume = start + (effectiveTarget - start) * t;
        if (t < 1) fadeRafRef.current = requestAnimationFrame(tick);
        else fadeRafRef.current = null;
      };
      fadeRafRef.current = requestAnimationFrame(tick);
    },
    [isMuted]
  );

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0;
    await audio.play();
    setIsPlaying(true);
  }, []);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!isPlaying) {
      // First click ever (e.g. repeat visit, no cinematic to start it).
      try {
        await play();
        // Clear any sticky mute from a previous session-load click.
        if (isMuted) {
          setIsMuted(false);
          try {
            sessionStorage.removeItem(MUTE_KEY);
          } catch {}
        }
        // Use the bare audio API directly so the just-cleared mute state
        // doesn't get re-checked through fadeVolume.
        const start = 0;
        const target = lastVolumeRef.current || 0.4;
        const startTime = performance.now();
        if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current);
        const tick = (now: number) => {
          const t = Math.min(1, (now - startTime) / 800);
          audio.volume = start + (target - start) * t;
          if (t < 1) fadeRafRef.current = requestAnimationFrame(tick);
          else fadeRafRef.current = null;
        };
        fadeRafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        console.warn("[audio] play() rejected:", e);
      }
      return;
    }

    // Already playing — flip mute state.
    if (isMuted) {
      setIsMuted(false);
      try {
        sessionStorage.removeItem(MUTE_KEY);
      } catch {}
      // Bypass sticky-mute in fadeVolume (which still sees isMuted=true on
      // this render). Step the volume directly.
      const startVol = audio.volume;
      const targetVol = lastVolumeRef.current || 0.4;
      const startTime = performance.now();
      if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current);
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / 200);
        audio.volume = startVol + (targetVol - startVol) * t;
        if (t < 1) fadeRafRef.current = requestAnimationFrame(tick);
        else fadeRafRef.current = null;
      };
      fadeRafRef.current = requestAnimationFrame(tick);
    } else {
      lastVolumeRef.current = audio.volume || 0.4;
      setIsMuted(true);
      try {
        sessionStorage.setItem(MUTE_KEY, "1");
      } catch {}
      fadeVolume(0, 200);
    }
  }, [isPlaying, isMuted, play, fadeVolume]);

  return (
    <Ctx.Provider value={{ isPlaying, isMuted, toggle, play, fadeVolume }}>
      <audio ref={audioRef} src={src} loop preload="auto" />
      {children}
    </Ctx.Provider>
  );
}

export function useAudio(): AudioControl {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudio must be used within <AudioProvider>");
  return ctx;
}
