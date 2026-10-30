import { Color, MeshLambertMaterial, Texture, type IUniform } from 'three';
import type { TerrainTextures } from './display';

// Terrain look (terrain plan T1–T3): Lambert plus satellite colour, baked sky
// view, per-pixel normals, tiling detail near the camera, a baked sun-shadow
// mask and height haze. Everything is sampled by world position, so the LOD
// tiles need no UVs. Display only: nothing here reaches the sim.

/** Tile sizes of the detail noise, metres. Two scales hide the repeat. */
const DETAIL_NEAR_M = 9;
const DETAIL_FAR_M = 41;
/** Detail fades to the plain macro colour between these distances (÷ zoom). */
const DETAIL_FADE_NEAR_M = 500;
const DETAIL_FADE_FAR_M = 3000;
/** Normal-matrix FOV term at 50° vertical: the zoom reference for the fade. */
const REF_PROJECTION = 2.14;
const HAZE_SCALE_M = 900;

export interface TerrainMaterialOptions {
  textures: TerrainTextures;
  sizeM: number;
  /** World height of the lowest ground: haze sits on the valley floor. */
  floorM: number;
  /** Tactical view: fade to the horizon near the map edge. */
  edgeFade: boolean;
  /** Fraction of the half-size at which the edge fade starts and ends. */
  fadeRange: readonly [number, number];
  /** Tiling detail near the camera (High quality). */
  detail: boolean;
}

export interface TerrainUniforms {
  uBlend: IUniform<number>;
  uShadow: IUniform<Texture | null>;
  uShadowOn: IUniform<number>;
  uHorizon: IUniform<Color>;
}

/** Shared by both views' material programs; values are per material. */
function fragmentHead(): string {
  return `
  uniform sampler2D uNormalMap;
  uniform sampler2D uAoMap;
  uniform sampler2D uAlbedoMap;
  uniform sampler2D uDetailMap;
  uniform sampler2D uShadowMap;
  uniform float uSize;
  uniform float uBlend;
  uniform float uShadowOn;
  uniform float uFloor;
  uniform float uFadeEnd;
  uniform float uFadeStart;
  uniform vec3 uHorizon;
  varying vec3 vWorldPos;
  varying float vZoom;
  `;
}

export function terrainMaterial(opts: TerrainMaterialOptions): {
  material: MeshLambertMaterial;
  uniforms: TerrainUniforms;
} {
  const { textures: t, sizeM, floorM, edgeFade, fadeRange } = opts;
  const useAlbedo = t.albedo !== null;
  const material = new MeshLambertMaterial({ vertexColors: true });
  const uniforms = {
    uBlend: { value: 0 },
    uShadow: { value: null },
    uShadowOn: { value: 0 },
    uHorizon: { value: new Color() },
  } satisfies TerrainUniforms;
  const defines = [
    useAlbedo && '#define USE_T_ALBEDO',
    t.ao && '#define USE_T_AO',
    t.detail && opts.detail && '#define USE_T_DETAIL',
    edgeFade && '#define USE_T_EDGE',
  ]
    .filter(Boolean)
    .join('\n');

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      uNormalMap: { value: t.normal },
      uAoMap: { value: t.ao },
      uAlbedoMap: { value: t.albedo },
      uDetailMap: { value: t.detail },
      uShadowMap: uniforms.uShadow,
      uSize: { value: sizeM },
      uFloor: { value: floorM },
      uFadeStart: { value: (sizeM / 2) * fadeRange[0] },
      uFadeEnd: { value: (sizeM / 2) * fadeRange[1] },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        varying float vZoom;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vZoom = projectionMatrix[1][1] / ${REF_PROJECTION.toFixed(2)};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${defines}\n${fragmentHead()}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 tUv = vec2(vWorldPos.x / uSize + 0.5, -vWorldPos.z / uSize + 0.5);
        float tDetail = 0.0;
        float tFade = 0.0;
        #ifdef USE_T_DETAIL
          float tDist = length(cameraPosition - vWorldPos) / max(vZoom, 1.0);
          tFade = 1.0 - smoothstep(${DETAIL_FADE_NEAR_M.toFixed(1)}, ${DETAIL_FADE_FAR_M.toFixed(1)}, tDist);
          vec2 tNear = vWorldPos.xz / ${DETAIL_NEAR_M.toFixed(1)};
          vec2 tFar = mat2(0.8, 0.6, -0.6, 0.8) * vWorldPos.xz / ${DETAIL_FAR_M.toFixed(1)};
          tDetail = (texture2D(uDetailMap, tNear).r + texture2D(uDetailMap, tFar).g - 1.0) * tFade;
        #endif
        #ifdef USE_T_ALBEDO
          vec3 tAlbedo = texture2D(uAlbedoMap, tUv).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, tAlbedo, uBlend);
        #endif
        diffuseColor.rgb *= 1.0 + tDetail * 0.45 * uBlend;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 tWorldN = texture2D(uNormalMap, vec2(tUv.x, tUv.y)).xyz * 2.0 - 1.0;
        tWorldN.xz += tDetail * 0.35;
        normal = normalize(mix(normal, normalize((viewMatrix * vec4(tWorldN, 0.0)).xyz), uBlend));`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        #ifdef USE_T_AO
          float tAo = texture2D(uAoMap, tUv).r;
          tAo = mix(1.0, tAo * tAo, uBlend);
          reflectedLight.indirectDiffuse *= tAo;
          reflectedLight.directDiffuse *= mix(1.0, tAo, 0.35);
        #endif
        if (uShadowOn > 0.0) {
          float tShadow = texture2D(uShadowMap, tUv).r;
          reflectedLight.directDiffuse *= mix(1.0, tShadow, uShadowOn * uBlend);
        }`,
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          float tHaze = exp(-max(vWorldPos.y - uFloor, 0.0) / ${HAZE_SCALE_M.toFixed(1)});
          float tFog = smoothstep(fogNear, fogFar, vFogDepth) * mix(0.4, 1.0, tHaze);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHorizon, tFog);
        #endif
        #ifdef USE_T_EDGE
          gl_FragColor.rgb = mix(
            gl_FragColor.rgb, uHorizon, smoothstep(uFadeStart, uFadeEnd, length(vWorldPos.xz)));
        #endif`,
      );
  };
  material.customProgramCacheKey = () => `terrain:${defines}`;
  return { material, uniforms };
}

/**
 * Thermal terrain by land cover (terrain plan §10): water coldest, then snow,
 * forest, and bare rock warmest, which keeps day heat into the early night.
 * Representative values; contacts stay far hotter.
 */
export function irTerrainMaterial(cover: Texture, sizeM: number): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCover = { value: cover };
    shader.uniforms.uSize = { value: sizeM };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uCover;
        uniform float uSize;
        varying vec3 vWorldPos;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec4 tCover = texture2D(uCover, vec2(vWorldPos.x / uSize + 0.5, -vWorldPos.z / uSize + 0.5));
        float tHeat = 0.34 * tCover.g + 0.52 * tCover.b;
        tHeat = mix(tHeat, 0.20, tCover.a);
        tHeat = mix(tHeat, 0.10, tCover.r);
        diffuseColor.rgb = vec3(tHeat);`,
      );
  };
  material.customProgramCacheKey = () => 'terrain-ir';
  return material;
}
