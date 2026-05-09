"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Share,
  Plus,
  MoreHorizontal,
  X,
  Play,
  Pause,
} from "lucide-react";
import { tiles, type Tile } from "@/app/data/tiles";
import introData from "@/app/data/intro.json";
import { Waveform, StaticWaveform } from "@/components/ui/waveform";

// Tiny inline parser: turn "Happy birthday, *Kam.*" into:
//   "Happy birthday, " + <span className="italic">Kam.</span>
// Allows the user to italicise arbitrary words in admin without needing
// rigid prefix/italic/suffix fields. Alternates between plain and italic
// on every "*" boundary.
function RichText({ text }: { text: string }) {
  const parts = text.split("*");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="italic">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

const CANVAS_W = 5000;
const CANVAS_H = 5000;
const CENTER_X = 2500;
const CENTER_Y = 2500;
const CLICK_THRESHOLD_PX = 5; // movement under this = click, above = drag
const FRICTION = 0.94;
const MIN_VELOCITY = 0.05;
const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const ZOOM_INTENSITY = 0.0025; // multiplier on wheel deltaY → log-scale zoom rate

// Hue helpers for the colour picker
function hueToHsl(h: number) {
  return `hsl(${h}, 88%, 56%)`;
}

export default function Canvas() {
  // --- Pan state ---
  // We use a ref for the *authoritative* offset, and useState only for forcing re-render
  // when we want React to know about it (e.g. for the colour picker overlay). The
  // imperative DOM update via transform on `wrapperRef` happens every frame.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const velocityRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragOriginOffsetRef = useRef({ x: 0, y: 0 });
  const lastMoveRef = useRef({ x: 0, y: 0, t: 0 });
  const movedDistanceRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Cursor state — separate from drag state to avoid re-rendering the whole canvas every frame
  const [grabbing, setGrabbing] = useState(false);

  // --- Modal state ---
  const [openTile, setOpenTile] = useState<Tile | null>(null);
  const [introOpen, setIntroOpen] = useState(false);

  // Mirror modal state into a ref so the imperative pointer/wheel handlers
  // (which run outside React's render cycle) can check it synchronously.
  // When ANY modal is open, the canvas should ignore pan/zoom input so the
  // modal's own scroll/click behaviour wins.
  const modalOpenRef = useRef(false);
  useEffect(() => {
    modalOpenRef.current = !!openTile || introOpen;
  }, [openTile, introOpen]);

  // --- Background hue ---
  const [hue, setHue] = useState(238); // matches #2D2DFF roughly
  const bgColor = hueToHsl(hue);

  // ----- Pan / transform application -----
  // Order matters: translate THEN scale. With this order, `offsetRef` is in screen pixels
  // (a 100px drag moves the canvas exactly 100px on screen, regardless of zoom level),
  // and `scaleRef` zooms the canvas around its origin (top-left of the wrapper).
  // The wheel-zoom handler compensates the offset so zoom feels anchored to the cursor.
  const applyTransform = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const { x, y } = offsetRef.current;
    const s = scaleRef.current;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  }, []);

  // Centre the viewport on the canvas centre on mount.
  // Screen-pos of canvas point (px, py) = (offsetX + px*s, offsetY + py*s),
  // so to centre (CENTER_X, CENTER_Y): offsetX = rect.width/2 - CENTER_X*s.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const s = scaleRef.current;
    offsetRef.current = {
      x: rect.width / 2 - CENTER_X * s,
      y: rect.height / 2 - CENTER_Y * s,
    };
    applyTransform();
  }, [applyTransform]);

  // Momentum loop
  const animateMomentum = useCallback(() => {
    const v = velocityRef.current;
    if (Math.abs(v.x) < MIN_VELOCITY && Math.abs(v.y) < MIN_VELOCITY) {
      velocityRef.current = { x: 0, y: 0 };
      rafRef.current = null;
      return;
    }
    offsetRef.current.x += v.x;
    offsetRef.current.y += v.y;
    v.x *= FRICTION;
    v.y *= FRICTION;
    applyTransform();
    rafRef.current = requestAnimationFrame(animateMomentum);
  }, [applyTransform]);

  // ---- Pointer handlers ----
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Modal open? Don't start a canvas drag — the modal handles its own input.
      if (modalOpenRef.current) return;
      // Only start a drag for primary-button or touch
      if (e.button !== 0 && e.pointerType === "mouse") return;
      // Stop any running momentum
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      velocityRef.current = { x: 0, y: 0 };
      draggingRef.current = true;
      movedDistanceRef.current = 0;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragOriginOffsetRef.current = { ...offsetRef.current };
      lastMoveRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      setGrabbing(true);
      // NOTE: we intentionally do NOT call setPointerCapture here.
      // Capturing the pointer would redirect all subsequent events (including
      // pointerup and the synthesized click) to this wrapper element,
      // preventing onClick from firing on tiles and the intro card.
      // Since the canvas is `fixed inset-0`, the pointer can't leave the
      // wrapper anyway — capture isn't needed to keep tracking the drag.
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      movedDistanceRef.current = Math.max(
        movedDistanceRef.current,
        Math.hypot(dx, dy)
      );
      offsetRef.current = {
        x: dragOriginOffsetRef.current.x + dx,
        y: dragOriginOffsetRef.current.y + dy,
      };
      // Velocity sample (per-frame delta)
      const now = performance.now();
      const dt = Math.max(1, now - lastMoveRef.current.t);
      // pixels per ~16ms frame
      const frameScale = 16 / dt;
      velocityRef.current = {
        x: (e.clientX - lastMoveRef.current.x) * frameScale,
        y: (e.clientY - lastMoveRef.current.y) * frameScale,
      };
      lastMoveRef.current = { x: e.clientX, y: e.clientY, t: now };
      applyTransform();
    },
    [applyTransform]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setGrabbing(false);
      // No releasePointerCapture: we never captured.
      // If movement was below threshold, treat the underlying click handler.
      // (The actual click handler reads movedDistanceRef.current.)
      // Otherwise kick off momentum.
      if (movedDistanceRef.current >= CLICK_THRESHOLD_PX) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(animateMomentum);
      }
    },
    [animateMomentum]
  );

  // Zoom around a viewport point so the canvas-space pixel under the cursor
  // stays under the cursor after the scale change. Clamps to [MIN_SCALE, MAX_SCALE].
  // Used by both wheel-pinch and the keyboard +/- shortcuts (which pivot on viewport centre).
  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const prev = scaleRef.current;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor));
      if (next === prev) return;
      // Canvas-space point currently under (cx, cy):
      //   px = (cx - offsetX) / prev
      // After zoom we want the same px under (cx, cy):
      //   offsetX' = cx - px * next
      // Substituting and simplifying:
      //   offsetX' = cx - (cx - offsetX) * (next / prev)
      const ratio = next / prev;
      const o = offsetRef.current;
      offsetRef.current = {
        x: cx - (cx - o.x) * ratio,
        y: cy - (cy - o.y) * ratio,
      };
      scaleRef.current = next;
      applyTransform();
    },
    [applyTransform]
  );

  // Wheel / trackpad — pan the canvas, OR zoom when ctrl/meta is held.
  // Mac trackpad pinch-to-zoom arrives here as a wheel event with ctrlKey=true,
  // so this single handler covers: trackpad pan, trackpad pinch, mouse wheel,
  // Cmd+wheel (Mac), and Ctrl+wheel (Windows/Linux).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      // Modal open? Let the browser scroll the modal naturally — don't
      // preventDefault, don't pan the canvas behind it.
      if (modalOpenRef.current) return;
      e.preventDefault();
      // Stop momentum on any wheel input — feels weird to have it fight gestures.
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        velocityRef.current = { x: 0, y: 0 };
      }
      if (e.ctrlKey || e.metaKey) {
        // Zoom path. deltaY positive = scroll down/pinch in (zoom out).
        // exp() gives smooth, multiplicative zoom regardless of deltaY magnitude.
        const factor = Math.exp(-e.deltaY * ZOOM_INTENSITY);
        zoomAt(e.clientX, e.clientY, factor);
      } else {
        // Pan path (existing behaviour).
        offsetRef.current.x -= e.deltaX;
        offsetRef.current.y -= e.deltaY;
        applyTransform();
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [applyTransform, zoomAt]);

  // Keyboard zoom: Cmd/Ctrl + (= / + / -) to zoom, Cmd/Ctrl + 0 to reset.
  // Pivots on viewport centre since there's no cursor position with a key event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomAt(cx, cy, 1.2);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomAt(cx, cy, 1 / 1.2);
      } else if (e.key === "0") {
        e.preventDefault();
        // Reset to 1.0 by computing the factor needed.
        zoomAt(cx, cy, 1 / scaleRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomAt]);

  // ESC closes any modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenTile(null);
        setIntroOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Disable browser-level overscroll while mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // --- Click vs drag arbitration on tiles ---
  // We attach a click handler to each tile; if `movedDistanceRef.current` is below
  // threshold, we open the tile. (Pointerup happens BEFORE click, so the ref is fresh.)
  const handleTileActivate = useCallback((tile: Tile) => {
    // Voice notes and songs play inline on the tile — they have no modal.
    if (tile.type === "Voice Note" || tile.type === "Song") return;
    console.log("[Tile] click", {
      id: tile.id,
      filename: tile.filename,
      moved: movedDistanceRef.current,
      threshold: CLICK_THRESHOLD_PX,
      willOpen: movedDistanceRef.current < CLICK_THRESHOLD_PX,
    });
    if (movedDistanceRef.current < CLICK_THRESHOLD_PX) {
      setOpenTile(tile);
    }
  }, []);

  const handleIntroActivate = useCallback(() => {
    if (movedDistanceRef.current < CLICK_THRESHOLD_PX) {
      setIntroOpen(true);
    }
  }, []);

  // Memoised list to avoid re-computing on every render
  const renderedTiles = useMemo(
    () => tiles.map((t) => <TileEl key={t.id} tile={t} onActivate={handleTileActivate} />),
    [handleTileActivate]
  );

  return (
    <div
      ref={stageRef}
      className="fixed inset-0 overflow-hidden no-scrollbar select-none"
      style={{
        backgroundColor: bgColor,
        cursor: grabbing ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Faint dot grid — anchors the user spatially without competing with tiles */}
      <DotGrid />

      {/* The pannable wrapper — single transform, all tiles absolute inside.
          transformOrigin: "0 0" is critical: it makes scale() pivot around the
          wrapper's top-left corner so canvas-space coordinates behave linearly.
          Without it, CSS defaults to 50% 50% and zoom would swing diagonally
          around (CANVAS_W/2, CANVAS_H/2). */}
      <div
        ref={wrapperRef}
        className="absolute top-0 left-0 will-change-transform"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transformOrigin: "0 0",
        }}
      >
        {renderedTiles}
      </div>

      {/* Fixed UI chrome — pinned to viewport, never pans with the canvas */}
      <BrowserBar />
      <IntroCard onActivate={handleIntroActivate} />
      <HintPill />
      <ColourPicker hue={hue} setHue={setHue} />

      {/* Modals */}
      {openTile && (
        <Modal onClose={() => setOpenTile(null)}>
          <TileFullView tile={openTile} />
        </Modal>
      )}
      {introOpen && (
        <Modal onClose={() => setIntroOpen(false)}>
          <IntroFullMessage />
        </Modal>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  Subcomponents                                            */
/* ──────────────────────────────────────────────────────── */

function DotGrid() {
  // A tiled SVG dot pattern — fixed in the viewport so it doesn't move with the canvas.
  // This subtly suggests "infinite plane" without competing with the tiles.
  return (
    <svg
      className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.08]"
      aria-hidden
    >
      <defs>
        <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="white" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  );
}

function BrowserBar() {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none max-w-[calc(100vw-16px)]">
      <div className="chrome-surface flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 rounded-full bg-[#0a0a14]/65 backdrop-blur-xl backdrop-saturate-150 text-white text-[11px] sm:text-[12px] font-mono pointer-events-auto">
        {/* Traffic-light style indicators — hidden on small screens to save room */}
        <div className="hidden sm:flex items-center gap-1.5 pl-1.5 pr-1">
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        </div>
        <div className="hidden sm:block w-px h-5 bg-white/10" />
        <button
          type="button"
          className="w-7 h-7 rounded-full hover:bg-white/8 grid place-items-center"
          aria-label="back"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          className="hidden sm:grid w-7 h-7 rounded-full hover:bg-white/8 place-items-center"
          aria-label="forward"
        >
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          className="w-7 h-7 rounded-full hover:bg-white/8 grid place-items-center"
          aria-label="refresh"
        >
          <RotateCcw size={13} />
        </button>
        <div className="px-3 py-1 rounded-full bg-white/[0.06] text-white/80 tracking-tight min-w-[140px] sm:min-w-[200px] text-center truncate">
          <span className="text-white/40">https://</span>kamsbirthday.co
        </div>
        <button
          type="button"
          className="hidden sm:grid w-7 h-7 rounded-full hover:bg-white/8 place-items-center"
          aria-label="share"
        >
          <Share size={13} />
        </button>
        <button
          type="button"
          className="hidden sm:grid w-7 h-7 rounded-full hover:bg-white/8 place-items-center"
          aria-label="add"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="w-7 h-7 rounded-full hover:bg-white/8 grid place-items-center"
          aria-label="more"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}

function ColourPicker({
  hue,
  setHue,
}: {
  hue: number;
  setHue: (n: number) => void;
}) {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="chrome-surface flex items-center gap-3 px-4 py-2.5 rounded-full bg-[#0a0a14] text-white pointer-events-auto">
        <input
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
          className="rainbow-slider w-[220px]"
          aria-label="background hue"
        />
        <span
          className="w-4 h-4 rounded-full ring-1 ring-white/30"
          style={{ backgroundColor: hueToHsl(hue) }}
        />
      </div>
    </div>
  );
}

