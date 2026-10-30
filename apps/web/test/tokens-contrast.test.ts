import { describe, expect, it } from 'vitest';
import { affiliation, interaction, status, surfaces, text } from '@/lib/theme/tokens';

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_SURFACES = ['bg-0', 'bg-1', 'bg-2', 'bg-3'] as const;

describe('token contrast (DESIGN §3, §10)', () => {
  const words: Record<string, string> = {
    'text-1': text['text-1'],
    'text-body': text['text-body'],
    'text-2': text['text-2'],
    ...affiliation,
    ...status,
    data: interaction.data,
  };

  for (const [name, colour] of Object.entries(words)) {
    it(`${name} is at least 4.5:1 on every text surface`, () => {
      for (const surface of TEXT_SURFACES) {
        expect(contrast(colour, surfaces[surface]), surface).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('primary text reads on all three primary fills', () => {
    for (const fill of ['primary-bg', 'primary-hover', 'primary-pressed'] as const) {
      expect(contrast(interaction['primary-fg'], interaction[fill])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the focus ring and chart marks are at least 3:1 on cards', () => {
    expect(contrast(interaction.data, surfaces['bg-1'])).toBeGreaterThanOrEqual(3);
    expect(contrast(interaction.select, surfaces['bg-1'])).toBeGreaterThanOrEqual(3);
  });

  it('text-1 stays readable on the hover surface', () => {
    expect(contrast(text['text-1'], surfaces['bg-4'])).toBeGreaterThanOrEqual(4.5);
  });
});
