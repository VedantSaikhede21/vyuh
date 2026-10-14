'use client';

import { TICK_MS } from '@vyuh/sim-core';
import { useEffect, useRef } from 'react';
import { AFFILIATION_STYLE, traceAffiliation } from '@/lib/affiliation';
import { RF_HEX } from '@/lib/rf';
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

    const draw = () => {
      const hud = useHudStore.getState().hud;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#04110f';
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      // Range rings + labels.
      ctx.strokeStyle = '#1f4a43';
      ctx.fillStyle = '#5f8f86';
      ctx.font = '11px ui-monospace, monospace';
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
      ctx.fillStyle = '#9fd8cf';
      ctx.fillText('N', c - 4, 11);

      // Interceptor range (dashed amber).
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#ffb347';
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

      // Sweep.
      const t = (hud?.tMs ?? 0) + runtime.alpha * TICK_MS;
      const sweep = ((t % scanMs) / scanMs) * Math.PI * 2;
      const grad = ctx.createConicGradient(sweep - Math.PI / 2 - 0.6, c, c);
      grad.addColorStop(0, 'rgba(63,214,192,0)');
      grad.addColorStop(0.095, 'rgba(63,214,192,0.28)');
      grad.addColorStop(0.1, 'rgba(63,214,192,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r, sweep - Math.PI / 2 - 0.6, sweep - Math.PI / 2);
      ctx.fill();

      // RF strobes: dashed bearing lines from the RF sensor (no range).
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = RF_HEX;
      ctx.fillStyle = RF_HEX;
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
        ctx.fillText(s.id, sx + Math.sin(a) * (r - 18) + 4, sy - Math.cos(a) * (r - 18));
      }
      ctx.setLineDash([]);

      // Blips.
      for (const tr of hud?.tracks ?? []) {
        if (tr.status !== 'ACTIVE') continue;
        const style = AFFILIATION_STYLE[tr.affiliation];
        const x = c + (tr.x - origin.x) * pxPerM;
        const y = c - (tr.z - origin.z) * pxPerM;
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
          ctx.strokeStyle = '#ffffff';
          ctx.strokeRect(x - 8, y - 8, 16, 16);
        }
        ctx.fillStyle = style.hex;
        ctx.fillText(`${style.letter} ${tr.id}`, x + 9, y + 4);
      }
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
    <div className="flex flex-col items-center gap-1">
      <canvas
        ref={canvasRef}
        onClick={onClick}
        className="aspect-square w-full max-w-[320px] cursor-crosshair"
        aria-label={`Radar scope, ${maxRangeM / 1000} km range. Click a track to select it.`}
      />
      <p className="hud-label">PPI · {maxRangeM / 1000} km · rings 1 km</p>
    </div>
  );
}
