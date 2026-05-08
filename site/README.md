# kam's birthday

A 2D draggable desktop of memories for Kam's birthday. Built with Next.js (App Router) + Tailwind.

## Run

From this directory (`site/`):

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

`npm run build` should also succeed for a production deploy.

## Notes

- All media lives in `public/media/`. `.heic` files were converted to `.jpg` with macOS `sips`. `.mov` files were dropped (no `ffmpeg` available locally) — the three `.mp4` files are used as-is.
- Tile metadata (positions, filenames, types) is hard-coded inline in `app/data/tiles.ts`. Filenames are friendly inventions, not the real UUID names.
- The single page is `app/page.tsx` → renders the `<Canvas />` client component in `components/Canvas.tsx`. There is no other state, no routing, no API.
