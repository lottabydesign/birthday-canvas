// Tile data lives in tiles.json so the local /admin route can edit it
// without having to mutate TypeScript source. The .ts file just types and
// re-exports the JSON.

import data from "./tiles.json";

export type TileType = "Photo" | "Video" | "Text" | "Voice Note" | "Song";

export type Tile = {
  id: string;
  filename: string;
  type: TileType;
  src?: string;          // for Photo / Video
  note?: string;         // for Text / Voice Note
  noteFrom?: string;     // who sent the text/voice
  audioSrc?: string;     // for Voice Note — real audio file
  noteImageSrc?: string; // for Text — replace body text with an image
  songTitle?: string;    // for Song
  songArtist?: string;   // for Song
  songCoverSrc?: string; // for Song — real cover image
  x: number;             // top-left x in canvas-space
  y: number;             // top-left y in canvas-space
  w: number;             // width
  h: number;             // height
  rotate?: number;       // small rotation in degrees
  ageBadge?: number;
};

export const tiles = data as Tile[];
