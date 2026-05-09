"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Tile } from "@/app/data/tiles";

// Text fields shown in the top half of each editor row.
const TEXT_FIELDS: Array<{
  key: keyof Tile;
  label: string;
  appliesTo?: Tile["type"][];
  placeholder?: string;
  // Render as <textarea> instead of <input>. Can be a fixed bool or a
  // predicate that decides per-tile (e.g. `note` is multi-line for Text
  // tiles but a single-line duration for Voice Notes).
  multiline?: boolean | ((tile: Tile) => boolean);
}> = [
  { key: "filename", label: "Filename (chrome bar)" },
  { key: "noteFrom", label: "Note from", appliesTo: ["Text", "Voice Note"] },
  {
    key: "note",
    label: "Body / duration",
    appliesTo: ["Text", "Voice Note"],
    multiline: (tile) => tile.type === "Text",
  },
  { key: "songTitle", label: "Song title", appliesTo: ["Song"] },
  { key: "songArtist", label: "Song artist", appliesTo: ["Song"] },
];

// Media fields — rendered as picker buttons that open a file-grid modal.
type MediaKind = "image" | "audio" | "video";

const MEDIA_FIELDS: Array<{
  key: keyof Tile;
  label: string;
  appliesTo: Tile["type"][];
  kind: (tile: Tile) => MediaKind;
}> = [
  {
    key: "src",
    label: "Source",
    appliesTo: ["Photo", "Video"],
    kind: (t) => (t.type === "Photo" ? "image" : "video"),
  },
  {
    key: "audioSrc",
    label: "Audio",
    appliesTo: ["Voice Note", "Song"],
    kind: () => "audio",
  },
  {
    key: "songCoverSrc",
    label: "Cover image",
    appliesTo: ["Song"],
    kind: () => "image",
  },
  {
    key: "noteImageSrc",
    label: "Image (replaces text)",
    appliesTo: ["Text"],
    kind: () => "image",
  },
];

type MediaFile = {
  name: string;
  url: string;
  kind: "image" | "audio" | "video" | "other";
  size: number;
  mtimeMs: number;
};

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
            <h1 className="text-lg font-semibold tracking-tight">Birthday canvas admin</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Edit the intro letter and tile metadata. Refresh the canvas
              tab to see changes.
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
        <IntroEditor />
        <div className="pt-4 pb-1 border-t border-zinc-200">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Tiles
          </h2>
        </div>
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

type IntroShape = {
  card: { topLeft: string; topRight: string; body: string; signoff: string };
  modal: { date: string; heading: string; paragraphs: string[] };
};

