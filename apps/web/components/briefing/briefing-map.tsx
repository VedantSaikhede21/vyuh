'use client';

import type { Scenario } from '@vyuh/shared';
import { useEffect, useRef, useState } from 'react';
import {
  GRID,
  MASKED,
  OUT_OF_RANGE,
  type CoverageAltitude,
  type SensorSite,
} from '@/lib/briefing/coverage';
import type { CoverageState } from '@/lib/briefing/use-coverage';
import { UI, ZONES } from '@/lib/theme/scene-colours';
import { BriefingLegend, LEGEND_H } from './briefing-legend';

// Briefing map (DESIGN §11.4): the preset's hillshade with buildings (map.png),
// LOS coverage shading, zones, the asset, sensor sites, effector and radar range
// rings, the intel axis when the briefing states one, a north arrow and a scale
// bar. Canvas 2D, north up; scenario frame x east, z north. A legend sits under
// the map when the map is width-limited and the height left over fits it.

const SCALE_STEPS_M = [500, 1000, 2000, 5000];
/** Gap between the map and the legend, px. */
const LEGEND_GAP = 12;

/** Scale bar length: the largest step up to a sixth of the map. */
export function scaleStepM(sizeM: number): number {
  return [...SCALE_STEPS_M].reverse().find((s) => s <= sizeM / 6) ?? SCALE_STEPS_M[0]!;
}

function cssVar(name: string): string {
  if (typeof document === 'undefined') return 'sans-serif';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'sans-serif';
}

