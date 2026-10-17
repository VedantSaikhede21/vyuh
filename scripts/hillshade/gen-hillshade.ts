// Hillshade images from a committed terrain preset (heightmap.u16 + meta.json),
// the login background, and per preset a scenario-list thumbnail and a briefing
// map with building footprints (Phase 3b). Node stdlib only: a minimal PNG writer
// on node:zlib.
//
//   node scripts/hillshade/gen-hillshade.ts --preset JK_MOUNTAIN \
//     --out apps/web/public/landing/login-hillshade.png --size 1600 --tone login
//   node scripts/hillshade/gen-hillshade.ts --all     # every preset: thumb.png, map.png
//
// Colours come from the design tokens (apps/web/lib/theme/scene-colours.ts).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { UI } from '../../apps/web/lib/theme/scene-colours.ts';

interface Meta {
  resolution: number;
  metresPerPx: number;
  relMinM: number;
  relMaxM: number;
  sizeM: number;
  files: { buildings: string };
}

/** Heights in metres, row 0 = south edge (SPEC §14 heightmap.u16 layout). */
export function readHeights(presetDir: string): { meta: Meta; h: Float32Array } {
  const meta = JSON.parse(readFileSync(join(presetDir, 'meta.json'), 'utf8')) as Meta;
  const buf = readFileSync(join(presetDir, 'heightmap.u16'));
  const n = meta.resolution;
  const h = new Float32Array(n * n);
  const span = meta.relMaxM - meta.relMinM;
  for (let i = 0; i < n * n; i++) h[i] = meta.relMinM + (buf.readUInt16LE(i * 2) * span) / 65535;
  return { meta, h };
}

/**
 * Standard hillshade (sun azimuth 315°, altitude 45°), 0..1, north-up rows
 * (row 0 = north) so the image can be written directly.
 */
export function hillshade(meta: Meta, h: Float32Array, zFactor = 1): Float32Array {
  const n = meta.resolution;
  const out = new Float32Array(n * n);
  const zen = ((90 - 45) * Math.PI) / 180;
  const az = ((360 - 315 + 90) * Math.PI) / 180;
  const at = (x: number, y: number) =>
    h[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))] ?? 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // y grows north in the heightmap.
      const dzdx = ((at(x + 1, y) - at(x - 1, y)) / (2 * meta.metresPerPx)) * zFactor;
      const dzdy = ((at(x, y + 1) - at(x, y - 1)) / (2 * meta.metresPerPx)) * zFactor;
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const s =
        Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect);
      out[(n - 1 - y) * n + x] = Math.min(1, Math.max(0, s));
    }
  }
  return out;
}