/* -------------------- Intro -------------------- */

function IntroCard({ onActivate }: { onActivate: () => void }) {
  // Pinned to the viewport — does not pan with the canvas.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 group block text-left cursor-pointer z-[40] w-[min(480px,calc(100vw-32px))]"
    >
      <div className="chrome-surface w-full rounded-[24px] sm:rounded-[28px] bg-[#0a0a14]/80 backdrop-blur-xl backdrop-saturate-150 text-white px-5 pt-5 pb-6 sm:px-7 sm:pt-6 sm:pb-7 flex flex-col gap-2.5 sm:gap-3 transition-transform group-hover:-translate-y-0.5">
        {/* Tiny mono label — Geist Pixel on both sides. */}
        <div
          className="flex items-center justify-between text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-white/40"
          style={{ fontFamily: '"Geist Pixel", ui-monospace, monospace' }}
        >
          <span>{introData.card.topLeft}</span>
          <span>{introData.card.topRight}</span>
        </div>
        <p className="font-serif text-[20px] sm:text-[26px] leading-[1.2] tracking-[-0.02em] text-white/95 whitespace-pre-line">
          <RichText text={introData.card.body} />
        </p>
        <p className="mt-2 sm:mt-3 font-serif text-[20px] sm:text-[26px] leading-[1.2] tracking-[-0.02em] text-white/95">
          <RichText text={introData.card.signoff} />
        </p>
      </div>
    </div>
  );
}

