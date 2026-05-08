# Kam's Birthday Site

A personal, single-page interactive canvas built as a birthday gift for **Kam**. Visitors pan a flat-coloured 2D canvas full of "memory tiles" (photos, videos, notes, voice notes). Built publicly by **Lota** as part of Behind the Ship.

## Stack

- Next.js 15 App Router + React 19
- Tailwind CSS
- TypeScript strict
- No backend, no DB, no auth, no CMS — all content is hardcoded in `app/data/tiles.ts`

## Project layout

The actual app lives in `site/`:

```
site/
├── app/
│   ├── page.tsx               # server component, renders <Canvas />
│   ├── layout.tsx             # Geist + Geist Mono fonts (Times New Roman is system)
│   ├── globals.css            # chrome-surface, rainbow slider, waveform keyframes, Geist Pixel @font-face
│   └── data/tiles.ts          # all tile data (positions, sizes, types, src, audio)
├── components/Canvas.tsx      # single client component — all interaction logic
└── public/media/              # all photos, videos, audio
```

`Canvas.tsx` is intentionally one big file. Don't split it without a strong reason — the components inside (TileEl, IntroCard, VoiceNoteBody, Modal, BrowserBar, ColourPicker, etc.) share state via closures, and the file is still under ~900 lines.

## Run

```bash
cd site
npm install
npm run dev    # http://localhost:3000
npm run build  # only mechanical correctness check — there is no lint or test script
```

The Next dev server is usually already running. Logs at `/tmp/kam-dev.log`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat:` — new visible behavior (new tile type, new admin field, new chrome element)
- `feat(<scope>):` — scoped feature, e.g. `feat(admin):`, `feat(canvas):`
- `fix:` — bug fix
- `style:` — pure CSS / typography / spacing / colour
- `refactor:` — code reshape, no behavior change
- `chore:` — config / deps / repo housekeeping
- `docs:` — CLAUDE.md or README updates
- `perf:` — performance change

Use scopes (`feat(admin):`, `style(intro-card):`) when the change is localised
to one surface — admin, canvas, intro-card, song-tile, voice-note, browser-bar.

Initial two commits don't follow the convention (legacy). Everything from
8366d67 onward should.

## Design system — strict rules

### Geometry

- **Tile corner radius**: `12px`. Don't change this without asking.
- **Modal expanded views**: `18px`. Intentional dichotomy — tiles are "objects", modals are "surfaces".
- **Intro card / chrome elements**: `28px` for chunky panels, pill-shape (`rounded-full`) for short pills.
- **Tile rotations**: stay between `-3°` and `+3°`. More than that cheapens the desk-scattered feel.

### Colour

- **Background**: a flat saturated `hsl(h, 88%, 56%)` set by the rainbow colour picker. Default hue ≈ blue (`#2D2DFF` neighbourhood). **Never** add gradients or textures to the background.
- **Chrome surfaces** (browser bar, intro card, hint pill, colour picker): dark navy `#0a0a14`, white text, plus the `.chrome-surface` class which adds a subtle inner-top highlight.
- **Tile bodies**: white (`#fffdf7` for text notes), or the media itself fills the body.

### Typography

