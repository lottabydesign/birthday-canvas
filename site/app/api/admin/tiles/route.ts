// Dev-only admin API for editing tile metadata.
// Writes directly to app/data/tiles.json. Will not work on Vercel
// (read-only filesystem) — that's intentional. This is for local editing.

import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tile } from "@/app/data/tiles";

const DATA_PATH = path.join(process.cwd(), "app", "data", "tiles.json");

function devOnly() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Admin API is dev-only." },
      { status: 403 }
    );
  }
  return null;
}

export async function GET() {
  const guard = devOnly();
  if (guard) return guard;
  const raw = await readFile(DATA_PATH, "utf8");
  return NextResponse.json(JSON.parse(raw));
}

export async function PATCH(req: Request) {
  const guard = devOnly();
  if (guard) return guard;

  try {
    const body = (await req.json()) as { id: string; patch: Partial<Tile> };
    if (!body?.id || !body?.patch) {
      return NextResponse.json(
        { error: "Body must include { id, patch }." },
        { status: 400 }
      );
    }

    const raw = await readFile(DATA_PATH, "utf8");
    const tiles = JSON.parse(raw) as Tile[];
    const idx = tiles.findIndex((t) => t.id === body.id);
    if (idx === -1) {
      return NextResponse.json(
        { error: `No tile with id ${body.id}` },
        { status: 404 }
      );
    }

    tiles[idx] = { ...tiles[idx], ...body.patch } as Tile;
    await writeFile(DATA_PATH, JSON.stringify(tiles, null, 2) + "\n", "utf8");

    console.log(`[admin] updated tile ${body.id}`, body.patch);
    return NextResponse.json({ ok: true, tile: tiles[idx] });
  } catch (err) {
    console.error("[admin] PATCH failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