function HintPill() {
  // Pinned to the viewport, sitting just below the intro card.
  return (
    <div
      className="fixed left-1/2 top-1/2 -translate-x-1/2 pointer-events-none z-[40] mt-[150px] sm:mt-[120px]"
      style={{ width: 240, height: 38 }}
    >
      <div className="chrome-surface flex items-center gap-2 px-4 py-2 rounded-full bg-[#0a0a14]/65 backdrop-blur-xl backdrop-saturate-150 text-white/80 font-mono text-[11px] tracking-[0.04em] justify-center">
        <span className="drift">↔</span>
        scroll or drag to explore
      </div>
    </div>
  );
}

function IntroFullMessage() {
  return (
    <div className="relative max-w-[560px] w-full">
    <div className="bg-[#0a0a14] text-white p-6 sm:p-10 rounded-[24px] sm:rounded-[28px] w-full chrome-surface no-scrollbar max-h-[85vh] overflow-y-auto overscroll-contain">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 mb-5 sm:mb-6 text-center">
        {introData.modal.date}
      </div>
      <p className="font-serif text-[20px] sm:text-[24px] leading-[1.35] text-white/95 text-center">
        <RichText text={introData.modal.heading} />
      </p>
      <div className="font-serif text-[16px] sm:text-[18px] leading-[1.55] text-white/85 mt-5 sm:mt-6">
        {introData.modal.paragraphs.map((para, i) => (
          <p
            key={i}
            className={
              "text-justify hyphens-auto whitespace-pre-line " +
              (i > 0 ? "indent-8" : "")
            }
          >
            <RichText text={para} />
          </p>
        ))}
      </div>
    </div>
      {/* Top scrim — fades content into the modal's top edge so the
          heading doesn't hard-cut against scrolled paragraphs. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-12 sm:h-16 rounded-t-[24px] sm:rounded-t-[28px]"
        style={{
          background:
            "linear-gradient(to top, transparent 0%, #0a0a14 85%)",
        }}
      />
      {/* Bottom scrim — fades content into the modal's edge so the user
          knows there's more to scroll. Pure decoration: pointer-events-none
          so it doesn't block scroll wheel or touch. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 sm:h-20 rounded-b-[24px] sm:rounded-b-[28px]"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, #0a0a14 85%)",
        }}
      />
    </div>
  );
}

/* -------------------- Tile -------------------- */

function TileEl({
  tile,
  onActivate,
}: {
  tile: Tile;
  onActivate: (t: Tile) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onActivate(tile)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate(tile);
        }
      }}
      className="absolute block text-left group cursor-pointer"
      style={{
        left: tile.x,
        top: tile.y,
        width: tile.w,
        height: tile.h,
        transform: tile.rotate ? `rotate(${tile.rotate}deg)` : undefined,
        transformOrigin: "center",
      }}
    >
      <div className="tile-shadow w-full h-full rounded-[12px] overflow-hidden bg-white text-[#0a0a14] flex flex-col transition-transform duration-300 group-hover:-translate-y-0.5">
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-3 py-1.5 bg-[#f6f4ee] border-b border-black/5 text-[10px] uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
        >
          <span className="truncate text-black/80 normal-case lowercase tracking-tight">
            {tile.filename}
          </span>
          <span className="text-black/40 ml-2 shrink-0">{tile.type}</span>
        </div>
        {/* Body */}
        <div className="relative flex-1 min-h-0">
          <TileBody tile={tile} />
        </div>
      </div>
    </div>
  );
}

function VoiceNoteBody({ tile }: { tile: Tile }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waveData, setWaveData] = useState<number[]>(() =>
    // Stable initial heights so the bar pattern doesn't jolt on first paint
    Array.from({ length: 36 }, (_, i) => 0.25 + (((i * 13) % 50) / 100))
  );
  const hasAudio = !!tile.audioSrc;

  // Animate the waveform while playing — regenerate heights on a timer
  // so the bars "dance" in place. They're always in frame; only their
  // amplitudes change.
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setWaveData(
        Array.from({ length: 36 }, () => 0.2 + Math.random() * 0.7)
      );
    }, 120);
    return () => clearInterval(interval);
  }, [playing]);

  const toggle = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (!hasAudio) return;
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch((err) => console.error("[VoiceNote] play() rejected:", err));
    } else {
      el.pause();
    }
  };

  return (
    <div className="absolute inset-0 px-3 flex items-center gap-3 bg-[#0a0a14] text-white">
      <button
        type="button"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-9 h-9 rounded-full bg-white text-[#0a0a14] grid place-items-center shrink-0 cursor-pointer"
        style={{ opacity: hasAudio ? 1 : 0.4 }}
        aria-label={playing ? "pause" : "play"}
      >
        {playing ? <Pause size={14} fill="#0a0a14" /> : <Play size={14} fill="#0a0a14" />}
      </button>
      <div className="flex-1 min-w-0 self-center flex items-center h-9 -translate-y-1">
        <Waveform
          className={`w-full overflow-hidden transition-opacity duration-200 ${playing ? "opacity-100" : "opacity-50"}`}
          data={waveData}
          height={36}
          barColor={playing ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.85)"}
          barWidth={2}
          barGap={2}
          barRadius={1}
          fadeEdges={false}
        />
      </div>
      <span className="font-sans text-[11px] text-white/70 shrink-0">{tile.note}</span>
      {hasAudio && (
        <audio
          ref={audioRef}
          src={tile.audioSrc}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={(e) => console.error("[VoiceNote] audio load error:", e.currentTarget.error)}
          preload="auto"
        />
      )}
    </div>
  );
}