- **Geist** — chrome and UI labels. Calm, neutral, sentence-case.
- **Geist Mono** — filenames in tile chrome bars, browser-bar URL, all uppercase tracking labels. (Vercel's mono variant of Geist; pairs naturally with the sans.)
- **Times New Roman** (system font, no @font-face) — every `font-serif` instance: intro card body, italic asides, photo overlays, song-cover ♫ glyph. Anti-design / classical / school-essay aesthetic — intentionally not a "designer serif".
- **Never use** Inter, Space Grotesk, or any generic "AI startup" sans. Avoid emoji in UI.

### Filenames in tile chrome bars

Filenames are invented (real source files are UUIDs). Match the existing rhythm:

- lowercase, slightly anti-precious — `the_smile.jpg`, `firstDance.jpg`, `note_fromMum.txt`, `caught_laughing.jpg`
- mix underscore_case and camelCase loosely — feels like a real desktop, not a brand
- file extensions match the type loosely (`.jpg`, `.mp4`, `.txt`, `.m4a`, `.mp3`)

## Interaction patterns

### Pan with click-and-drag + momentum

Implemented in `Canvas.tsx` via pointer events on the outer stage div:

- `onPointerDown` resets `movedDistanceRef` and starts dragging.
- `onPointerMove` tracks distance and applies a `translate3d` to `wrapperRef`.
- `onPointerUp` either kicks off momentum (if movedDistance ≥ 5px) or lets the click handler fire (if < 5px).
- Click-vs-drag threshold: `CLICK_THRESHOLD_PX = 5`.
- Wheel/trackpad two-finger drag is intercepted with `preventDefault` and translated.

### **DO NOT call `setPointerCapture` on the canvas wrapper.**

It redirects pointerup and click events to the wrapper, breaking `onClick` on tiles and the intro card. The canvas is `fixed inset-0`, so capture is not needed to track drags. **This was a real bug — don't reintroduce it.**

### Tile activation

Tiles use a regular React `onClick` on the outer `<div role="button">`. The handler reads `movedDistanceRef.current` — if movement was below threshold, it opens the modal.

- **Photo / Video / Text / Song**: tap → modal expands the content.
- **Voice Note**: plays **inline** on the tile via `VoiceNoteBody`. No modal. The inline play button has `onPointerDown={(e) => e.stopPropagation()}` so it doesn't kick off a canvas drag.

### Modals

- Render outside the pannable wrapper at `z-[100]`.
- Backdrop click closes; close button in top-right; ESC closes.
- The modal content stops propagation so backdrop click only closes when clicking outside the inner card.

### Chrome layer (fixed-position)

Pinned to the viewport — never pans with the canvas:

- `BrowserBar` (top)
- `IntroCard` (centre, click opens long-letter modal)
- `HintPill` (centre, 120px below intro)
- `ColourPicker` (bottom)

All at `z-[40]`. They sit above tiles and below modals.

## Gotchas — real bugs we hit, do not repeat

1. **`<button>` cannot be a descendant of `<button>`.** TileEl's outer wrapper is `<div role="button">` (not `<button>`) because tile bodies can contain buttons (voice note play, song play). Same for `IntroCard`.
2. **`disabled={!hasAudio}` silently swallows clicks** — no event fires at all, looks like a broken button. Use `style={{ opacity: hasAudio ? 1 : 0.4 }}` plus an early-return inside the handler.
3. **`setPointerCapture` + `touch-action: none`** breaks click event synthesis. Removed capture entirely. See above.
4. **HEIC and MOV files don't play in browsers.** Convert to JPG / MP4 / MP3 before adding to `public/media/`. ffmpeg is installed via Homebrew.
5. **`preload="auto"` on `<audio>`** is fine for one or two short clips. If voice notes grow past 3-4 files, switch to `preload="metadata"` so they don't all load on page load.
6. **Quiet audio sources** — recordings often need normalisation. Use `ffmpeg -af "loudnorm=I=-16:TP=-1.5:LRA=11"` to bring them up to broadcast level.

## Adding new media

```bash
# 1. Drop files into site/public/media/
# 2. If HEIC: convert
sips -s format jpeg input.heic --out output.jpg
# 3. If MOV: extract MP4 video or MP3 audio
ffmpeg -i input.mov -vcodec libx264 -acodec aac output.mp4
ffmpeg -i input.mov -vn -acodec libmp3lame -q:a 4 -af "loudnorm=I=-16:TP=-1.5:LRA=11" output.mp3
# 4. Add a tile entry to app/data/tiles.ts with a warm filename
```

## Things NOT to do

- **Don't auto-write text notes from "Mum / Dad / Sam / Alex".** The conceit of the site is that real friends and family wrote them. AI-generated notes are the loudest tell that this was made by a robot. Leave note slots empty or remove them entirely until real humans contribute.
- **Don't add decorative-only interactive elements.** Fake play buttons, fake Spotify cards, fake voice waveforms with no audio — they break the spell when users click. Either make them real or remove them.
- **Don't change the typography stack** to Inter, Space Grotesk, or any generic "AI app" sans. The Geist × Geist Mono × Times New Roman trio is doing real work.
- **Don't refactor `Canvas.tsx` into many small files** without a clear reason. The components share refs and closures; the locality is intentional.
- **Don't introduce a state library.** `useState` + `useRef` covers everything.
- **Don't add `next/image`** for tile photos. The canvas uses pixel-perfect absolute positioning that fights the responsive image system. Plain `<img>` is the right choice here.
- **Don't add tests.** This is a one-off gift, not a product.

## Known polish list (in priority order)

1. Replace AI-written text notes with real ones from real people.
2. Resize the converted JPGs (`sips -Z 1600 site/public/media/*.jpg`) — many are 2-4MB.
3. Add `loading="lazy"` on `<img>` for tiles outside initial viewport, `<video preload="none">` on videos.
4. Add `app/icon.png` and `app/opengraph-image.png` for link previews when shared.
5. Mobile pinch-zoom isn't implemented — only single-pointer drag.
6. The hint pill could auto-hide after first drag.

## User context

- **Lota** (lotanidi@gmail.com) is the builder — designer-builder who codes with AI, ships publicly via Behind the Ship.
- Direct, terse feedback is preferred. Don't soften, don't pad.
- Critical of LLM-generated content masquerading as real human warmth.
- Will remove tiles that don't pass the curation bar — match that standard when adding content.
