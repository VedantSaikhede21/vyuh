import type { ContactClass } from '@vyuh/shared';

// Micro-Doppler (SPEC §6.4): the signature family a radar return carries, set by what
// moves on the target (rotor blades, a propeller, flapping wings). It is sensor data
// like the SNR, so a track carries it; the HUD draws the matching template only when
// the SNR is high enough to resolve it (decision 135).

export type DopplerFamily = 'MULTIROTOR' | 'FIXED_WING' | 'BIRD' | 'HELICOPTER';

export const DOPPLER_FAMILY: Record<ContactClass, DopplerFamily> = {
  QUAD_SMALL: 'MULTIROTOR',
  QUAD_HEAVY: 'MULTIROTOR',
  FPV: 'MULTIROTOR',
  FRIENDLY_QUAD: 'MULTIROTOR',
  CIVILIAN_HOBBY: 'MULTIROTOR',
  FIXED_WING_SMALL: 'FIXED_WING',
  LOITERING_GENERIC: 'FIXED_WING',
  BIRD_SMALL: 'BIRD',
  BIRD_LARGE: 'BIRD',
  HELICOPTER_FRIENDLY: 'HELICOPTER',
};

/** Micro-Doppler lines need a strong return; below this the spectrogram is withheld. */
export const MICRO_DOPPLER_MIN_SNR_DB = 8;
