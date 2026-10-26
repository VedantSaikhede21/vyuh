'use client';

import type { GenerateRequest, TimeBand, UserRole, WeatherPreset } from '@vyuh/shared';
import { Shuffle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Panel, PanelBody, PanelHeader, Tooltip } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError, api } from '@/lib/api';
import { isStaff } from '@/lib/nav';
import { terrainLabel } from '@/lib/scenario/library';

// "Generate scenario" panel (DESIGN §11.3, plan Step 11): terrain, time, weather,
// difficulty and seed → POST /scenarios/generate → the new scenario's briefing.

/** File presets the generator can use (PROCEDURAL_HILLS is built in, not generatable). */
export const GENERATOR_PRESETS = ['PUNJAB_PLAINS', 'JK_MOUNTAIN', 'URBAN_GENERIC'] as const;
const TIMES: { value: TimeBand | ''; label: string }[] = [
  { value: '', label: 'Auto' },
  { value: 'DAY', label: 'Day' },
  { value: 'DUSK', label: 'Dusk' },
  { value: 'NIGHT', label: 'Night' },
];
const WEATHERS: { value: WeatherPreset | ''; label: string }[] = [
  { value: '', label: 'Auto' },
  { value: 'CLEAR', label: 'Clear' },
  { value: 'HAZE', label: 'Haze' },
  { value: 'FOG', label: 'Fog' },
  { value: 'RAIN', label: 'Rain' },
];
const WEATHER_LOCKED = 'Set by difficulty. Instructors can choose weather.';
const SEED_MAX = 2 ** 32 - 1;

const randomSeed = () => Math.floor(Math.random() * SEED_MAX);

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'limited'; untilMs: number };

const FIELD = 'space-y-1';

export function GeneratePanel({ role }: { role: UserRole }) {
  const router = useRouter();
  const staff = isStaff(role);
  const [preset, setPreset] = useState<string>(GENERATOR_PRESETS[0]);
  const [time, setTime] = useState<TimeBand | ''>('');
  const [weather, setWeather] = useState<WeatherPreset | ''>('');
  const [difficulty, setDifficulty] = useState(3);
  const [seed, setSeed] = useState(() => String(randomSeed()));
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [now, setNow] = useState(() => Date.now());

  // Countdown while rate-limited.
  useEffect(() => {
    if (status.kind !== 'limited') return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= status.untilMs) setStatus({ kind: 'idle' });
    }, 250);
    return () => clearInterval(t);
  }, [status]);

  const seedNum = Number(seed);
  const seedOk =
    seed.trim() !== '' && Number.isInteger(seedNum) && seedNum >= 0 && seedNum <= SEED_MAX;
  const waitS =
    status.kind === 'limited' ? Math.max(1, Math.ceil((status.untilMs - now) / 1000)) : 0;
  const disabledReason =
    status.kind === 'loading'
      ? 'Generating…'
      : status.kind === 'limited'
        ? `Rate limit: try again in ${waitS} s`
        : !seedOk
          ? 'Seed must be a whole number from 0 to 4294967295'
          : null;

  const generate = async () => {
    if (disabledReason) return;
    setStatus({ kind: 'loading' });
    const body: GenerateRequest = { terrainPreset: preset, difficulty, seed: seedNum };
    if (time) body.timeBand = time;
    if (staff && weather) body.weatherPreset = weather;
    try {
      const { scenarioId } = await api.generateScenario(body);
      router.push(`/train/scenario/${scenarioId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        const s = Number(err.details.retryAfterS ?? 60);
        setNow(Date.now());
        setStatus({ kind: 'limited', untilMs: Date.now() + s * 1000 });
      } else {
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' });
      }
    }
  };

  const weatherSelect = (
    <Select
      id="gen-weather"
      value={staff ? weather : ''}
      onChange={(e) => setWeather(e.target.value as WeatherPreset | '')}
      disabled={!staff}
      aria-describedby={staff ? undefined : 'gen-weather-hint'}
    >
      {WEATHERS.map((w) => (
        <option key={w.value} value={w.value}>
          {w.label}
        </option>
      ))}
    </Select>
  );

  return (
    <Panel data-testid="generate-panel">
      <PanelHeader title="Generate scenario" />
      <PanelBody className="space-y-3">
        <div className={FIELD}>
          <label className="text-label" htmlFor="gen-terrain">
            Terrain
          </label>
          <Select id="gen-terrain" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {GENERATOR_PRESETS.map((p) => (
              <option key={p} value={p}>
                {terrainLabel(p)}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className={FIELD}>
            <label className="text-label" htmlFor="gen-difficulty">
              Difficulty
            </label>
            <Select
              id="gen-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <div className={FIELD}>
            <label className="text-label" htmlFor="gen-time">
              Time
            </label>
            <Select
              id="gen-time"
              value={time}
              onChange={(e) => setTime(e.target.value as TimeBand | '')}
            >
              {TIMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className={FIELD}>
          <label className="text-label" htmlFor="gen-weather">
            Weather
          </label>
          {staff ? (
            weatherSelect
          ) : (
            <Tooltip content={WEATHER_LOCKED} side="bottom" className="flex w-full">
              <div className="w-full">{weatherSelect}</div>
            </Tooltip>
          )}
          {!staff && (
            <p id="gen-weather-hint" className="text-small text-text-2">
              {WEATHER_LOCKED}
            </p>
          )}
        </div>
        <div className={FIELD}>
          <label className="text-label" htmlFor="gen-seed">
            Seed
          </label>
          <div className="flex gap-2">
            <Input
              id="gen-seed"
              inputMode="numeric"
              className="font-mono"
              value={seed}
              aria-invalid={!seedOk}
              onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))}
            />
            <Tooltip content="Random seed">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSeed(String(randomSeed()))}
                aria-label="Random seed"
                data-testid="gen-random"
              >
                <Shuffle size={16} strokeWidth={1.5} aria-hidden />
              </Button>
            </Tooltip>
          </div>
          <p className="text-small text-text-2">
            The same settings and seed give the same scenario.
          </p>
        </div>
        {status.kind === 'error' && (
          <div className="space-y-2" role="alert">
            <p className="text-small text-crit">Could not generate: {status.message}.</p>
            <Button size="sm" variant="secondary" onClick={() => void generate()}>
              Retry
            </Button>
          </div>
        )}
        <Tooltip
          content={disabledReason ?? 'Opens the briefing; nothing starts yet'}
          side="bottom"
          className="flex w-full"
        >
          {/* Secondary: choosing a scenario from the list is the page's main act (audit P2-2). */}
          <Button
            variant="secondary"
            className="w-full"
            disabled={disabledReason !== null}
            onClick={() => void generate()}
            data-testid="gen-submit"
          >
            {status.kind === 'loading'
              ? 'Generating scenario…'
              : status.kind === 'limited'
                ? `Rate limited · ${waitS} s`
                : 'Generate and preview'}
          </Button>
        </Tooltip>
      </PanelBody>
    </Panel>
  );
}
