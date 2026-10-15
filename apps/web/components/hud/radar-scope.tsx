'use client';

import { TICK_MS } from '@vyuh/sim-core';
import { useEffect, useRef } from 'react';
import { AFFILIATION_STYLE, traceAffiliation } from '@/lib/affiliation';
import { PPI, RF_STROBE, ZONES, canvasMonoFont, withAlpha } from '@/lib/theme/scene-colours';
import { centroid } from '@/lib/hud/zones';
import { placeLabels } from '@/lib/hud/declutter';
import type { Commands } from '@/lib/sim/commands';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';

const SIZE = 320;
const PICK_PX = 14;

/** Radar PPI (SPEC §15): north-up, range rings every km, rotating sweep, track blips. */
export function RadarScope({ runtime, commands }: { runtime: SimRuntime; commands: Commands }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radar = runtime.scenario.sensors.find((s) => s.kind === 'RADAR');
  const maxRangeM =
    Math.ceil(((radar?.kind === 'RADAR' ? radar.refRangeM : 3000) * 1.4) / 1000) * 1000;
  const scanMs = (radar?.kind === 'RADAR' ? radar.scanPeriodS : 2) * 1000;
  const origin = { x: radar?.x ?? 0, z: radar?.z ?? 0 };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);
    const c = SIZE / 2;
    const r = c - 14;
    const pxPerM = r / maxRangeM;
    let raf = 0;
    const px = (x: number) => c + (x - origin.x) * pxPerM;
    const py = (z: number) => c - (z - origin.z) * pxPerM;
    // Diagonal hatch for NO_KINETIC zones (neutral chrome, Step 10).
    const tile = document.createElement('canvas');
    tile.width = tile.height = 6 * dpr;
    const tctx = tile.getContext('2d');
    if (tctx) {
      tctx.strokeStyle = ZONES.hatch;
      tctx.lineWidth = dpr;
      tctx.beginPath();
      tctx.moveTo(0, tile.height);
      tctx.lineTo(tile.width, 0);
      tctx.stroke();
    }
    const hatch = ctx.createPattern(tile, 'repeat');
    hatch?.setTransform(new DOMMatrix().scale(1 / dpr));

    const draw = () => {
      const hud = useHudStore.getState().hud;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = PPI.background;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      // Range rings + labels.
      ctx.strokeStyle = PPI.rings;
      ctx.fillStyle = PPI.ringLabels;
      ctx.font = canvasMonoFont(11);
      ctx.lineWidth = 1;
      for (let km = 1; km * 1000 <= maxRangeM; km++) {
        ctx.beginPath();
        ctx.arc(c, c, km * 1000 * pxPerM, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(`${km}`, c + 3, c - km * 1000 * pxPerM + 11);
      }
      for (let deg = 0; deg < 360; deg += 30) {
        const a = (deg * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.sin(a) * r, c - Math.cos(a) * r);
        ctx.stroke();
      }
      ctx.fillStyle = PPI.north;
      ctx.fillText('N', c - 4, 11);

      // Effector ranges (dashed chrome).
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = PPI.assetRing;
      for (const e of runtime.scenario.effectors) {
        ctx.beginPath();
        ctx.arc(
          c + (e.x - origin.x) * pxPerM,
          c - (e.z - origin.z) * pxPerM,
          e.rangeM * pxPerM,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Zones: NO_KINETIC hatched + outlined with its id, border lines dashed.
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.font = canvasMonoFont(11);
      for (const z of runtime.scenario.zones) {
        if (z.kind === 'NO_KINETIC') {
          ctx.beginPath();
          z.polygon.forEach(([x, zz], i) =>
            i === 0 ? ctx.moveTo(px(x), py(zz)) : ctx.lineTo(px(x), py(zz)),
          );
          ctx.closePath();
          if (hatch) {
            ctx.fillStyle = hatch;
            ctx.fill();
          }
          ctx.strokeStyle = ZONES.outline;
          ctx.lineWidth = 1;
          ctx.stroke();
          const [cx, cz] = centroid(z.polygon);
          ctx.fillStyle = ZONES.label;
          ctx.fillText(z.id, px(cx) + 6, py(cz) - 4);
        } else if (z.kind === 'BORDER_LINE') {
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = ZONES.border;
          ctx.beginPath();
          z.polyline.forEach(([x, zz], i) =>
            i === 0 ? ctx.moveTo(px(x), py(zz)) : ctx.lineTo(px(x), py(zz)),
          );
          ctx.stroke();
          ctx.setLineDash([]);
          const mid = z.polyline[Math.floor(z.polyline.length / 2)];
          if (mid) {
            ctx.fillStyle = ZONES.label;
            ctx.fillText('BORDER', px(mid[0]) + 4, py(mid[1]) - 4);
          }
        }
      }
      ctx.restore();

      // Sweep.
      const t = (hud?.tMs ?? 0) + runtime.alpha * TICK_MS;
      const sweep = ((t % scanMs) / scanMs) * Math.PI * 2;
      const grad = ctx.createConicGradient(sweep - Math.PI / 2 - 0.6, c, c);
      grad.addColorStop(0, withAlpha(PPI.sweep, 0));
      grad.addColorStop(0.095, withAlpha(PPI.sweep, 0.22));
      grad.addColorStop(0.1, withAlpha(PPI.sweep, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r, sweep - Math.PI / 2 - 0.6, sweep - Math.PI / 2);
      ctx.fill();

      // RF strobes: dashed bearing lines from the RF sensor (no range).
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = RF_STROBE;
      ctx.fillStyle = RF_STROBE;
      const tagged: { x: number; y: number }[] = [];
      for (const s of hud?.rfStrobes ?? []) {
        const sensor = runtime.scenario.sensors.find((x) => x.id === s.sensorId);
        if (!sensor) continue;
        const a = (s.bearingDeg * Math.PI) / 180;
        const sx = c + (sensor.x - origin.x) * pxPerM;
        const sy = c - (sensor.z - origin.z) * pxPerM;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.sin(a) * r, sy - Math.cos(a) * r);
        ctx.stroke();
        // One "RF" tag per bearing cluster: strobes a few degrees apart share it.
        const tx = sx + Math.sin(a) * (r - 18) + 4;
        const ty = sy - Math.cos(a) * (r - 18);
        if (tagged.every((p) => Math.hypot(p.x - tx, p.y - ty) > 16)) {
          ctx.fillText('RF', tx, ty);
          tagged.push({ x: tx, y: ty });
        }
      }
      ctx.setLineDash([]);

      // Blips, then decluttered labels (selected track always labelled).
      const blips = (hud?.tracks ?? [])
        .filter((tr) => tr.status === 'ACTIVE')
        .map((tr) => ({
          tr,
          x: c + (tr.x - origin.x) * pxPerM,
          y: c - (tr.z - origin.z) * pxPerM,
        }));
      for (const { tr, x, y } of blips) {
        const style = AFFILIATION_STYLE[tr.affiliation];
        ctx.fillStyle = style.hex;
        ctx.strokeStyle = style.hex;
        traceAffiliation(ctx, tr.affiliation, x, y, 5);
        if (tr.markedDetected) ctx.fill();
        else ctx.stroke();
        if (tr.headingDeg !== null && tr.speedMps !== null) {
          const a = (tr.headingDeg * Math.PI) / 180;
          const len = 6 + tr.speedMps * 0.8;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len);
          ctx.stroke();
        }
        if (tr.id === hud?.selectedTrackId) {
          ctx.strokeStyle = PPI.selected;
          ctx.strokeRect(x - 8, y - 8, 16, 16);
        }
      }
      const labels = blips.map(({ tr, x, y }) => ({
        id: tr.id,
        x,
        y,
        w: ctx.measureText(`${AFFILIATION_STYLE[tr.affiliation].letter} ${tr.id}`).width,
        h: 11,
        keep: tr.id === hud?.selectedTrackId,
      }));
      const placed = placeLabels(labels, { w: SIZE, h: SIZE }, 8);
      ctx.textBaseline = 'top';
      for (const { tr } of blips) {
        const at = placed.get(tr.id);
        if (!at) continue;
        const style = AFFILIATION_STYLE[tr.affiliation];
        ctx.fillStyle = tr.id === hud?.selectedTrackId ? PPI.selected : style.hex;
        ctx.fillText(`${style.letter} ${tr.id}`, at.x, at.y);
      }
      ctx.textBaseline = 'alphabetic';
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [runtime, maxRangeM, scanMs, origin.x, origin.z]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hud = useHudStore.getState().hud;
    if (!hud) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = SIZE / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    const pxPerM = (SIZE / 2 - 14) / maxRangeM;
    let best: { id: string; d: number } | null = null;
    for (const tr of hud.tracks) {
      if (tr.status !== 'ACTIVE') continue;
      const d = Math.hypot(
        SIZE / 2 + (tr.x - origin.x) * pxPerM - px,
        SIZE / 2 - (tr.z - origin.z) * pxPerM - py,
      );
      if (d < PICK_PX && (!best || d < best.d)) best = { id: tr.id, d };
    }
    if (best) commands.select(best.id);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      className="aspect-square w-full cursor-crosshair"
      aria-label={`Radar PPI, ${maxRangeM / 1000} km range, rings every 1 km. Click a track to select it.`}
    />
  );
}

/** PPI range in km for the panel header. */
export function ppiRangeKm(runtime: SimRuntime): number {
  const radar = runtime.scenario.sensors.find((s) => s.kind === 'RADAR');
  return Math.ceil(((radar?.kind === 'RADAR' ? radar.refRangeM : 3000) * 1.4) / 1000);
}
