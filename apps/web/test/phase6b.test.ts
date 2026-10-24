import { describe, expect, it } from 'vitest';
import { nextStep } from '@/lib/hud/next-step';
import type { TrackView } from '@/lib/sim/store';
import { formatRating, primaryAction } from '@/lib/result-actions';
import { displayScore } from '@/lib/score-display';

describe('result-screen primary action (audit P0-3)', () => {
  it('retries under 50, pushes nothing from 50 to 79, next from 80', () => {
    expect(primaryAction(0)).toBe('retry');
    expect(primaryAction(49)).toBe('retry');
    expect(primaryAction(50)).toBeNull();
    expect(primaryAction(79)).toBeNull();
    expect(primaryAction(80)).toBe('next');
    expect(primaryAction(100)).toBe('next');
  });

  it('formats a rating with a thousands separator', () => {
    expect(formatRating(1024)).toBe('1,024');
    expect(formatRating(987)).toBe('987');
  });
});

describe('score display (decision 149)', () => {
  const components = {
    detection: 12.25,
    classification: 25,
    decision: 25.5,
    report: 0,
    efficiency: 0,
  };
  const base = {
    total: 62.5,
    components,
    componentMax: { detection: 25, classification: 25, decision: 30, report: 20, efficiency: 0 },
    penalties: [],
    perContact: [],
    metrics: {},
    treeVersion: 'default_v4',
  };

  it('shows the API display values, never a client rounding', () => {
    const display = { total: 63, components: { ...components, detection: 12.3, decision: 25.5 } };
    expect(displayScore({ ...base, display }).total).toBe(63);
    expect(displayScore({ ...base, display }).components.detection).toBe(12.3);
  });
});

describe('Practice next step (audit P0-5)', () => {
  const track = (over: Partial<TrackView> = {}): TrackView => ({
    id: 'T001',
    sensorId: 'r1',
    status: 'ACTIVE',
    rangeM: 1000,
    bearingDeg: 0,
    altitudeAglM: 60,
    headingDeg: 180,
    speedMps: 10,
    x: 0,
    z: 1000,
    createdTMs: 0,
    markedDetected: false,
    classifiedAs: null,
    affiliation: 'UNKNOWN',
    rf: null,
    snrDb: 10,
    doppler: 'MULTIROTOR',
    ai: null,
    ...over,
  });
  const base = {
    selectedTrackId: 'T001' as string | null,
    eo: { lockTrackId: 'T001' as string | null, trackMode: 'TRACK' as const },
    responded: new Set<string>(),
    reported: new Set<string>(),
  };
  const text = (over: Partial<Parameters<typeof nextStep>[0]>, t: TrackView[] = [track()]) =>
    nextStep({ ...base, tracks: t, ...over })?.text;

  it('walks the kill chain in order for the selected track', () => {
    expect(text({ selectedTrackId: null })).toBe('Select a track');
    expect(text({}, [])).toBe('Watch the radar for new tracks');
    expect(text({})).toBe('Mark T001 detected');
    expect(
      text({ eo: { lockTrackId: null, trackMode: 'MANUAL' } }, [track({ markedDetected: true })]),
    ).toBe('Cue the camera to it');
    expect(
      text({ eo: { lockTrackId: 'T001', trackMode: 'CUE' } }, [track({ markedDetected: true })]),
    ).toMatch(/^Zoom in/);
    expect(text({}, [track({ markedDetected: true })])).toBe('Classify what the camera shows');
    const known = { markedDetected: true, classifiedAs: 'QUAD_SMALL' as const };
    expect(text({}, [track(known)])).toBe('Set its affiliation');
    expect(text({}, [track({ ...known, affiliation: 'HOSTILE' })])).toMatch(/^Respond/);
    expect(text({}, [track({ ...known, affiliation: 'NEUTRAL' })])).toBe('Monitor it');
    const done = { responded: new Set(['T001']) };
    expect(text(done, [track({ ...known, affiliation: 'HOSTILE' })])).toBe('Send a contact report');
    expect(text(done, [track({ ...known, affiliation: 'NEUTRAL' })])).toBe(
      'Watch the radar for new tracks',
    );
  });

  it('points at the next open track once this one is handled', () => {
    const known = {
      markedDetected: true,
      classifiedAs: 'BIRD_LARGE' as const,
      affiliation: 'NEUTRAL' as const,
    };
    expect(text({ responded: new Set(['T001']) }, [track(known), track({ id: 'T002' })])).toBe(
      'Select the next track',
    );
  });

  it('ignores lost tracks', () => {
    expect(text({}, [track({ status: 'LOST' })])).toBe('Watch the radar for new tracks');
  });
});
