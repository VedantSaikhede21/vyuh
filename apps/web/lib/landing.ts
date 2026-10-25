import type { KillChainStage } from '@vyuh/shared';
import MEDIA from '@/public/landing/manifest.json';

// Landing page content (DESIGN §11.1, Phase 6C). Every picture is a crop of the
// real simulator recorded by scripts/record-landing.ts; every claim is something
// the demo shows or a measurement already recorded (CLAUDE.md §14).

export type ImageKey = keyof typeof MEDIA.images;

export interface Shot {
  src: ImageKey;
  alt: string;
}

export const imageSize = (k: ImageKey) => MEDIA.images[k];

/** The hero clip's facts, written by the recorder from the scenario file. */
export const HERO = MEDIA.hero;

/**
 * The Respond crop's words come from the Comms lines the recorder saw in it, so
 * caption and picture cannot disagree (decision 148).
 */
export function respondAlt(lines: readonly string[]): string {
  if (lines.length === 0) return 'Comms log of the recorded session';
  return `Comms log: ${lines.join('; ')}`;
}

export interface Stage {
  stage: KillChainStage;
  line: string;
  /** What the server scores at this stage, in words. */
  scored: string;
  shot: Shot;
  /** Where the crop was recorded. */
  from: string;
}

const S14_FROM = 'Recorded from the simulator: S14 Mixed Sky.';

export const CHAIN: readonly Stage[] = [
  {
    stage: 'DETECT',
    line: 'The radar paints new tracks. A bird flock looks much like a small drone at first.',
    scored: 'Time from a threat first appearing on the sensors to you marking it detected.',
    shot: { src: 'chain-detect', alt: 'Radar PPI with a cluster of unknown tracks' },
    from: S14_FROM,
  },
  {
    stage: 'TRACK',
    line: 'Every track with range, bearing, altitude band and any RF link heard on it.',
    scored: 'Kept as the thread of the review: every later stage is judged on the same tracks.',
    shot: { src: 'chain-track', alt: 'Track list with ranges, bearings, altitude bands and RF' },
    from: S14_FROM,
  },
  {
    stage: 'IDENTIFY',
    line: 'Cue the EO/IR camera from the radar. Whether you can identify depends on range and zoom.',
    scored:
      'Exact class, right category or wrong. A wrong guess before the camera could identify is called out.',
    shot: { src: 'chain-identify', alt: 'EO camera view with the tracker gate on a small drone' },
    from: S14_FROM,
  },
  {
    stage: 'DECIDE',
    line: 'ROE and effector state gate each response, and the console says why a control is off.',
    scored: 'Whether the response fits the threat, its control link and the rules of engagement.',
    shot: {
      src: 'chain-decide',
      alt: 'Action bar with intercept unavailable under weapons tight until the track is declared hostile',
    },
    from: S14_FROM,
  },
  {
    stage: 'RESPOND',
    line: 'Jam, spoof or intercept. Every order and its outcome is logged, misses included.',
    scored: 'Neutralised before the asset, engaged too late, or the wrong effector for the link.',
    shot: { src: 'chain-respond', alt: respondAlt(MEDIA.respond.lines) },
    from: S14_FROM,
  },
  {
    stage: 'ASSESS',
    line: 'The server scores the event log against a versioned decision tree when the session ends.',
    scored:
      'Detection, classification, decision and contact report, scaled to 100, with penalties dated.',
    shot: { src: 'chain-assess', alt: 'Score panel with component bars' },
    from: 'Demo data: S01 First Contact played by the scripted defender, scored by the API.',
  },
];

export interface RealismRow {
  condition: string;
  faces: string;
  model: string;
  source: string;
}

export const REALISM: readonly RealismRow[] = [
  {
    condition: 'Terrain and line of sight',
    faces: 'Ridges and buildings hide low drones from radar and camera until they clear them.',
    model: '30 m elevation grid, straight-line masking every 10 m, building footprints',
    source:
      'Copernicus DEM GLO-30 (DLR, Airbus, EU / ESA); OpenStreetMap and Microsoft footprints (ODbL)',
  },
  {
    condition: 'Day, night and thermal',
    faces: 'At night only the thermal camera identifies, and only close enough.',
    model: 'Sun position at the preset; Johnson criteria for detect, recognise, identify',
    source: 'suncalc (Astronomy Answers formulas); J. Johnson, 1958',
  },
  {
    condition: 'Silent links',
    faces: 'A fibre-optic FPV emits nothing: the RF detector stays empty and jamming does nothing.',
    model: 'RF detector hears radio-controlled links only; EW effect by control link',
    source: 'A. Holland Michel, Counter-Drone Systems (2019); public reporting from 2024',
  },
  {
    condition: 'False contacts',
    faces: 'Bird flocks, friendly patrols and civilian drones share the sky with the threat.',
    model: 'Bird radar returns, flocking, micro-Doppler spectrogram templates',
    source: 'V. C. Chen, The Micro-Doppler Effect in Radar (2011); C. W. Reynolds, 1987',
  },
  {
    condition: 'Radar limits',
    faces: 'Ground clutter near the surface, rain loss, tracks that drop and re-form.',
    model:
      'Range from radar cross-section, 3-of-5 confirmation, alpha-beta filter, rain attenuation',
    source: 'M. Skolnik (2001); S. Blackman and R. Popoli (1999); ITU-R P.838',
  },
  {
    condition: 'Rules of engagement',
    faces:
      'An intercept the ROE or a no-kinetic zone forbids is refused, and costs points in Assessment.',
    model: 'Weapons free / tight / hold; zones per scenario; abstract effector rules',
    source: 'Training abstraction by design: no real system data',
  },
];

export const DEPLOY: readonly { fact: string; detail: string }[] = [
  {
    fact: 'Browser only',
    detail:
      'A desktop browser with WebGL; no install and no plug-ins. The simulation runs in the browser; the server stores events and scores.',
  },
  {
    fact: 'Integrated graphics',
    detail:
      'S06 Crowded Skies: 65 fps at 1920×1080 and 113 fps at 1366×768 on AMD Radeon integrated graphics (Ryzen 7 5800H), production build. Budget: 30 fps.',
  },
  {
    fact: 'Small downloads',
    detail:
      'A terrain preset is 0.15 to 4.2 MB and loads only when a scenario uses it. Fonts are served by the app, with no third-party CDN.',
  },
  {
    fact: 'Keyboard first',
    detail: 'Every core action has a shortcut, and the console fits a 1366×768 laptop screen.',
  },
];

/** "30.52 N 75.70 E" */
export const latLon = (lat: number, lon: number): string =>
  `${Math.abs(lat).toFixed(2)} ${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)} ${lon >= 0 ? 'E' : 'W'}`;
