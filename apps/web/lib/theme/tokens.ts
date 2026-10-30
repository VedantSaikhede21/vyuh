// The only place design colours and sizes live (DESIGN §3, decision 164).
// `pnpm --filter @vyuh/web gen:tokens` writes app/tokens.generated.css from this
// file; lib/theme/scene-colours.ts imports it for WebGL and canvas. CI checks the
// generated file is current; test/tokens-contrast.test.ts checks the contrast.

export const surfaces = {
  'bg-0': '#050607',
  'bg-1': '#0d0f11',
  'bg-2': '#15181b',
  'bg-3': '#1e2226',
  'bg-4': '#282d32',
  'line-1': '#22272c',
  'line-2': '#30363c',
} as const;

export const text = {
  'text-1': '#f2f4f5',
  'text-body': '#c8cdd2',
  'text-2': '#959ca4',
  // Non-text only: borders, inactive marks. Fails 4.5:1 for words.
  'text-3': '#5d646b',
} as const;

export const interaction = {
  'primary-bg': '#f2f4f5',
  'primary-hover': '#ffffff',
  'primary-pressed': '#dadde0',
  'primary-fg': '#050607',
  data: '#4fd1c5',
  'data-strong': '#7fe3d9',
  select: '#f2f5f3',
  cue: '#d46bc8',
} as const;

// Always paired with shape + letter.
export const affiliation = {
  'aff-hostile': '#ff6b6b',
  'aff-friendly': '#5cc8ff',
  'aff-neutral': '#6fd08c',
  'aff-unknown': '#f2d45c',
} as const;

export const status = {
  ok: '#6fd08c',
  warn: '#f0a94b',
  crit: '#ff5a5f',
  info: '#959ca4',
} as const;

// Alpha values, so they stay outside the contrast pairs.
export const translucent = {
  'data-weak': 'rgba(79, 209, 197, 0.2)',
  'edge-float': 'rgba(255, 255, 255, 0.06)',
  'edge-overlay': 'rgba(255, 255, 255, 0.08)',
  'scrim-1': 'rgba(5, 6, 7, 0.55)',
  'scrim-2': 'rgba(5, 6, 7, 0.78)',
  'shadow-float': '0 16px 40px rgba(0, 0, 0, 0.55)',
  'shadow-overlay': '0 24px 64px rgba(0, 0, 0, 0.6)',
} as const;

export const motion = {
  'dur-micro': '120ms',
  'dur-small': '180ms',
  'dur-medium': '240ms',
  'dur-large': '480ms',
  'dur-camera': '1200ms',
  'ease-ui': 'cubic-bezier(0.2, 0, 0, 1)',
  'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

/** Everything written to :root, in file order. */
export const TOKEN_GROUPS = {
  surfaces,
  text,
  interaction,
  affiliation,
  status,
  translucent,
  motion,
} as const;