function hex(c: string): [number, number, number] {
  const v = Number.parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Map shade 0..1 between two token colours, bilinear-resampled to size × size. */
export function toRgb(
  shade: Float32Array,
  n: number,
  size: number,
  dark: string,
  light: string,
  gamma = 1,
  /** Quantise the tone to this many steps (smaller PNG; invisible on a dark ramp). */
  levels = 256,
): Uint8Array {
  const [r0, g0, b0] = hex(dark);
  const [r1, g1, b1] = hex(light);
  const out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    const fy = (y / (size - 1)) * (n - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(n - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = (x / (size - 1)) * (n - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(n - 1, x0 + 1);
      const tx = fx - x0;
      const at = (yy: number, xx: number) => shade[yy * n + xx] ?? 0;
      const s =
        (at(y0, x0) * (1 - tx) + at(y0, x1) * tx) * (1 - ty) +
        (at(y1, x0) * (1 - tx) + at(y1, x1) * tx) * ty;
      const t = Math.round(s ** gamma * (levels - 1)) / (levels - 1);
      const o = (y * size + x) * 3;
      out[o] = Math.round(r0 + (r1 - r0) * t);
      out[o + 1] = Math.round(g0 + (g1 - g0) * t);
      out[o + 2] = Math.round(b0 + (b1 - b0) * t);
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 8-bit RGB PNG, filter 0 on every row. */
export function encodePng(rgb: Uint8Array, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Tones: `login` = muted, darkened background (DESIGN §11.2); `map` = briefing map
 * and list thumbnail base (DESIGN §11.3–11.4), dark enough for overlays on top. */
const TONES = {
  login: { dark: UI.bg0, light: UI.line1, gamma: 1.4, levels: 20 },
  map: { dark: UI.bg0, light: UI.line2, gamma: 1.2, levels: 32 },
} as const;

/** Map footprints: a muted tone that reads as built-up area on the map ramp. */
const BUILDING_FILL = UI.text3;
/** Briefing map side (px) and list thumbnail (64 × 40 at 2×). */
export const MAP_PX = 1024;
export const THUMB_W = 128;
export const THUMB_H = 80;

/** Vertical exaggeration so flat plains still show their relief (1 for mountains). */
export function zFactorFor(meta: Meta): number {
  const relief = Math.max(meta.relMaxM - meta.relMinM, 1);
  return Math.min(8, Math.max(1, 150 / relief));
}

/** Fill building footprints (local metres, x east, z north) into a north-up RGB image. */
export function drawBuildings(
  rgb: Uint8Array,
  size: number,
  sizeM: number,
  rings: readonly (readonly [number, number])[][],
  colour: string,
): void {
  const [r, g, b] = hex(colour);
  const half = sizeM / 2;
  const px = (x: number) => ((x + half) / sizeM) * size;
  const py = (z: number) => ((half - z) / sizeM) * size;
  for (const ring of rings) {
    const pts = ring.map(([x, z]) => [px(x), py(z)] as const);
    const ys = pts.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i]!;
        const [bx, by] = pts[(i + 1) % pts.length]!;
        if (ay > yc !== by > yc) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // At least one pixel: small footprints still show at map scale.
        const xa = Math.max(0, Math.floor(xs[k]!));
        const xb = Math.min(size - 1, Math.max(xa, Math.ceil(xs[k + 1]!) - 1));
        for (let x = xa; x <= xb; x++) {
          const o = (y * size + x) * 3;
          rgb[o] = r;
          rgb[o + 1] = g;
          rgb[o + 2] = b;
        }
      }
    }
  }
}

/** Centre crop of a square RGB image to width × height. */
export function crop(rgb: Uint8Array, size: number, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  const x0 = Math.floor((size - width) / 2);
  const y0 = Math.floor((size - height) / 2);
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * size + x0) * 3;
    out.set(rgb.subarray(from, from + width * 3), y * width * 3);
  }
  return out;
}

/** thumb.png and map.png for one preset folder. */
export function presetImages(presetDir: string): { map: Buffer; thumb: Buffer } {
  const { meta, h } = readHeights(presetDir);
  const shade = hillshade(meta, h, zFactorFor(meta));
  const tone = TONES.map;
  const file = join(presetDir, meta.files.buildings);
  const rings = existsSync(file)
    ? (
        JSON.parse(readFileSync(file, 'utf8')) as {
          features: { geometry: { coordinates: [number, number][][] } }[];
        }
      ).features.map((f) => f.geometry.coordinates[0]!)
    : [];
  const image = (size: number) => {
    const rgb = toRgb(shade, meta.resolution, size, tone.dark, tone.light, tone.gamma, tone.levels);
    drawBuildings(rgb, size, meta.sizeM, rings, BUILDING_FILL);
    return rgb;
  };
  // The thumbnail shows the central 14 km × 8.75 km band, 128 px across.
  return {
    map: encodePng(image(MAP_PX), MAP_PX, MAP_PX),
    thumb: encodePng(crop(image(THUMB_W), THUMB_W, THUMB_W, THUMB_H), THUMB_W, THUMB_H),
  };
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (v === undefined) throw new Error(`missing --${name}`);
  return v;
}

if (import.meta.url === `file:///${resolve(process.argv[1] ?? '').replace(/\\/g, '/')}`) {
  const root = resolve(import.meta.dirname, '../..');
  if (process.argv.includes('--all')) {
    const terrain = join(root, 'apps/web/public/terrain');
    for (const name of readdirSync(terrain).sort()) {
      const dir = join(terrain, name);
      if (!existsSync(join(dir, 'meta.json'))) continue;
      const { map, thumb } = presetImages(dir);
      writeFileSync(join(dir, 'map.png'), map);
      writeFileSync(join(dir, 'thumb.png'), thumb);
      const kb = (b: Buffer) => (b.length / 1024).toFixed(1);
      console.log(`wrote ${name}/map.png (${kb(map)} KB), thumb.png (${kb(thumb)} KB)`);
    }
  } else {
    writeOne(root);
  }
}

function writeOne(root: string): void {
  const preset = arg('preset');
  const out = resolve(root, arg('out'));
  const size = Number(arg('size', '1024'));
  const tone = TONES[arg('tone', 'login') as keyof typeof TONES];
  const { meta, h } = readHeights(join(root, 'apps/web/public/terrain', preset));
  const shade = hillshade(meta, h, Number(arg('z', '1')));
  const png = encodePng(
    toRgb(shade, meta.resolution, size, tone.dark, tone.light, tone.gamma, tone.levels),
    size,
    size,
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`wrote ${out} (${size}×${size}, ${(png.length / 1024).toFixed(0)} KB)`);
}
