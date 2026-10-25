import { CLASS_PROFILES, ThreatClass, type ContactClass, type ControlLink } from '@vyuh/shared';
import { CLASS_LABEL, CLASS_MENU } from '@/lib/strings';

// Threat recognition library (Phase 6C, UI-PREP §2). Numbers come from CLASS_PROFILES
// (packages/shared), so they stay in sync with the sim; the words below are the
// training notes. All values are representative, not product specifications.

export type LibraryGroup = 'THREAT' | 'NON_THREAT' | 'FRIENDLY';

export const GROUP_LABEL: Record<LibraryGroup, string> = {
  THREAT: 'Threat',
  NON_THREAT: 'Non-threat',
  FRIENDLY: 'Friendly',
};

export const LINK_LABEL: Record<ControlLink, string> = {
  RF_MANUAL: 'RF remote control',
  AUTONOMOUS_GNSS: 'GNSS autonomous (pre-programmed)',
  FIBRE_OPTIC: 'Fibre-optic cable',
  NONE: 'No control link',
};

interface Notes {
  group: LibraryGroup;
  /** One line: what it is and why it matters here. */
  summary: string;
  /** What the RF detector hears from it. */
  rf: string;
  /** What separates it from look-alikes on radar, camera and RF. */
  cues: readonly string[];
}

const NOTES: Record<ContactClass, Notes> = {
  QUAD_SMALL: {
    group: 'THREAT',
    summary: 'Consumer-size quadcopter. Used for reconnaissance and small payload drops.',
    rf: 'Usually heard on 2.4 or 5.8 GHz while flown by hand; silent when it flies a pre-programmed route.',
    cues: [
      'Steady track that can hover or stop; birds rarely hold still.',
      'Spectrogram shows fast blade flashes, not a slow wingbeat.',
      'On camera: compact body with four arms; no wing flap.',
    ],
  },
  QUAD_HEAVY: {
    group: 'THREAT',
    summary: 'Large multirotor able to lift a heavier payload. Slower, larger radar return.',
    rf: 'Heard on the common bands when remotely flown; GNSS-autonomous runs are silent.',
    cues: [
      'Bigger and slower than a small quad; climbs and turns gently.',
      'Looks like the friendly patrol quad: check the friendly ID broadcast before engaging.',
      'Camera identifies it at a longer range than a small quad.',
    ],
  },
  FPV: {
    group: 'THREAT',
    summary: 'Fast, agile first-person-view drone, often flown straight into the target.',
    rf: 'A radio-controlled FPV is heard on video and control bands. A fibre-optic FPV emits nothing and cannot be jammed.',
    cues: [
      'Very fast closing track that changes heading sharply.',
      'Tiny radar return; can be lost in ground clutter when flown low.',
      'No RF on a radar track that closes fast: think fibre-optic, intercept it.',
    ],
  },
  FIXED_WING_SMALL: {
    group: 'THREAT',
    summary: 'Small fixed-wing drone. Long endurance; used for reconnaissance.',
    rf: 'Often flies GNSS-autonomous (silent); some are flown by RF remote control.',
    cues: [
      'Cannot hover: always moving, wide turns.',
      'Steadier than a large bird and keeps a constant height.',
      'Single propeller line in the spectrogram.',
    ],
  },
  LOITERING_GENERIC: {
    group: 'THREAT',
    summary: 'Loitering munition: circles, then dives on the target. The fastest threat here.',
    rf: 'Flies GNSS-autonomous: silent to the RF detector, cannot be jammed; GNSS spoofing can work.',
    cues: [
      'Fast, high track that orbits and then dives.',
      'Larger than a small fixed-wing, much faster.',
      'Silent on RF: spoof it or intercept it, do not jam it.',
    ],
  },
  BIRD_SMALL: {
    group: 'NON_THREAT',
    summary: 'Small bird, often in flocks. The commonest false radar track.',
    rf: 'Nothing: birds have no link.',
    cues: [
      'Flocks move as a loose group and change shape.',
      'Spectrogram shows a slow wingbeat ripple, not blade flashes.',
      'Never order EW on a bird: it has no link to jam.',
    ],
  },
  BIRD_LARGE: {
    group: 'NON_THREAT',
    summary: 'Large bird (raptor, crow-size and up). Radar return like a small drone.',
    rf: 'Nothing: birds have no link.',
    cues: [
      'Soars and circles; speed and height change with the wind.',
      'Wingbeat ripple in the spectrogram; flapping on camera.',
      'The AI assist can mistake it for a small quad: confirm on camera.',
    ],
  },
  FRIENDLY_QUAD: {
    group: 'FRIENDLY',
    summary: 'Own patrol quadcopter. Engaging it is fratricide.',
    rf: 'Heard on RF; may broadcast a friendly ID (not always at higher difficulty).',
    cues: [
      'Check the friendly ID before any response.',
      'Flies a patrol pattern, not an approach on the asset.',
      'Looks like a heavy multirotor on camera.',
    ],
  },
  CIVILIAN_HOBBY: {
    group: 'NON_THREAT',
    summary: 'Civilian hobby drone. Not hostile; jamming near it can still hit it.',
    rf: 'Heard on 2.4 or 5.8 GHz like a threat quad.',
    cues: [
      'Wanders or hovers near villages and fields; does not close on the asset.',
      'Same airframe as a small quad: behaviour decides, not looks.',
      'Keep it out of a jam sector: collateral jamming costs points.',
    ],
  },
  HELICOPTER_FRIENDLY: {
    group: 'FRIENDLY',
    summary: 'Own manned helicopter. Large, fast, unmistakable on radar.',
    rf: 'Not modelled on the RF detector.',
    cues: [
      'Much larger radar return than any drone.',
      'Rotor flashes in the spectrogram are slow and strong.',
      'Never engage: a manned friendly aircraft.',
    ],
  },
};

export interface LibraryEntry extends Notes {
  cls: ContactClass;
  name: string;
  isThreat: boolean;
  sizeM: number;
  rcsM2: number;
  maxSpeedMps: number;
  links: readonly ControlLink[];
  confusedWith: readonly ContactClass[];
}

const THREATS: ReadonlySet<string> = new Set(ThreatClass.options);

/** One entry per class, in the classify-menu order (1–9, 0). */
export const LIBRARY: readonly LibraryEntry[] = CLASS_MENU.map(({ cls }) => {
  const p = CLASS_PROFILES[cls];
  return {
    cls,
    name: CLASS_LABEL[cls],
    isThreat: THREATS.has(cls),
    sizeM: p.sizeM,
    rcsM2: p.rcsM2,
    maxSpeedMps: p.maxSpeedMps,
    links: p.typicalLinks,
    confusedWith: p.confusedWith,
    ...NOTES[cls],
  };
});

export const libraryEntry = (cls: ContactClass): LibraryEntry =>
  LIBRARY.find((e) => e.cls === cls)!;

export const isContactClass = (v: string): v is ContactClass => v in CLASS_PROFILES;

export function filterLibrary(group: LibraryGroup | 'ALL'): LibraryEntry[] {
  return LIBRARY.filter((e) => group === 'ALL' || e.group === group);
}

/** RCS in m², two significant figures: 0.005, 0.02, 5. */
export const formatRcs = (m2: number): string => String(Number(m2.toPrecision(2)));
