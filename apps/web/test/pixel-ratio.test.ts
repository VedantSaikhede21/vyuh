import { describe, expect, it } from 'vitest';
import { MAX_PIXEL_RATIO, pixelRatioLevels, startPixelRatio } from '@/lib/sim/pixel-ratio';

describe('pixel ratio levels', () => {
  it('caps at 1.25 on high-density and scaled displays', () => {
    expect(pixelRatioLevels(2)).toEqual([0.85, 1, 1.25]);
    expect(pixelRatioLevels(1.5)).toEqual([0.85, 1, 1.25]);
    expect(pixelRatioLevels(1.25)).toEqual([0.85, 1, 1.25]);
    expect(startPixelRatio(1.5)).toBe(MAX_PIXEL_RATIO);
  });

  it('never renders above the device ratio', () => {
    expect(pixelRatioLevels(1)).toEqual([0.85, 1]);
    expect(startPixelRatio(1)).toBe(1);
    expect(pixelRatioLevels(0.9)).toEqual([0.85, 0.9]);
  });

  it('treats a missing ratio as 1', () => {
    expect(startPixelRatio(0)).toBe(1);
  });
});