function hexToRgba(hex: string, alpha: number): string {
  const v = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

export function BriefingMap({
  scenario,
  sizeM,
  sites,
  coverage,
  intelAxisDeg,
  altitude,
  onLegend,
  onPick,
  draft,
  pending,
}: {
  scenario: Scenario;
  sizeM: number;
  sites: readonly SensorSite[];
  coverage: CoverageState;
  intelAxisDeg: number | null;
  altitude: CoverageAltitude;
  /** Told whether the legend is shown (the page hides its caption then). */
  onLegend?: (shown: boolean) => void;
  /** Scenario builder (Phase 4b): a click on the map, in scenario metres [x, z]. */
  onPick?: (p: [number, number]) => void;
  /** Scenario builder: the zone being drawn, outlined in --select. */
  draft?: readonly (readonly [number, number])[];
  /** Scenario builder: drawn zones not in the shown scenario (its checks failed), dashed --warn. */
  pending?: readonly (readonly (readonly [number, number])[])[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const legend = box.h - box.w >= LEGEND_H + LEGEND_GAP;
  const px = Math.floor(Math.min(box.w, box.h));
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = `/terrain/${scenario.terrain.preset}/map.png`;
  }, [scenario.terrain.preset]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || px === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = px * dpr;
    c.height = px * dpr;
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const half = sizeM / 2;
    const k = px / sizeM;
    const X = (x: number) => (x + half) * k;
    const Y = (z: number) => (half - z) * k;
    const cond = cssVar('--font-cond');
    const mono = cssVar('--font-mono');

    g.fillStyle = UI.bg0;
    g.fillRect(0, 0, px, px);
    if (image) g.drawImage(image, 0, 0, px, px);

    // LOS coverage: shade cells no sensor site can see (inside some site's range).
    if (coverage.status === 'ready') {
      const cell = px / GRID;
      g.fillStyle = hexToRgba(UI.bg0, 0.62);
      for (let i = 0; i < GRID * GRID; i++) {
        let inRange = false;
        let seen = false;
        for (const grid of coverage.grids) {
          const v = grid[i];
          if (v === OUT_OF_RANGE) continue;
          inRange = true;
          if (v !== MASKED) seen = true;
        }
        if (inRange && !seen) {
          g.fillRect((i % GRID) * cell, Math.floor(i / GRID) * cell, cell + 0.5, cell + 0.5);
        }
      }
    }

    // Zones: no-kinetic hatched and outlined, the border dashed.
    for (const z of scenario.zones) {
      if (z.kind === 'NO_KINETIC') {
        const pts = z.polygon.map(([x, zz]) => [X(x), Y(zz)] as const);
        g.save();
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.clip();
        g.strokeStyle = ZONES.hatchTerrain;
        g.lineWidth = 1;
        for (let d = -px; d < 2 * px; d += 7) {
          g.beginPath();
          g.moveTo(d, 0);
          g.lineTo(d - px, px);
          g.stroke();
        }
        g.restore();
        g.strokeStyle = ZONES.outline;
        g.lineWidth = 1.5;
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.stroke();
        const top = Math.min(...pts.map((p) => p[1]));
        const left = Math.min(...pts.map((p) => p[0]));
        g.fillStyle = ZONES.label;
        g.font = `600 11px ${cond}`;
        g.fillText(z.id, left + 2, top - 3);
      } else if (z.kind === 'BORDER_LINE') {
        g.strokeStyle = ZONES.border;
        g.lineWidth = 1.5;
        g.setLineDash([8, 6]);
        g.beginPath();
        z.polyline.forEach(([x, zz], i) => (i ? g.lineTo(X(x), Y(zz)) : g.moveTo(X(x), Y(zz))));
        g.stroke();
        g.setLineDash([]);
        const [lx, lz] = z.polyline[0] ?? [0, 0];
        g.fillStyle = ZONES.label;
        g.font = `600 11px ${cond}`;
        g.fillText(
          'BORDER',
          Math.min(Math.max(X(lx) + 4, 4), px - 60),
          Math.min(Math.max(Y(lz) - 4, 14), px - 4),
        );
      }
    }

    const ring = (x: number, z: number, r: number, dash: number[], label: string) => {
      g.strokeStyle = UI.text3;
      g.lineWidth = 1;
      g.setLineDash(dash);
      g.beginPath();
      g.arc(X(x), Y(z), r * k, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = UI.text3;
      g.font = `500 11px ${mono}`;
      g.fillText(label, X(x) + 3, Y(z) - r * k - 3);
    };
    for (const s of scenario.sensors) {
      if (s.kind === 'RADAR')
        ring(s.x, s.z, s.refRangeM, [2, 4], `RADAR ${(s.refRangeM / 1000).toFixed(1)} km`);
    }
    for (const e of scenario.effectors) {
      if (e.kind === 'INTERCEPT')
        ring(e.x, e.z, e.rangeM, [6, 4], `INT ${(e.rangeM / 1000).toFixed(1)} km`);
    }

    // Sensor sites: triangle; the asset: square.
    for (const s of sites) {
      const x = X(s.x);
      const y = Y(s.z);
      g.fillStyle = UI.text1;
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x + 5, y + 4);
      g.lineTo(x - 5, y + 4);
      g.closePath();
      g.fill();
    }
    for (const a of scenario.assets) {
      const x = X(a.x);
      const y = Y(a.z);
      g.strokeStyle = UI.select;
      g.lineWidth = 2;
      g.strokeRect(x - 6, y - 6, 12, 12);
      g.fillStyle = UI.text1;
      g.font = `600 12px ${cond}`;
      g.fillText(a.name.toUpperCase(), x + 10, y + 4);
    }

    // Intel axis: from the map edge toward the first asset.
    const a0 = scenario.assets[0];
    if (intelAxisDeg !== null && a0) {
      const b = (intelAxisDeg * Math.PI) / 180;
      const from = { x: a0.x + Math.sin(b) * sizeM * 0.42, z: a0.z + Math.cos(b) * sizeM * 0.42 };
      const to = { x: a0.x + Math.sin(b) * sizeM * 0.12, z: a0.z + Math.cos(b) * sizeM * 0.12 };
      g.strokeStyle = UI.text2;
      g.fillStyle = UI.text2;
      g.lineWidth = 2;
      g.setLineDash([10, 6]);
      g.beginPath();
      g.moveTo(X(from.x), Y(from.z));
      g.lineTo(X(to.x), Y(to.z));
      g.stroke();
      g.setLineDash([]);
      const ang = Math.atan2(Y(to.z) - Y(from.z), X(to.x) - X(from.x));
      g.beginPath();
      g.moveTo(X(to.x), Y(to.z));
      g.lineTo(X(to.x) - 10 * Math.cos(ang - 0.4), Y(to.z) - 10 * Math.sin(ang - 0.4));
      g.lineTo(X(to.x) - 10 * Math.cos(ang + 0.4), Y(to.z) - 10 * Math.sin(ang + 0.4));
      g.closePath();
      g.fill();
      g.font = `600 11px ${cond}`;
      g.fillText(
        'INTEL AXIS',
        Math.min(Math.max(X(from.x) - 30, 4), px - 70),
        Math.min(Math.max(Y(from.z) + 14, 14), px - 6),
      );
    }

    // North arrow (top right) and scale bar (bottom left).
    g.fillStyle = UI.text1;
    g.strokeStyle = UI.text1;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px - 20, 34);
    g.lineTo(px - 20, 14);
    g.stroke();
    g.beginPath();
    g.moveTo(px - 20, 10);
    g.lineTo(px - 25, 18);
    g.lineTo(px - 15, 18);
    g.closePath();
    g.fill();
    g.font = `600 12px ${cond}`;
    g.fillText('N', px - 24, 48);
    const step = scaleStepM(sizeM);
    const w = step * k;
    g.fillStyle = hexToRgba(UI.bg0, 0.8);
    g.fillRect(8, px - 30, w + 16, 22);
    g.fillStyle = UI.text1;
    g.fillRect(16, px - 14, w, 2);
    g.fillRect(16, px - 18, 1.5, 6);
    g.fillRect(16 + w - 1.5, px - 18, 1.5, 6);
    g.font = `500 11px ${mono}`;
    g.fillText(step >= 1000 ? `${step / 1000} km` : `${step} m`, 18, px - 20);

    // Builder zones the shown scenario does not have yet (its checks failed).
    for (const poly of pending ?? []) {
      g.strokeStyle = UI.warn;
      g.lineWidth = 1.5;
      g.setLineDash([6, 4]);
      g.beginPath();
      poly.forEach(([x, zz], i) => (i ? g.lineTo(X(x), Y(zz)) : g.moveTo(X(x), Y(zz))));
      g.closePath();
      g.stroke();
      g.setLineDash([]);
    }

    // Builder draft zone: vertices and edges in --select, closing edge dashed.
    if (draft && draft.length > 0) {
      g.strokeStyle = UI.select;
      g.fillStyle = UI.select;
      g.lineWidth = 1.5;
      g.beginPath();
      draft.forEach(([x, zz], i) => (i ? g.lineTo(X(x), Y(zz)) : g.moveTo(X(x), Y(zz))));
      g.stroke();
      if (draft.length > 2) {
        const [fx, fz] = draft[0]!;
        const [lx, lz] = draft[draft.length - 1]!;
        g.setLineDash([4, 4]);
        g.beginPath();
        g.moveTo(X(lx), Y(lz));
        g.lineTo(X(fx), Y(fz));
        g.stroke();
        g.setLineDash([]);
      }
      for (const [x, zz] of draft) g.fillRect(X(x) - 3, Y(zz) - 3, 6, 6);
    }
  }, [px, image, scenario, sizeM, sites, coverage, intelAxisDeg, draft, pending]);

  useEffect(() => onLegend?.(legend), [legend, onLegend]);

  return (
    <div
      ref={wrap}
      className="relative flex h-full w-full flex-col items-center justify-start overflow-hidden"
      style={{ gap: LEGEND_GAP }}
    >
      <canvas
        ref={canvas}
        style={{ width: px, height: px }}
        onClick={
          onPick
            ? (e) => {
                if (px === 0) return;
                const r = e.currentTarget.getBoundingClientRect();
                const k = sizeM / px;
                onPick([
                  Math.round((e.clientX - r.left) * k - sizeM / 2),
                  Math.round(sizeM / 2 - (e.clientY - r.top) * k),
                ]);
              }
            : undefined
        }
        className={onPick ? 'shrink-0 cursor-crosshair' : 'shrink-0'}
        role="img"
        aria-label="Briefing map: terrain, zones, defended asset, sensor site and coverage"
        data-testid="briefing-map"
      />
      {legend && (
        <BriefingLegend
          scenario={scenario}
          altitude={altitude}
          intelAxis={intelAxisDeg !== null}
          scaleStepM={scaleStepM(sizeM)}
          width={px}
        />
      )}
    </div>
  );
}