function SongBody({ tile }: { tile: Tile }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seekTrackRef = useRef<HTMLDivElement | null>(null);
  const seekingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const hasAudio = !!tile.audioSrc;

  const toggle = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (!hasAudio) return;
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch((err) => console.error("[Song] play() rejected:", err));
    } else {
      el.pause();
    }
  };

  const seekToClientX = (clientX: number) => {
    const track = seekTrackRef.current;
    const audio = audioRef.current;
    if (!track || !audio || !audio.duration || !isFinite(audio.duration)) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  };

  const onSeekDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!hasAudio) return;
    seekingRef.current = true;
    seekToClientX(e.clientX);
    const move = (ev: PointerEvent) => {
      if (!seekingRef.current) return;
      seekToClientX(ev.clientX);
    };
    const up = () => {
      seekingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div className="absolute inset-0 flex items-center gap-3 px-3 bg-[#101018] text-white">
      {tile.songCoverSrc ? (
        <img
          src={tile.songCoverSrc}
          alt={tile.songTitle ?? "cover"}
          className="w-[44px] h-[44px] rounded-md shrink-0 object-cover"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="w-[44px] h-[44px] rounded-md shrink-0 bg-white/10" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-sans text-[13px] truncate">{tile.songTitle}</div>
        <div className="font-sans text-[11px] text-white/55 truncate">
          {tile.songArtist}
        </div>
        {/* Seek track — 3px visible bar in an 11px (-1 +7) hit zone for easy grabbing */}
        <div
          onPointerDown={onSeekDown}
          className="mt-1 -mx-1 px-1 py-1 cursor-pointer touch-none"
          role="slider"
          aria-label="seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            ref={seekTrackRef}
            className="h-[3px] rounded-full bg-white/10 overflow-hidden"
          >
            <div
              className="h-full bg-white/80"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-8 h-8 rounded-full bg-white text-[#0a0a14] grid place-items-center shrink-0 cursor-pointer"
        style={{ opacity: hasAudio ? 1 : 0.4 }}
        aria-label={playing ? "pause" : "play"}
      >
        {playing ? <Pause size={13} fill="#0a0a14" /> : <Play size={13} fill="#0a0a14" />}
      </button>
      {hasAudio && (
        <audio
          ref={audioRef}
          src={tile.audioSrc}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration > 0) setProgress(el.currentTime / el.duration);
          }}
          onError={(e) => console.error("[Song] audio load error:", e.currentTarget.error)}
          preload="metadata"
        />
      )}
    </div>
  );
}

