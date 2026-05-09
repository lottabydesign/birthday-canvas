// Dev-only: lists files in public/media/ so the admin can pick one
// for a tile's media field. Mirrors the dev-only guard from
// /api/admin/tiles — production deploys get a 403.

import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const MEDIA_DIR = path.join(process.cwd(), "public", "media");

const ALLOWED_EXT =
  /\.(jpg|jpeg|png|gif|webp|svg|mp4|m4v|webm|mov|mp3|m4a|wav|aac|ogg)$/i;

function devOnly() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Admin API is dev-only." },
      { status: 403 }
    );
  }
  return null;
}

function classify(filename: string): "image" | "audio" | "video" | "other" {
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename)) return "image";
  if (/\.(mp3|m4a|wav|aac|ogg)$/i.test(filename)) return "audio";
  if (/\.(mp4|m4v|webm|mov)$/i.test(filename)) return "video";
  return "other";
}

export async function GET() {
  const guard = devOnly();
  if (guard) return guard;

  try {
    const entries = await readdir(MEDIA_DIR);
    const files = await Promise.all(
      entries
        .filter((name) => ALLOWED_EXT.test(name))
        .map(async (name) => {
          const full = path.join(MEDIA_DIR, name);
          const s = await stat(full);
          return {
            name,
            url: `/media/${name}`,
            kind: classify(name),
            size: s.size,
            mtimeMs: s.mtimeMs,
          };
        })
    );
    // Newest first — assumption: most recent additions are most relevant
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return NextResponse.json(files);
  } catch (err) {
    console.error("[admin/media] GET failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
