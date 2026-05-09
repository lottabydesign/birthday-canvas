# Cinematic Entrance Experience — Design

**Date**: 2026-05-09
**Status**: Approved (brainstorming), ready for implementation plan

## Summary

A one-time cinematic gate the first time a visitor opens the site. Black screen, tap to begin, ~6-second title sequence with the date, then *for your eyes only* (with italic emphasis on **eyes**) in serif, music swells underneath, dissolves into the canvas. Music continues as ambient background at 40% with a mute toggle in the browser bar. Plays once per device (localStorage flag); subsequent visits go straight to the canvas with audio off. Skippable with any click or ESC.

## User-facing flow

### Gate (first visit only)

Black full-screen overlay. Centred small mono prompt:

> Press anywhere to begin.

(Same shimmer treatment as the existing hint pill.) Tap/click anywhere to start the sequence. The tap is the curtain rising — also the user gesture that unlocks audio playback (browser autoplay policy).

### Sequence (after tap)

| Time | Action |
|---|---|
| 0.0s | Black. `08.05.2026` fades in (Geist Pixel mono, white/40, centred) |
| 1.5s | Date fades out (300 ms) |
| 1.8s | *"for your eyes only"* fades in (Times New Roman serif, large, white/95, centred — **italic only on the word "eyes"**) |
| 3.5s | Music drops — audio fades 0 → 40% over 1.5 s. Title starts fading out (1 s) |
| 4.5s | Black overlay dissolves (1.5 s). Canvas + intro card become visible underneath. (No per-tile stagger in v1.) |
| 6.0s | Sequence complete. Music continues at 40%, looping |

Total: ~6 seconds.

### Skippable

- Any click during the sequence → fast-forward to reveal (200 ms fade-out instead of 1.5 s)
- ESC also skips
- Skipping counts as "shown" — sets the localStorage flag so it doesn't replay next visit

### Reduced motion

If `prefers-reduced-motion: reduce`:

- Gate still appears (need the user gesture for audio).
- After tap, skip the cinematic entirely — canvas reveals immediately.
- Music still plays at 40% (audio isn't motion).

## Persistence

- **localStorage key**: `kams-intro-shown`, value `"1"` on completion OR skip.
- **First visit**: gate → tap → cinematic → flag set.
- **Subsequent visits**: no gate, no cinematic. Canvas + intro card on first paint. Music does **not** auto-play (no second-visit surprise audio + browser autoplay policy would block it anyway). Mute toggle in the BrowserBar lets Kam manually start it.
- **Replay escape hatch**: query param `?intro` forces replay (clears the flag for that visit only). Useful for dev, demos, sharing the moment with someone over your shoulder.

## Audio

- **File**: `/media/i-found-her.mp3`
- **Initial volume**: 40%
- **Loop**: yes
- **Preload**: starts loading silently in the background while the user reads the gate text. By the time they tap, the file is buffered. If audio still isn't ready at the music-drop moment, fall back to whatever's buffered.

### Mute toggle

- Lives in the BrowserBar, between the URL pill and the share button.
- Icon: lucide `Volume2` (audio on) ↔ `VolumeX` (muted).
- Click toggles between current playing volume (40%) and 0%, with a 200 ms fade.
- Mute state persists across navigations within the session via sessionStorage; resets next session.
- Hidden during the gate and cinematic — only appears once the canvas is revealed.

## Architecture

### New components / modules

- **`app/components/Intro.tsx`** — full-screen overlay component containing both the gate and the cinematic sequence. Mounts above the canvas, fades out on completion. Owns the `<audio>` element and audio fade logic.
- **`lib/intro-state.ts`** — small helpers:
  - `shouldShowIntro()` — returns `true` if localStorage flag is unset *or* `?intro` query param is present
  - `markIntroShown()` — sets localStorage flag
- **`lib/audio-state.ts`** (or merged into the above) — sessionStorage helpers for mute persistence

### Modified

- **`app/page.tsx`** — wraps `<Canvas />` with the new `<Intro />` overlay (same level as the canvas; intro fades out, canvas remains).
- **`components/Canvas.tsx`** — adds the mute toggle button to the BrowserBar; reads/writes mute state via the audio-state helpers.

### Lifetime of the audio element

The `<audio>` element lives in `Intro.tsx` and persists for the duration of the page (the Intro component stays mounted but invisible after fade-out so audio playback continues). The mute toggle in the BrowserBar reaches the audio element via React Context (`AudioControlContext` provided by `Intro`).

## Edge cases

- **Browser autoplay block**: the gate's tap is the user gesture → `audio.play()` inside the click handler succeeds across Chrome, Safari, Firefox, iOS Safari.
- **Audio preload race**: if the user taps before audio finishes preloading, music drop plays whatever's buffered (small risk of a fraction-of-a-second gap; acceptable).
- **`prefers-reduced-motion`**: media query checked at gate-tap time; skips cinematic if true. Detected via `window.matchMedia("(prefers-reduced-motion: reduce)").matches`.
- **localStorage unavailable** (Safari private mode): treat as "no flag" → cinematic plays every visit. Acceptable degradation.
- **Mute toggle race**: if Kam mutes during the music-drop fade, cancel the in-progress fade and run the mute fade instead. No stuck states.
- **Tab backgrounded during cinematic**: browsers throttle setTimeout/setInterval in background tabs. Use CSS animations + `requestAnimationFrame` (which pauses naturally) for visual transitions, so timing stays correct when tab returns to foreground.

## Out of scope (for this spec)

- Volume slider (just a binary mute toggle for now)
- Multiple skin / theme variations of the entrance
- Per-music-track playlist or "next song" affordance
- Per-tile stagger choreography on reveal (a single full-canvas cross-fade ships in v1; staggered tile fades can come later)
- Customising the entrance copy via the admin UI

## Visual / typographic specifics

- Date `08.05.2026`: Geist Pixel font, ~14px size, uppercase, letter-spacing 0.2em, white at 40% opacity.
- *"for your eyes only"*: Times New Roman, ~48-56px on desktop, ~36-40px on mobile, leading 1.1, tracking -0.01em, white at 95% opacity. Italic span on the word "eyes" only.
- Background: solid `#0a0a14` (the chrome dark navy), full viewport, fixed.
- Fade-out of the overlay: cross-fade with the canvas/electric-blue background underneath.

## Files affected — rough estimate

| File | Change |
|---|---|
| `app/components/Intro.tsx` | new |
| `lib/intro-state.ts` | new |
| `app/page.tsx` | wrap Canvas with Intro |
| `components/Canvas.tsx` | add mute toggle in BrowserBar; consume audio context |
