'use client';

import type { Affiliation, ContactClass, Scenario } from '@vyuh/shared';
import { useFrame } from '@react-three/fiber';
import { toThree, type Vec3 } from '@vyuh/sim-core';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { AffiliationSymbol } from '@/components/hud/primitives';
import type { PpiOverlay } from '@/components/hud/radar-scope';
import type { TrackColumn } from '@/components/hud/track-list';
import { useSimRuntime } from '@/components/sim/sim-context';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import { useReplayStore } from '@/lib/replay/store';
import type { SimRuntime } from '@/lib/sim/runtime';
import { CLASS_LABEL } from '@/lib/strings';
import { UI } from '@/lib/theme/scene-colours';

// Ground truth for the AAR ("what was really there", Phase 4a). Only the replay
// of a completed session shows it, behind the G toggle; the live HUD never reads
// truth (decision 108), so these overlays live here, outside the HUD folders.

interface Truth {
  cls: ContactClass;
  affiliation: Affiliation;
}

function truthOf(scenario: Scenario): Map<string, Truth> {
  return new Map(
    scenario.contacts.map((c) => [c.id, { cls: c.class, affiliation: c.affiliation }]),
  );
}

/** PPI: each live contact as an open cross with its id and class, over the tracks. */
export function truthPpiOverlay(rt: SimRuntime): PpiOverlay {
  const truth = truthOf(rt.scenario);
  const p: Vec3 = { x: 0, y: 0, z: 0 };
  return (ctx, px, py) => {
    if (!useReplayStore.getState().truth) return;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    for (const c of rt.sim.getState().contacts) {
      if (c.status !== 'ACTIVE' || !rt.contactPosition(c.id, p)) continue;
      const t = truth.get(c.id);
      if (!t) continue;
      const x = px(p.x);
      const y = py(p.z);
      ctx.strokeStyle = AFFILIATION_STYLE[t.affiliation].hex;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4);
      ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
      // Left of the cross, so it never sits on the track's own label (drawn to the right).
      ctx.fillStyle = UI.text2;
      ctx.textAlign = 'right';
      ctx.fillText(`${c.id} ${AFFILIATION_STYLE[t.affiliation].letter}`, x - 6, y);
    }
    ctx.restore();
  };
}

/** Track list: the class and affiliation of the contact behind each track. */
export function truthColumn(rt: SimRuntime, on: boolean): TrackColumn | undefined {
  if (!on) return undefined;
  const truth = truthOf(rt.scenario);
  return {
    header: 'Truth',
    cell: (trackId) => {
      const contactId = rt.sim.getState().tracks.find((t) => t.id === trackId)?.contactId;
      const t = contactId ? truth.get(contactId) : undefined;
      if (!contactId || !t) return <span className="text-text-3">—</span>;
      return (
        <span
          className="inline-flex max-w-[12rem] items-center gap-1.5"
          title={`${contactId} · ${CLASS_LABEL[t.cls]}`}
          data-testid={`truth-${trackId}`}
        >
          <AffiliationSymbol affiliation={t.affiliation} size={12} />
          <span className="font-mono text-text-2">{contactId}</span>
          <span className="hidden truncate min-[1600px]:inline">{CLASS_LABEL[t.cls]}</span>
        </span>
      );
    },
  };
}

/** Normalised device coordinates of each live contact in the tactical view. */
const truthNdc = new Map<string, { x: number; y: number; on: boolean }>();

/** Inside the tactical scene: projects contact positions for the DOM labels. */
export function TruthAnchors() {
  const rt = useSimRuntime();
  const p = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const v = useRef(new Vector3());
  useEffect(() => () => truthNdc.clear(), []);
  useFrame(({ camera }) => {
    if (!useReplayStore.getState().truth) return;
    for (const c of rt.sim.getState().contacts) {
      if (c.status !== 'ACTIVE' || !rt.contactPosition(c.id, p.current)) {
        truthNdc.set(c.id, { x: 0, y: 0, on: false });
        continue;
      }
      const t = toThree(p.current);
      v.current.set(t.x, t.y, t.z).project(camera);
      const ndc = v.current;
      truthNdc.set(c.id, {
        x: ndc.x,
        y: ndc.y,
        on: ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) <= 1.1 && Math.abs(ndc.y) <= 1.1,
      });
    }
  });
  return null;
}

/** Over the tactical view: one label per live contact, placed every frame (plain DOM). */
export function TruthLabels({ runtime }: { runtime: SimRuntime }) {
  const layer = useRef<HTMLDivElement>(null);
  const truth = useReplayStore((s) => s.truth);
  const contacts = runtime.scenario.contacts;
  useEffect(() => {
    if (!truth) return;
    let raf = 0;
    const place = () => {
      const el = layer.current;
      if (el) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        for (const child of Array.from(el.children) as HTMLElement[]) {
          const at = truthNdc.get(child.dataset.contact ?? '');
          if (!at?.on) {
            child.style.visibility = 'hidden';
            continue;
          }
          child.style.visibility = 'visible';
          child.style.transform = `translate(-50%, 10px) translate(${((at.x + 1) / 2) * w}px, ${((1 - at.y) / 2) * h}px)`;
        }
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [truth]);
  if (!truth) return null;
  return (
    <div
      ref={layer}
      className="pointer-events-none absolute inset-0 z-[6] overflow-hidden"
      data-testid="truth-labels"
    >
      {contacts.map((c) => (
        <span
          key={c.id}
          data-contact={c.id}
          className="invisible absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap rounded-sm border border-dashed border-line-2 bg-bg-0 px-1 text-small text-text-2"
        >
          <AffiliationSymbol affiliation={c.affiliation} size={12} />
          <span className="font-mono">{c.id}</span>
          {CLASS_LABEL[c.class]}
        </span>
      ))}
    </div>
  );
}
