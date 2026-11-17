import type { Page } from '@playwright/test';

// Chrome flags for every measuring or still-taking script (realism plan R0). This
// laptop has an AMD Radeon integrated GPU and an NVIDIA RTX 3050 Laptop GPU; Chrome
// uses the AMD one even when WebGL asks for 'high-performance', so main numbers force
// the NVIDIA (`--force_high_performance_gpu`). GPU=amd drops that flag for the
// second-line AMD number. Uncapped frame rate so costs show above the refresh rate.
export const GPU_ARGS = [
  '--use-angle=d3d11',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--disable-frame-rate-limit',
  '--disable-gpu-vsync',
  ...(process.env.GPU === 'amd' ? [] : ['--force_high_performance_gpu']),
];

/** The unmasked WebGL renderer string: which GPU this run actually drew on. */
export function rendererString(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
}
