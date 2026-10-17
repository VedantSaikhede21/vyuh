// The briefing map draws an expected threat axis only when the briefing's Intel
// section states one (DESIGN §11.4). Briefings are text, so the axis is read
// from the first compass direction in that section, e.g. "from the south-east",
// "in the eastern sector", "out of the setting sun, from the west-south-west".

const POINTS: Record<string, number> = {
  north: 0,
  'north-north-east': 22.5,
  'north-east': 45,
  'east-north-east': 67.5,
  east: 90,
  'east-south-east': 112.5,
  'south-east': 135,
  'south-south-east': 157.5,
  south: 180,
  'south-south-west': 202.5,
  'south-west': 225,
  'west-south-west': 247.5,
  west: 270,
  'west-north-west': 292.5,
  'north-west': 315,
  'north-north-west': 337.5,
};

const ADJECTIVE: Record<string, string> = {
  northern: 'north',
  southern: 'south',
  eastern: 'east',
  western: 'west',
};

/** Phrases that say there is no single axis. */
const NO_AXIS = /no reliable axis|several directions|axes are uncertain|from any direction/i;

const WORD = '(?:north|south|east|west)';
const DIRECTION = new RegExp(
  `\\b(${WORD}(?:-${WORD}){0,2}|northern|southern|eastern|western)\\b`,
  'i',
);

/** Text of the "## Intel" section, or "" if there is none. */
export function intelSection(briefing: string): string {
  const m = /^## Intel\s*$/im.exec(briefing);
  if (!m) return '';
  const rest = briefing.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

/** Bearing (deg) of the first compass direction in the Intel section, or null. */
export function intelAxisDeg(briefing: string): number | null {
  const text = intelSection(briefing);
  if (!text || NO_AXIS.test(text)) return null;
  const m = DIRECTION.exec(text);
  if (!m?.[1]) return null;
  const word = m[1].toLowerCase();
  return POINTS[ADJECTIVE[word] ?? word] ?? null;
}