function IntroEditor() {
  const [intro, setIntro] = useState<IntroShape | null>(null);
  const [draft, setDraft] = useState<IntroShape | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/intro")
      .then((r) => r.json())
      .then((d: IntroShape) => {
        setIntro(d);
        setDraft(d);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Couldn’t load intro: {err}
      </div>
    );
  }

  if (!intro || !draft) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
        Loading intro…
      </div>
    );
  }

  const dirty = JSON.stringify(intro) !== JSON.stringify(draft);

  const save = async () => {
    setState("saving");
    setErr(null);
    try {
      const r = await fetch("/api/admin/intro", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${r.status}`);
      }
      const out = (await r.json()) as { intro: IntroShape };
      setIntro(out.intro);
      setDraft(out.intro);
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch (e) {
      setState("error");
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const updateCard = (key: keyof IntroShape["card"], val: string) =>
    setDraft({ ...draft, card: { ...draft.card, [key]: val } });

  const updateModal = (key: "date" | "heading", val: string) =>
    setDraft({ ...draft, modal: { ...draft.modal, [key]: val } });

  const updateParagraph = (i: number, val: string) => {
    const next = [...draft.modal.paragraphs];
    next[i] = val;
    setDraft({ ...draft, modal: { ...draft.modal, paragraphs: next } });
  };

  const addParagraph = () =>
    setDraft({
      ...draft,
      modal: { ...draft.modal, paragraphs: [...draft.modal.paragraphs, ""] },
    });

  const removeParagraph = (i: number) =>
    setDraft({
      ...draft,
      modal: {
        ...draft.modal,
        paragraphs: draft.modal.paragraphs.filter((_, idx) => idx !== i),
      },
    });

  const fieldClass =
    "mt-1 w-full px-3 py-2 rounded-md border border-zinc-200 bg-zinc-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:bg-white";
  const taClass = fieldClass + " resize-y min-h-[64px]";
  const labelClass =
    "text-[11px] font-medium text-zinc-500 uppercase tracking-wider";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Intro card &amp; full letter</h2>
        <span className="text-[11px] text-zinc-400">
          Use <code className="font-mono">*word*</code> to italicise.{" "}
          <code className="font-mono">\n</code> in card body = line break.
        </span>
      </div>

      {/* Card */}
      <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 space-y-3">
        <div className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider">
          Card (always visible)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>Top left (mono)</span>
            <input
              type="text"
              value={draft.card.topLeft}
              onChange={(e) => updateCard("topLeft", e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Top right (mono)</span>
            <input
              type="text"
              value={draft.card.topRight}
              onChange={(e) => updateCard("topRight", e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>
        <label className="block">
          <span className={labelClass}>Body</span>
          <textarea
            value={draft.card.body}
            onChange={(e) => updateCard("body", e.target.value)}
            className={taClass}
            rows={3}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Sign-off</span>
          <input
            type="text"
            value={draft.card.signoff}
            onChange={(e) => updateCard("signoff", e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      {/* Modal */}
      <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 space-y-3">
        <div className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider">
          Full letter (opens on tap)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>Date (top label)</span>
            <input
              type="text"
              value={draft.modal.date}
              onChange={(e) => updateModal("date", e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Heading</span>
            <input
              type="text"
              value={draft.modal.heading}
              onChange={(e) => updateModal("heading", e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>
        <div className="space-y-2">
          <span className={labelClass}>Paragraphs</span>
          {draft.modal.paragraphs.map((p, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                value={p}
                onChange={(e) => updateParagraph(i, e.target.value)}
                className={taClass}
                rows={3}
              />
              <button
                type="button"
                onClick={() => removeParagraph(i)}
                className="self-start px-2 py-1 rounded-md border border-zinc-300 bg-white text-zinc-500 hover:text-red-600 hover:border-red-300 text-xs"
                title="Remove paragraph"
                disabled={draft.modal.paragraphs.length <= 1}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addParagraph}
            className="text-xs text-zinc-600 hover:text-zinc-900 underline"
          >
            + add paragraph
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || state === "saving"}
          onClick={save}
          className="px-3 py-1.5 rounded-md bg-zinc-900 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800"
        >
          {state === "saving"
            ? "Saving…"
            : state === "saved"
              ? "Saved ✓"
              : "Save intro"}
        </button>
        {dirty && state !== "saving" && (
          <button
            type="button"
            onClick={() => setDraft(intro)}
            className="text-xs text-zinc-500 hover:text-zinc-700"
          >
            Discard
          </button>
        )}
        {err && state === "error" && (
          <span className="text-xs text-red-600 ml-auto">{err}</span>
        )}
      </div>
    </div>
  );
}

function MediaPicker({
  label,
  value,
  kind,
  onChange,
}: {
  label: string;
  value: string;
  kind: MediaKind;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<MediaFile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lazy-load the media list the first time the picker opens.
  useEffect(() => {
    if (!open || files !== null) return;
    fetch("/api/admin/media")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as MediaFile[];
      })
      .then(setFiles)
      .catch((e) => setLoadError(String(e)));
  }, [open, files]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const filtered = (files ?? []).filter((f) => f.kind === kind);
  const fileName = value ? value.split("/").pop() : "";

  return (
    <>
      <div className="flex items-center gap-3 p-2 rounded-md border border-zinc-200 bg-zinc-50">
        <MediaThumb url={value} kind={kind} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            {label}
          </div>
          <div className="text-xs text-zinc-700 font-mono truncate">
            {fileName || <span className="text-zinc-400">(none)</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-2.5 py-1 rounded-md border border-zinc-300 bg-white text-xs hover:bg-zinc-100"
        >
          {value ? "Change…" : "Pick…"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-zinc-400 hover:text-zinc-700"
            title="Clear"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200">
              <div>
                <div className="font-semibold text-sm">Pick a {kind}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {filtered.length} file{filtered.length === 1 ? "" : "s"} in{" "}
                  <code>public/media/</code>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-900 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {loadError && (
                <div className="text-sm text-red-600">
                  Couldn’t load media: {loadError}
                </div>
              )}
              {!files && !loadError && (
                <div className="text-sm text-zinc-500">Loading…</div>
              )}
              {files && filtered.length === 0 && (
                <div className="text-sm text-zinc-500">
                  No {kind} files found in <code>public/media/</code>. Drop one
                  in the folder, then refresh.
                </div>
              )}
              {filtered.length > 0 && (
                <div
                  className={
                    kind === "image" || kind === "video"
                      ? "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3"
                      : "flex flex-col gap-2"
                  }
                >
                  {filtered.map((f) => {
                    const selected = f.url === value;
                    return (
                      <button
                        key={f.url}
                        type="button"
                        onClick={() => {
                          onChange(f.url);
                          setOpen(false);
                        }}
                        className={
                          "text-left group rounded-md overflow-hidden border-2 " +
                          (selected
                            ? "border-zinc-900"
                            : "border-zinc-200 hover:border-zinc-400")
                        }
                      >
                        <MediaThumb url={f.url} kind={kind} large />
                        <div className="px-2 py-1.5 bg-white">
                          <div className="text-[11px] font-mono text-zinc-700 truncate">
                            {f.name}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {Math.round(f.size / 1024)} KB
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MediaThumb({
  url,
  kind,
  large = false,
}: {
  url: string;
  kind: MediaKind;
  large?: boolean;
}) {
  const sizing = large
    ? "aspect-square w-full bg-zinc-100"
    : "w-12 h-12 shrink-0 rounded bg-zinc-100";

  if (!url) {
    return (
      <div className={sizing + " grid place-items-center text-zinc-400 text-xs"}>
        —
      </div>
    );
  }

  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={sizing + " object-cover"}
        loading="lazy"
      />
    );
  }
  if (kind === "video") {
    return (
      <video
        src={url}
        className={sizing + " object-cover"}
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  // audio
  return (
    <div
      className={
        sizing +
        " grid place-items-center bg-zinc-900 text-white text-lg rounded"
      }
    >
      ♪
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

  const textFields = TEXT_FIELDS.filter(
    (f) => !f.appliesTo || f.appliesTo.includes(tile.type)
  );
  const mediaFields = MEDIA_FIELDS.filter((f) =>
    f.appliesTo.includes(tile.type)
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
        {textFields.map(({ key, label, placeholder, multiline }) => {
          const currentValue = (draft[key] ?? tile[key] ?? "") as string;
          const isMultiline =
            typeof multiline === "function" ? multiline(tile) : !!multiline;
          const inputClassName =
            "mt-1 w-full px-3 py-2 rounded-md border border-zinc-200 bg-zinc-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:bg-white";
          return (
            <label
              key={String(key)}
              className={"block" + (isMultiline ? " sm:col-span-2" : "")}
            >
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                {label}
              </span>
              {isMultiline ? (
                <textarea
                  value={currentValue}
                  placeholder={placeholder}
                  rows={5}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                  // `field-sizing: content` lets the textarea auto-grow
                  // with its content (Chrome 123+, Safari 17.4+). Falls
                  // back gracefully to the rows={5} minimum elsewhere.
                  style={{ fieldSizing: "content" } as CSSProperties}
                  className={inputClassName + " resize-y leading-relaxed"}
                />
              ) : (
                <input
                  type="text"
                  value={currentValue}
                  placeholder={placeholder}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                  className={inputClassName}
                />
              )}
            </label>
          );
        })}
      </div>

      {mediaFields.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {mediaFields.map(({ key, label, kind }) => {
            const currentValue = (draft[key] ?? tile[key] ?? "") as string;
            return (
              <MediaPicker
                key={String(key)}
                label={label}
                value={currentValue}
                kind={kind(tile)}
                onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
              />
            );
          })}
        </div>
      )}

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
