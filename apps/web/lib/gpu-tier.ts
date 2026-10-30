// What this machine should draw (UI plan §3.8, terrain plan §15). Read once from
// the WebGL renderer string; a per-browser convenience, so failure means the
// safest answer and nothing is stored server-side.

export type GraphicsQuality = 'HIGH' | 'MEDIUM' | 'LOW';
export type GraphicsSetting = 'AUTO' | GraphicsQuality;

/** Quality for a WebGL renderer string, or LOW when there is none. */
export function qualityForRenderer(renderer: string | null): GraphicsQuality {
  if (!renderer) return 'LOW';
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|software|microsoft basic/.test(r)) return 'LOW';
  // Older integrated: UHD 6xx and HD series. Iris Xe and Radeon integrated hold High.
  if (/intel.*(uhd|hd graphics)/.test(r)) return 'MEDIUM';
  return 'HIGH';
}

function readRenderer(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  } catch {
    return null;
  }
}

let probed: GraphicsQuality | null = null;

/** The setting resolved to a quality. */
export function resolveQuality(setting: GraphicsSetting): GraphicsQuality {
  if (setting !== 'AUTO') return setting;
  probed ??= qualityForRenderer(readRenderer());
  return probed;
}

export interface QualityFeatures {
  detail: boolean;
  /** Shadow mask side in texels; 0 = no baked shadows. */
  shadowPx: number;
  /** Tree draw distance in metres; 0 = no trees. */
  treeViewM: number;
}

export const QUALITY_FEATURES: Record<GraphicsQuality, QualityFeatures> = {
  HIGH: { detail: true, shadowPx: 1024, treeViewM: 4200 },
  MEDIUM: { detail: false, shadowPx: 512, treeViewM: 2000 },
  LOW: { detail: false, shadowPx: 0, treeViewM: 0 },
};
