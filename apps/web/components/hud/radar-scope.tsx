'use client';

import { TICK_MS, pointInPolygon } from '@vyuh/sim-core';
import { useEffect, useMemo, useRef } from 'react';
import { AFFILIATION_STYLE, traceAffiliation } from '@/lib/affiliation';
import { PPI, RF_STROBE, ZONES, canvasMonoFont, withAlpha } from '@/lib/theme/scene-colours';
import {
  centroid,
  groupNoKineticZones,
  hoveredZoneIds,
  zonesBox,
  zonesNearTrack,
} from '@/lib/hud/zones';
import { layoutPpiLabels } from '@/lib/hud/declutter';
import { isThreatTrack } from '@/lib/hud/derive';
import type { Commands } from '@/lib/sim/commands';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';

const SIZE = 320;
const PICK_PX = 14;
/** Label box height, px (11 px mono). */
const LABEL_H = 11;

/** Radar PPI (SPEC §15): north-up, range rings every km, rotating sweep, track blips. */
export function RadarScope({ runtime, commands }: { runtime: SimRuntime; commands: Commands }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radar = runtime.scenario.sensors.find((s) => s.kind === 'RADAR');
  const maxRangeM =
    Math.ceil(((radar?.kind === 'RADAR' ? radar.refRangeM : 3000) * 1.4) / 1000) * 1000;
  const scanMs = (radar?.kind === 'RADAR' ? radar.scanPeriodS : 2) * 1000;
  const origin = { x: radar?.x ?? 0, z: radar?.z ?? 0 };
  const { groups, members } = useMemo(() => {
    const g = groupNoKineticZones(runtime.scenario.zones);
    return { groups: g, members: g.flatMap((x) => (x.zones.length > 1 ? x.zones : [])) };
  }, [runtime]);

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

      // Zones: NO_KINETIC hatched + outlined, one label per zone or cluster (a
      // member's id only on hover or near the selected track); borders dashed.
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.font = canvasMonoFont(11);
      const selected = hud?.tracks.find(
        (t) => t.id === hud.selectedTrackId && t.status === 'ACTIVE',
      );
      const near = selected ? zonesNearTrack(members, selected) : null;
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
      // Member ids on demand (hover, near the selected track), over their zone.
      ctx.fillStyle = ZONES.label;
      for (const z of members) {
        if (!hoveredZoneIds.has(z.id) && near?.has(z.id) !== true) continue;
        const [cx, cz] = centroid(z.polygon);
        ctx.fillText(z.id, px(cx) - ctx.measureText(z.id).width / 2, py(cz) + 4);
      }
      ctx.restore();

      // Zone label candidates (placed after the asset and threat labels, below):
      // the usual spot, then the zone's edge away from the asset.
      const asset0 = runtime.scenario.assets[0];
      const ax = asset0 ? px(asset0.x) : c;
      const ay = asset0 ? py(asset0.z) : c;
      const zoneRequests = groups.map((g) => {
        const w = ctx.measureText(g.shortLabel).width;
        const h = LABEL_H;
        const b = zonesBox(g.zones);
        const [l, rt, tp, bt] = [px(b.minX), px(b.maxX), py(b.maxZ), py(b.minZ)];
        const [mx, my] = [(l + rt) / 2, (tp + bt) / 2];
        const usual =
          g.zones.length === 1
            ? (() => {
                const [cx, cz] = centroid(g.zones[0]!.polygon);
                return { x: px(cx) + 6, y: py(cz) - 4 - h, w, h };
              })()
            : { x: mx - w / 2, y: tp - 3 - h, w, h };
        const [dx, dy] = [mx - ax, my - ay];
        const far =
          Math.abs(dx) > Math.abs(dy)
            ? { x: dx > 0 ? rt + 4 : l - 4 - w, y: my - h / 2, w, h }
            : { x: mx - w / 2, y: dy > 0 ? bt + 3 : tp - 3 - h, w, h };
        return {
          key: g.key,
          text: g.shortLabel,
          candidates: [usual, far],
          forced: g.zones.some((z) => hoveredZoneIds.has(z.id)),
        };
      });

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
      // Defended assets: square + name (DESIGN §11.4 map symbol).
      ctx.strokeStyle = PPI.asset;
      ctx.lineWidth = 1.5;
      const assets = runtime.scenario.assets.map((a) => ({
        a,
        x: px(a.x),
        y: py(a.z),
        text: a.name.toUpperCase(),
      }));
      for (const { x, y } of assets) ctx.strokeRect(x - 4, y - 4, 8, 8);
      ctx.lineWidth = 1;

      // Labels by priority: asset, selected and threat tracks always; zone labels
      // yield (far edge or hidden, shown on hover); other tracks when there is room.
      const { symbols: at, zones: zoneAt } = layoutPpiLabels(
        [
          ...assets.map(({ a, x, y, text }) => ({
            id: `asset:${a.id}`,
            x,
            y,
            w: ctx.measureText(text).width,
            h: LABEL_H,
            priority: true,
          })),
          ...blips.map(({ tr, x, y }) => ({
            id: tr.id,
            x,
            y,
            w: ctx.measureText(`${AFFILIATION_STYLE[tr.affiliation].letter} ${tr.id}`).width,
            h: LABEL_H,
            priority: tr.id === hud?.selectedTrackId || isThreatTrack(tr),
          })),
        ],
        zoneRequests,
        { w: SIZE, h: SIZE },
        8,
        (b) =>
          [
            [b.x, b.y],
            [b.x + b.w, b.y],
            [b.x, b.y + b.h],
            [b.x + b.w, b.y + b.h],
          ].every(([x, y]) => Math.hypot(x! - c, y! - c) <= r),
      );
      ctx.textBaseline = 'top';
      ctx.fillStyle = ZONES.label;
      for (const z of zoneRequests) {
        const p = zoneAt.get(z.key);
        if (p) ctx.fillText(z.text, p.x, p.y);
      }
      ctx.fillStyle = PPI.assetLabel;
      for (const { a, text } of assets) {
        const p = at.get(`asset:${a.id}`);
        if (p) ctx.fillText(text, p.x, p.y);
      }
      for (const { tr } of blips) {
        const p = at.get(tr.id);
        if (!p) continue;
        const style = AFFILIATION_STYLE[tr.affiliation];
        ctx.fillStyle = tr.id === hud?.selectedTrackId ? PPI.selected : style.hex;
        ctx.fillText(`${style.letter} ${tr.id}`, p.x, p.y);
      }
      ctx.textBaseline = 'alphabetic';
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [runtime, maxRangeM, scanMs, origin.x, origin.z, groups, members]);

  /** Canvas pixel → scenario metres. */
  const toMetres = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = SIZE / rect.width;
    const pxPerM = (SIZE / 2 - 14) / maxRangeM;
    return {
      x: origin.x + ((e.clientX - rect.left) * scale - SIZE / 2) / pxPerM,
      z: origin.z - ((e.clientY - rect.top) * scale - SIZE / 2) / pxPerM,
    };
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const m = toMetres(e);
    hoveredZoneIds.clear();
    const hit = members.find((z) => pointInPolygon(m.x, m.z, z.polygon));
    if (hit) hoveredZoneIds.add(hit.id);
  };

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
      onMouseMove={onMove}
      onMouseLeave={() => hoveredZoneIds.clear()}
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