function LazyVideoTile({ src }: { src: string }) {
  // Defer video fetch + playback until the tile is in the viewport.
  // Off-screen tiles use preload="none" and are paused, so 100+ off-screen
  // videos don't all start fetching/decoding on mount.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // Root = null -> document viewport. The canvas wrapper uses CSS
    // translate3d, so each tile's bounding box updates naturally as the
    // user pans, and the viewport intersection fires correctly.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            // Bump preload before attempting playback
            try {
              el.preload = "metadata";
            } catch {}
            const p = el.play();
            if (p && typeof p.catch === "function") {
              p.catch(() => {
                /* autoplay might be blocked; muted+playsInline should cover it */
              });
            }
          } else {
            el.pause();
          }
        }
      },
      { root: null, rootMargin: "200px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      className="absolute inset-0 w-full h-full object-cover"
      muted
      loop
      playsInline
      preload={visible ? "metadata" : "none"}
    />
  );
}

function TileBody({ tile }: { tile: Tile }) {
  if (tile.type === "Photo" && tile.src) {
    return (
      <>
        <img
          src={tile.src}
          alt={tile.filename}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
        {tile.ageBadge !== undefined && (
          <span
            className="pointer-events-none absolute right-3 bottom-1 font-serif italic text-white"
            style={{
              fontSize: 160,
              lineHeight: 0.85,
              textShadow: "0 4px 24px rgba(0,0,0,0.35)",
            }}
          >
            {tile.ageBadge}
          </span>
        )}
      </>
    );
  }
  if (tile.type === "Video" && tile.src) {
    return <LazyVideoTile src={tile.src} />;
  }
  if (tile.type === "Text") {
    if (tile.noteImageSrc) {
      return (
        <div className="absolute inset-0 bg-[#fffdf7]">
          <img
            src={tile.noteImageSrc}
            alt={tile.filename}
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        </div>
      );
    }
    return (
      <div className="absolute inset-0 px-5 py-4 flex flex-col gap-2 bg-[#fffdf7]">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/40">
          from {tile.noteFrom}
        </span>
        <p className="font-serif text-[16px] leading-[1.35] text-[#0a0a14]/90">
          {tile.note}
        </p>
      </div>
    );
  }
  if (tile.type === "Voice Note") {
    return <VoiceNoteBody tile={tile} />;
  }
  if (tile.type === "Song") {
    return <SongBody tile={tile} />;
  }
  return null;
}

