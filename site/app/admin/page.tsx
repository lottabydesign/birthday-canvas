"use client";

import { useEffect, useState } from "react";
import type { Tile } from "@/app/data/tiles";

// Fields that are commonly edited via this admin.
// Add more here if you want to expose them.
const EDITABLE_FIELDS: Array<{
  key: keyof Tile;
  label: string;
  appliesTo?: Tile["type"][]; // limit to certain tile types
  placeholder?: string;
}> = [
  { key: "filename", label: "Filename (chrome bar)" },
  { key: "noteFrom", label: "Note from", appliesTo: ["Text", "Voice Note"] },
  { key: "note", label: "Body / duration", appliesTo: ["Text", "Voice Note"] },
  { key: "songTitle", label: "Song title", appliesTo: ["Song"] },
  { key: "songArtist", label: "Song artist", appliesTo: ["Song"] },
];

type SaveState = "idle" | "saving" | "saved" | "error";

export default function AdminPage() {
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/tiles")
      .then(async (r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
        return r.json();
      })
      .then((data: Tile[]) => setTiles(data))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="min-h-dvh bg-zinc-50 p-8 text-zinc-900">
        <div className="max-w-2xl mx-auto rounded-xl border border-red-200 bg-red-50 p-6">
          <h1 className="font-semibold text-red-900">Admin unavailable</h1>
          <p className="mt-2 text-sm text-red-800">{error}</p>
          <p className="mt-3 text-xs text-red-800/80">
            This admin only works in <code>npm run dev</code>. It writes to{" "}
            <code>app/data/tiles.json</code> on disk, which Vercel’s serverless
            filesystem doesn’t allow.
          </p>
        </div>
      </div>
    );
  }

  if (!tiles) {
    return (
      <div className="min-h-dvh bg-zinc-50 p-8 grid place-items-center text-zinc-500 text-sm">
        Loading tiles…
      </div>
    );
  }

  const visible = tiles.filter((t) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      t.id.toLowerCase().includes(q) ||
      t.filename.toLowerCase().includes(q) ||
      t.type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 bg-white/85 backdrop-blur border-b border-zinc-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Tile metadata</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Edits write to <code>app/data/tiles.json</code>. Refresh the
              canvas tab to see changes.
            </p>
          </div>
          <input
            type="search"
            placeholder="search by id, filename, type…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ml-auto px-3 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 w-72"
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-3">
        {visible.length === 0 && (
          <p className="text-sm text-zinc-500">No tiles match.</p>
        )}
        {visible.map((tile) => (
          <TileEditor
            key={tile.id}
            tile={tile}
            onSave={async (patch) => {
              const r = await fetch("/api/admin/tiles", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: tile.id, patch }),
              });
              if (!r.ok) {
                const body = await r.json().catch(() => ({}));
                throw new Error(body?.error || `HTTP ${r.status}`);
              }
              const out = (await r.json()) as { tile: Tile };
              setTiles((curr) =>
                curr
                  ? curr.map((t) => (t.id === tile.id ? out.tile : t))
                  : curr
              );
            }}
          />
        ))}
      </main>
    </div>
  );
}

function TilePreview({ tile }: { tile: Tile }) {
  const wrapper =
    "shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100 grid place-items-center";

  if ((tile.type === "Photo" || tile.type === "Video") && tile.src) {
    if (tile.type === "Video") {
      return (
        <div className={wrapper}>
          <video
            src={tile.src}
            className="w-full h-full object-cover"
            muted
            loop
            autoPlay
            playsInline
          />
        </div>
      );
    }
    return (
      <div className={wrapper}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tile.src}
          alt={tile.filename}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  if (tile.type === "Text" && tile.noteImageSrc) {
    return (
      <div className={wrapper + " bg-[#fffdf7]"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tile.noteImageSrc}
          alt={tile.filename}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  if (tile.type === "Text") {
    return (
      <div
        className={wrapper + " bg-[#fffdf7] border-zinc-300"}
        style={{ padding: 8 }}
      >
        <p
          className="text-[8px] leading-tight text-zinc-700 font-serif text-left line-clamp-6 self-start"
          style={{ display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {tile.note || "(empty note)"}
        </p>
      </div>
    );
  }

  if (tile.type === "Song") {
    return (
      <div className={wrapper + " bg-[#101018] relative"}>
        {tile.songCoverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tile.songCoverSrc}
            alt={tile.songTitle ?? tile.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-white text-2xl font-serif italic">♫</span>
        )}
        <span className="absolute bottom-1 left-1 right-1 text-[9px] text-white/90 truncate">
          {tile.songTitle ?? "(no title)"}
        </span>
      </div>
    );
  }

  if (tile.type === "Voice Note") {
    return (
      <div className={wrapper + " bg-[#0a0a14] flex-col gap-1 text-white"}>
        <span className="text-xl">▶︎</span>
        <span className="text-[9px] text-white/60">{tile.note || ""}</span>
      </div>
    );
  }

  return <div className={wrapper}>—</div>;
}

function TileEditor({
  tile,
  onSave,
}: {
  tile: Tile;
  onSave: (patch: Partial<Tile>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Partial<Tile>>({});
  const [state, setState] = useState<SaveState>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const fields = EDITABLE_FIELDS.filter(
    (f) => !f.appliesTo || f.appliesTo.includes(tile.type)
  );

  const dirty = Object.keys(draft).some(
    (k) => draft[k as keyof Tile] !== tile[k as keyof Tile]
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300 transition-colors flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500 shrink-0">
            {tile.type}
          </span>
          <span className="font-mono text-[11px] text-zinc-400 shrink-0 truncate">
            {tile.id}
          </span>
          <span className="text-xs text-zinc-400 ml-auto shrink-0">
            ({tile.x}, {tile.y}) · {tile.w}×{tile.h}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(({ key, label, placeholder }) => {
          const currentValue = (draft[key] ?? tile[key] ?? "") as string;
          return (
            <label key={String(key)} className="block">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                {label}
              </span>
              <input
                type="text"
                value={currentValue}
                placeholder={placeholder}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [key]: e.target.value }))
                }
                className="mt-1 w-full px-3 py-2 rounded-md border border-zinc-200 bg-zinc-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:bg-white"
              />
            </label>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || state === "saving"}
          onClick={async () => {
            setState("saving");
            setErrMsg(null);
            try {
              // Only send fields that actually changed
              const patch: Partial<Tile> = {};
              for (const k of Object.keys(draft) as Array<keyof Tile>) {
                if (draft[k] !== tile[k]) {
                  // empty-string → undefined so empty fields get removed
                  const v = draft[k] === "" ? undefined : draft[k];
                  (patch as Record<string, unknown>)[k as string] = v;
                }
              }
              await onSave(patch);
              setDraft({});
              setState("saved");
              setTimeout(() => setState("idle"), 1500);
            } catch (e) {
              setState("error");
              setErrMsg(e instanceof Error ? e.message : String(e));
            }
          }}
          className="px-3 py-1.5 rounded-md bg-zinc-900 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800"
        >
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save"}
        </button>
        {dirty && state !== "saving" && (
          <button
            type="button"
            onClick={() => {
              setDraft({});
              setState("idle");
              setErrMsg(null);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-700"
          >
            Discard
          </button>
        )}
        {errMsg && (
          <span className="text-xs text-red-600 ml-auto">{errMsg}</span>
        )}
        </div>
      </div>
      <TilePreview tile={tile} />
    </div>
  );
}
