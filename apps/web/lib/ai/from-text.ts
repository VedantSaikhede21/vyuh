import type { GenerateRequest } from '@vyuh/shared';
import { terrainLabel } from '@/lib/scenario/library';
import { formatBearing } from '@/lib/hud/derive';
import { CLASS_LABEL } from '@/lib/strings';

// Text-to-scenario (SPEC §13.2): wording of the parsed-parameters table.

export const DISABLED_REASON =
  'Text-to-scenario needs the LLM, which is off on this server (LLM_ENABLED=false). Use the Builder form instead.';

const TIME: Record<string, string> = { DAY: 'Day', DUSK: 'Dusk', NIGHT: 'Night' };
const DENSITY: Record<string, string> = { LOW: 'Low', MED: 'Medium', HIGH: 'High' };

/** The parsed parameters as label / value rows; "auto" where the generator decides. */
export function parameterRows(
  r: GenerateRequest,
): { label: string; value: string; unit?: string; auto?: boolean }[] {
  const auto = (v: string | undefined) =>
    v === undefined ? { value: 'Auto', auto: true } : { value: v };
  const mix = r.threatMix
    ? Object.entries(r.threatMix)
        .map(([c, n]) => `${n} × ${CLASS_LABEL[c as keyof typeof CLASS_LABEL] ?? c}`)
        .join(', ')
    : undefined;
  return [
    { label: 'Terrain', value: terrainLabel(r.terrainPreset) },
    { label: 'Difficulty', value: String(r.difficulty), unit: '/ 5' },
    { label: 'Time of day', ...auto(r.timeBand ? TIME[r.timeBand] : undefined) },
    { label: 'Weather', ...auto(r.weatherPreset ? r.weatherPreset.toLowerCase() : undefined) },
    {
      label: 'Swarm',
      ...auto(r.swarmSize === undefined ? undefined : String(r.swarmSize)),
      ...(r.swarmSize === undefined ? {} : { unit: 'drones' }),
    },
    { label: 'Decoys', ...auto(r.decoys === undefined ? undefined : String(r.decoys)) },
    {
      label: 'Main threat axis',
      ...auto(r.approachBearingDeg === undefined ? undefined : formatBearing(r.approachBearingDeg)),
      ...(r.approachBearingDeg === undefined ? {} : { unit: 'from the asset' }),
    },
    { label: 'Single threats', ...auto(mix) },
    {
      label: 'False contacts',
      ...auto(r.falseContactDensity ? DENSITY[r.falseContactDensity] : undefined),
    },
    { label: 'ROE', ...auto(r.roe?.replace('_', ' ').toLowerCase()) },
    {
      label: 'Duration',
      ...auto(r.durationS === undefined ? undefined : String(r.durationS)),
      ...(r.durationS === undefined ? {} : { unit: 's' }),
    },
    {
      label: 'AI-assist accuracy',
      ...auto(
        r.aiAssistAccuracy === undefined ? undefined : String(Math.round(r.aiAssistAccuracy * 100)),
      ),
      ...(r.aiAssistAccuracy === undefined ? {} : { unit: '%' }),
    },
    { label: 'Seed', value: String(r.seed), unit: 'from the text' },
  ];
}