/* -------------------- Modals -------------------- */

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-[#0a0a14] text-white grid place-items-center chrome-surface z-10"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

function VoiceNoteFull({ tile }: { tile: Tile }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const hasAudio = !!tile.audioSrc;

  const toggle = () => {
    const el = audioRef.current;
    console.log("[VoiceNote] click", {
      filename: tile.filename,
      hasAudio,
      audioSrc: tile.audioSrc,
      ref: el,
      paused: el?.paused,
      readyState: el?.readyState,
    });
    if (!el) return;
    if (el.paused) {
      el.play().catch((err) => {
        console.error("[VoiceNote] play() rejected:", err);
      });
    } else {
      el.pause();
    }
  };

  return (
    <div className="bg-[#0a0a14] rounded-[18px] tile-shadow p-8 w-[440px] text-white">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45 mb-5">
        {tile.filename} · from {tile.noteFrom}
      </div>
      <div className="flex items-end gap-[4px] h-20 mb-5">
        {Array.from({ length: 38 }).map((_, i) => (
          <span
            key={i}
            className={`bar-${(i % 8) + 1} block w-[4px] rounded-full bg-white/80`}
            style={{ height: `${20 + ((i * 17) % 80)}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggle}
          className="w-11 h-11 rounded-full bg-white text-[#0a0a14] grid place-items-center"
          aria-label={playing ? "pause" : "play"}
          style={{ opacity: hasAudio ? 1 : 0.4 }}
        >
          {playing ? <Pause size={16} fill="#0a0a14" /> : <Play size={16} fill="#0a0a14" />}
        </button>
        <span className="font-mono text-[12px] text-white/60">{tile.note}</span>
      </div>
      {hasAudio ? (
        <audio
          ref={audioRef}
          src={tile.audioSrc}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={(e) => console.error("[VoiceNote] audio load error:", e.currentTarget.error)}
          preload="auto"
        />
      ) : (
        <p className="font-serif italic text-[15px] text-white/55 mt-5">
          (a voice note from {tile.noteFrom} that hasn’t been recorded yet)
        </p>
      )}
    </div>
  );
}

function TileFullView({ tile }: { tile: Tile }) {
  // For media, show in a tile frame at a comfortable size.
  if (tile.type === "Photo" && tile.src) {
    return (
      <div className="rounded-[18px] overflow-hidden bg-white tile-shadow max-h-[85vh]">
        <div
          className="flex items-center justify-between px-4 py-2 bg-[#f6f4ee] border-b border-black/5 text-[11px] uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
        >
          <span className="lowercase tracking-tight text-black/80">{tile.filename}</span>
          <span className="text-black/40">{tile.type}</span>
        </div>
        <img
          src={tile.src}
          alt={tile.filename}
          className="block max-h-[78vh] max-w-[80vw] object-contain"
          draggable={false}
        />
      </div>
    );
  }
  if (tile.type === "Video" && tile.src) {
    return (
      <div className="rounded-[18px] overflow-hidden bg-white tile-shadow">
        <div
          className="flex items-center justify-between px-4 py-2 bg-[#f6f4ee] border-b border-black/5 text-[11px] uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
        >
          <span className="lowercase tracking-tight text-black/80">{tile.filename}</span>
          <span className="text-black/40">{tile.type}</span>
        </div>
        <video
          src={tile.src}
          controls
          autoPlay
          loop
          className="block max-h-[78vh] max-w-[80vw]"
        />
      </div>
    );
  }
  if (tile.type === "Text") {
    if (tile.noteImageSrc) {
      return (
        <div className="bg-[#fffdf7] rounded-[18px] tile-shadow p-4 max-w-[640px] w-full">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40 mb-3 px-2">
            {tile.filename}
          </div>
          <img
            src={tile.noteImageSrc}
            alt={tile.filename}
            className="block max-h-[78vh] max-w-full object-contain rounded-[8px]"
            draggable={false}
          />
        </div>
      );
    }
    return (
      <div className="bg-[#fffdf7] rounded-[18px] tile-shadow p-10 max-w-[520px] w-full">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40 mb-4">
          {tile.filename} · from {tile.noteFrom}
        </div>
        <p className="font-serif text-[26px] leading-[1.35] text-[#0a0a14]/90">
          {tile.note}
        </p>
      </div>
    );
  }
  if (tile.type === "Voice Note") {
    // Voice notes play inline on the tile itself — no modal.
    return null;
  }
  // Songs play inline on the tile; no modal. (See SongBody.)
  return null;
}
