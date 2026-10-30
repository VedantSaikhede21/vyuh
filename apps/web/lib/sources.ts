// Realism sources for the public Sources page (Phase 6C, audit P1-19): the same
// facts as docs/realism-sources.md, which stays canonical, set as ruled tables for
// a reader who is not a developer. Every row's `cite` must appear verbatim in the
// document (test/phase6c.test.ts), so the table cannot cite what the file does not.

export interface SourceRow {
  what: string;
  model: string;
  source: string;
  licence: string;
  /** Text that must appear in docs/realism-sources.md. */
  cite: string;
}

export interface SourceTopic {
  topic: string;
  rows: readonly SourceRow[];
}

const NONE = 'Citation';

export const SOURCE_TOPICS: readonly SourceTopic[] = [
  {
    topic: 'Terrain and buildings',
    rows: [
      {
        what: 'Elevation of each terrain preset',
        model: '30 m digital elevation model, resampled to a 14 km local grid',
        source: 'Copernicus DEM GLO-30 (DLR, Airbus Defence and Space; EU and ESA)',
        licence: 'Copernicus DEM licence, attribution',
        cite: 'Copernicus DEM GLO-30',
      },
      {
        what: 'Ground colour of each terrain preset',
        model:
          'Our own median composite of cloud-masked Sentinel-2 L2A scenes, one season per preset. Display only; representative, not current imagery',
        source: 'Copernicus Sentinel-2 (ESA), via the Earth Search STAC catalogue',
        licence: 'Copernicus Sentinel data terms, attribution',
        cite: 'Contains modified Copernicus Sentinel data',
      },
      {
        what: 'Building footprints',
        model: 'Footprints with heights from tags, else two storeys',
        source: 'OpenStreetMap contributors',
        licence: 'ODbL 1.0',
        cite: 'Open Database License (ODbL) 1.0',
      },
      {
        what: 'Building footprints (dense areas)',
        model: 'Machine-learned footprints, merged and simplified',
        source: 'Microsoft Global ML Building Footprints',
        licence: 'ODbL 1.0',
        cite: 'Microsoft Global ML Building Footprints',
      },
      {
        what: 'Line of sight',
        model: 'Straight line sampled every 10 m against terrain and roofs',
        source: 'Standard terrain masking (GIS viewshed)',
        licence: NONE,
        cite: 'viewshed analysis',
      },
    ],
  },
  {
    topic: 'Sun, night and weather',
    rows: [
      {
        what: 'Sun position and day or night',
        model: 'Sun computed at the preset; night below −6°',
        source: 'suncalc 1.9.0 (Astronomy Answers formulas); civil twilight',
        licence: 'BSD-2-Clause',
        cite: 'suncalc 1.9.0',
      },
      {
        what: 'Generator time of day',
        model: 'Time bands from solar elevation',
        source: 'NOAA Solar Calculator equations',
        licence: NONE,
        cite: 'NOAA Solar Calculator',
      },
      {
        what: 'Rain on radar',
        model: 'X-band specific attenuation, two-way path loss',
        source: 'ITU-R Recommendation P.838',
        licence: NONE,
        cite: 'P.838',
      },
      {
        what: 'Seasons and visibility',
        model: 'Fog in winter, monsoon rain, haze',
        source: 'India Meteorological Department climate summaries',
        licence: NONE,
        cite: 'India Meteorological Department',
      },
    ],
  },
  {
    topic: 'Sensors',
    rows: [
      {
        what: 'Radar detection range',
        model: 'Range grows with the fourth root of radar cross-section',
        source: 'M. I. Skolnik, Introduction to Radar Systems (2001)',
        licence: NONE,
        cite: 'Skolnik',
      },
      {
        what: 'Track confirmation and filter',
        model: '3 hits in 5 scans; alpha-beta filter between scans',
        source: 'S. Blackman and R. Popoli (1999); P. R. Kalata (1984)',
        licence: NONE,
        cite: 'Blackman and R. Popoli',
      },
      {
        what: 'Camera identification',
        model: 'Pixels on target against detect / recognise / identify thresholds',
        source: 'J. Johnson (1958); G. C. Holst',
        licence: NONE,
        cite: 'Johnson criteria',
      },
      {
        what: 'Camera tracking and RF detection',
        model: 'Slew-to-cue video tracker; passive RF bearings, silent links unheard',
        source: 'A. Holland Michel, Counter-Drone Systems (2019)',
        licence: NONE,
        cite: 'Holland Michel',
      },
      {
        what: 'Micro-Doppler spectrogram',
        model: 'Rotor blade flashes and wingbeat, short-time Fourier transform',
        source: 'V. C. Chen, The Micro-Doppler Effect in Radar (2011)',
        licence: NONE,
        cite: 'The Micro-Doppler Effect in Radar',
      },
      {
        what: 'AI assist over-trust',
        model: 'Pre-set suggestions, sometimes wrong; trust measured, not scored',
        source: 'R. Parasuraman and V. Riley, Human Factors (1997)',
        licence: NONE,
        cite: 'Parasuraman',
      },
    ],
  },
  {
    topic: 'Threats, effectors and behaviours',
    rows: [
      {
        what: 'Drone size, radar return and speed',
        model: 'Representative figures per class',
        source: 'Public consumer-drone specifications; textbook physics',
        licence: NONE,
        cite: 'public spec sheets',
      },
      {
        what: 'Jamming and spoofing',
        model: 'Effect by control link; abstract probabilities',
        source: 'A. J. Kerns et al., Journal of Field Robotics (2014)',
        licence: NONE,
        cite: 'Kerns',
      },
      {
        what: 'Bird flocks',
        model: 'Boids flocking around a leader',
        source: 'C. W. Reynolds, SIGGRAPH (1987)',
        licence: NONE,
        cite: 'Reynolds',
      },
      {
        what: 'Fibre-optic FPV',
        model: 'Emits nothing; cannot be jammed',
        source: 'Public reporting from 2024',
        licence: NONE,
        cite: 'fibre-optic cable',
      },
      {
        what: 'Affiliation symbols',
        model: 'Simplified frames with letters H, F, N, U',
        source: 'NATO APP-6(D); MIL-STD-2525D',
        licence: NONE,
        cite: 'APP-6',
      },
    ],
  },
  {
    topic: 'Software and type',
    rows: [
      {
        what: 'Typeface',
        model: 'IBM Plex Sans, Sans Condensed and Mono, self-hosted',
        source: 'IBM',
        licence: 'SIL Open Font License 1.1',
        cite: 'SIL Open Font License 1.1',
      },
      {
        what: '3D rendering',
        model: 'three.js, React Three Fiber, drei',
        source: 'three.js authors; pmndrs',
        licence: 'MIT',
        cite: 'Rendering libraries',
      },
    ],
  },
];
