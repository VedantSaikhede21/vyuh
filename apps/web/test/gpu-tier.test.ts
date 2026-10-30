import { describe, expect, it } from 'vitest';
import { QUALITY_FEATURES, qualityForRenderer } from '@/lib/gpu-tier';

describe('graphics quality', () => {
  it('reads the renderer string', () => {
    expect(qualityForRenderer('ANGLE (AMD, AMD Radeon(TM) Graphics, D3D11)')).toBe('HIGH');
    expect(qualityForRenderer('ANGLE (NVIDIA, GeForce GTX 1650, D3D11)')).toBe('HIGH');
    expect(qualityForRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620, D3D11)')).toBe('MEDIUM');
    expect(qualityForRenderer('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, D3D11)')).toBe('HIGH');
    expect(qualityForRenderer('Google SwiftShader')).toBe('LOW');
    expect(qualityForRenderer(null)).toBe('LOW');
  });

  it('only Low drops trees and shadows entirely', () => {
    expect(QUALITY_FEATURES.LOW).toEqual({ detail: false, shadowPx: 0, treeViewM: 0 });
    expect(QUALITY_FEATURES.MEDIUM.treeViewM).toBeGreaterThan(0);
  });
});
