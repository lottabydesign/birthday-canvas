// Dev-only: read/write the intro card + full-letter content.
// Same dev-only / file-write pattern as /api/admin/tiles. In production
// this returns 403 (the intro JSON is bundled at build time).

import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_PATH = path.join(process.cwd(), "app", "data", "intro.json");

type IntroShape = {
  card: {
    topLeft: string;
    topRight: string;
    body: string;
    signoff: string;
  };
  modal: {
    date: string;
    heading: string;
    paragraphs: string[];
  };
};

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

export async function PUT(req: Request) {
  const guard = devOnly();
  if (guard) return guard;

  try {
    const body = (await req.json()) as IntroShape;
    // Light validation — every required key must exist.
    if (
      !body?.card ||
      !body?.modal ||
      typeof body.card.topLeft !== "string" ||
      typeof body.card.topRight !== "string" ||
      typeof body.card.body !== "string" ||
      typeof body.card.signoff !== "string" ||
      typeof body.modal.date !== "string" ||
      typeof body.modal.heading !== "string" ||
      !Array.isArray(body.modal.paragraphs)
    ) {
      return NextResponse.json(
        { error: "Body must include { card: {topLeft, topRight, body, signoff}, modal: {date, heading, paragraphs[]} }." },
        { status: 400 }
      );
    }

    await writeFile(DATA_PATH, JSON.stringify(body, null, 2) + "\n", "utf8");
    console.log("[admin/intro] updated");
    return NextResponse.json({ ok: true, intro: body });
  } catch (err) {
    console.error("[admin/intro] PUT failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
