import {
  Color,
  ColorManagement,
  Vector2,
  Vector3,
  type Camera,
  type Material,
  type Scene,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import type { AtmosphereLook } from './atmosphere-look';
import { atmosEnabled } from './atmosphere-switch';

// The physical fog chunk (atmosphere step 2, direction §3.2–3.3). It replaces
// three's `fog_fragment` in every wrapped material: Beer–Lambert with
// β = 3.912 / visibility, haze even up to a layer top and thinning above it, the
// true distance to the camera (not view depth), and air that brightens towards
// the sun. One uniforms object is shared by every wrapped material; each view's
// scene writes its own values in `onBeforeRender`, which three calls right
// before that view draws (drei <View> renders each view's scene on its own).
// The fog colour is three's own `fogColor`, which three converts per target
// (sRGB on screen, linear in the EO render target). Maths mirrored in
// atmosphere-look.ts (`transmittance`, `contactTransmittance`) for tests.

/** What a material is: ground (terrain, buildings, trees) or a contact (contrast floor). */
export type AtmosKind = 'ground' | 'contact';

export const ATMOS_UNIFORMS = {
  uAtmosBeta: { value: 0 },
  uAtmosTopY: { value: 0 },
  uAtmosFalloff: { value: 1000 },
  uAtmosSunDir: { value: new Vector3(0, 1, 0) },
  uAtmosSunTint: { value: new Color() },
  uAtmosGlow: { value: 0 },
  uAtmosFloor: { value: 0 },
  uAtmosEdge: { value: new Vector2() },
};

/** Uniforms and helpers; needs `fogColor` declared before it. */
export const ATMOS_PARS_GLSL = /* glsl */ `
uniform float uAtmosBeta;
uniform float uAtmosTopY;
uniform float uAtmosFalloff;
uniform vec3 uAtmosSunDir;
uniform vec3 uAtmosSunTint;
uniform float uAtmosGlow;
uniform float uAtmosFloor;
uniform vec2 uAtmosEdge;
// Mean of exp(-max(y, 0) / H) along a straight path between heights a and b
// (relative to uAtmosTopY): exact for an even layer topped by an exponential.
float atmosMeanDensity(float a, float b, float H) {
  float lo = min(a, b), hi = max(a, b);
  if (hi <= 0.0) return 1.0;
  float span = hi - lo;
  if (span < 1.0) return exp(-max(0.5 * (a + b), 0.0) / H);
  float l0 = max(lo, 0.0);
  float above = H * (exp(-l0 / H) - exp(-hi / H));
  return (max(-lo, 0.0) + above) / span;
}
// Air colour seen along a direction from the camera: fog colour, brighter near the sun (Quilez).
vec3 atmosAir(vec3 dir) {
  float s = uAtmosGlow * pow(max(dot(dir, uAtmosSunDir), 0.0), 8.0);
  return mix(fogColor, uAtmosSunTint, s);
}
`;

const VERTEX_PARS = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vAtmosWorld;
#endif`;

/** World position the way project_vertex builds it (batching and instancing included). */
const VERTEX_BODY = /* glsl */ `
#ifdef USE_FOG
  {
    vec4 aW = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      aW = batchingMatrix * aW;
    #endif
    #ifdef USE_INSTANCING
      aW = instanceMatrix * aW;
    #endif
    vAtmosWorld = (modelMatrix * aW).xyz;
  }
#endif`;

const FRAGMENT_PARS = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vAtmosWorld;
  ${ATMOS_PARS_GLSL}
#endif`;

const FRAGMENT_BODY = /* glsl */ `
#ifdef USE_FOG
  vec3 aD = vAtmosWorld - cameraPosition;
  float aT = length(aD);
  float aMean = atmosMeanDensity(
    cameraPosition.y - uAtmosTopY, vAtmosWorld.y - uAtmosTopY, uAtmosFalloff);
  float aTrans = exp(-uAtmosBeta * aMean * aT);
  #ifdef ATMOS_CONTACT
    float aRangeFrac = aT * uAtmosBeta / 3.912;
    aTrans = max(aTrans, uAtmosFloor * (1.0 - smoothstep(0.9, 1.0, aRangeFrac)));
  #endif
  vec3 aAir = atmosAir(aD / max(aT, 1e-3));
  gl_FragColor.rgb = mix(aAir, gl_FragColor.rgb, aTrans);
  if (uAtmosEdge.y > 0.0) {
    gl_FragColor.rgb = mix(
      gl_FragColor.rgb, aAir, smoothstep(uAtmosEdge.x, uAtmosEdge.y, length(vAtmosWorld.xz)));
  }
#endif`;

type CompiledShader = Parameters<Material['onBeforeCompile']>[0];

/** Put the chunk into a shader being compiled (after any other patches). */
export function patchAtmosphereShader(shader: CompiledShader, kind: AtmosKind): void {
  Object.assign(shader.uniforms, ATMOS_UNIFORMS);
  const define = kind === 'contact' ? '#define ATMOS_CONTACT\n' : '';
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <fog_pars_fragment>',
      `#include <fog_pars_fragment>\n${define}${FRAGMENT_PARS}`,
    )
    .replace('#include <fog_fragment>', FRAGMENT_BODY);
}

/**
 * Give a material the physical fog (once; a no-op with `?atmos=0`). Keeps any
 * onBeforeCompile it already has, and a program cache key of its own so three
 * never reuses a program without the chunk.
 */
export function withAtmosphereFog<M extends Material>(material: M, kind: AtmosKind): M {
  if (!atmosEnabled() || material.userData.atmos) return material;
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    patchAtmosphereShader(shader, kind);
  };
  material.customProgramCacheKey = () => `${prevKey}|atmos:${kind}`;
  material.userData.atmos = kind;
  return material;
}

/**
 * three calls a Scene's onBeforeRender as (renderer, scene, camera, renderTarget)
 * (WebGLRenderer.render), not with the mesh arguments its Object3D type lists.
 */
type SceneHook = (
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  target: WebGLRenderTarget | null,
) => void;

/** Write a view's air into the shared uniforms right before its scene draws. Returns an undo. */
export function bindAtmosphere(scene: Scene, look: AtmosphereLook): () => void {
  const hooked = scene as unknown as { onBeforeRender: SceneHook };
  const prev = hooked.onBeforeRender;
  const u = ATMOS_UNIFORMS;
  hooked.onBeforeRender = (renderer, s, camera, target) => {
    prev.call(scene, renderer, s, camera, target);
    u.uAtmosBeta.value = look.beta;
    u.uAtmosTopY.value = look.topY;
    u.uAtmosFalloff.value = look.falloffM;
    u.uAtmosSunDir.value.set(...look.sunDir);
    u.uAtmosGlow.value = look.glow;
    u.uAtmosFloor.value = look.contactFloor;
    u.uAtmosEdge.value.set(...look.edge);
    // Same colour space three gives fogColor for this target.
    look.sunTint.getRGB(u.uAtmosSunTint.value, outputSpace(renderer, target));
  };
  return () => {
    hooked.onBeforeRender = prev;
  };
}

function outputSpace(renderer: WebGLRenderer, target: WebGLRenderTarget | null): string {
  return target === null ? renderer.outputColorSpace : ColorManagement.workingColorSpace;
}
