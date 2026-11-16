'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  BackSide,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Color,
  type Mesh,
} from 'three';
import { ATMOS_PARS_GLSL, ATMOS_UNIFORMS } from '@/lib/sim/atmosphere-fog';
import type { AtmosphereLook } from '@/lib/sim/atmosphere-look';
import type { EnvironmentLook } from '@/lib/sim/environment-look';

const VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// No HDR and no tone mapping: colours are written as given, so the dome matches
// the terrain's fog exactly and can never blow out (audit P1-3). With ATMOS the
// horizon is three's fogColor (converted per view by three) brightened towards
// the sun exactly as the fog chunk does, so distant ground and sky meet without
// a seam (atmosphere step 2).
const FRAGMENT = `
#ifdef ATMOS
  uniform vec3 fogColor;
  ${ATMOS_PARS_GLSL}
#else
  uniform vec3 uHorizon;
#endif
uniform vec3 uZenith;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uSunAmount;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float up = clamp(dir.y, 0.0, 1.0);
  #ifdef ATMOS
    vec3 horizon = atmosAir(dir);
  #else
    vec3 horizon = uHorizon;
  #endif
  vec3 sky = mix(horizon, uZenith, pow(up, 0.55));
  float toSun = max(dot(dir, uSun), 0.0);
  sky += uSunColor * uSunAmount * (pow(toSun, 64.0) * 0.18 + smoothstep(0.9996, 0.9999, toSun));
  gl_FragColor = vec4(sky, 1.0);
}`;

/**
 * Sky for a view (terrain plan §7.1): zenith to horizon from the sun's elevation,
 * with a soft sun. Follows the camera so it never clips. `encoded` is true where
 * the output goes straight to the screen (tactical view), false for the linear
 * EO render target. `atmos` (atmosphere step 2) takes the horizon from the fog.
 */
export function SkyDome({
  look,
  encoded,
  atmos = null,
}: {
  look: EnvironmentLook;
  encoded: boolean;
  atmos?: AtmosphereLook | null;
}) {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => {
    const prep = (c: Color) => (encoded ? c.clone().convertLinearToSRGB() : c.clone());
    const sun = {
      uSun: { value: new Vector3(...look.trueSunDir) },
      uSunColor: { value: prep(look.sunColor) },
      uSunAmount: { value: look.sunVisible ? 1 : 0 },
    };
    const uniforms = atmos
      ? {
          ...UniformsUtils.clone(UniformsLib.fog),
          ...ATMOS_UNIFORMS,
          ...sun,
          uZenith: { value: prep(atmos.zenith) },
        }
      : {
          ...sun,
          uZenith: { value: prep(look.skyZenith) },
          uHorizon: { value: prep(look.skyHorizon) },
        };
    return new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: atmos !== null,
      defines: atmos ? { ATMOS: '' } : {},
      uniforms,
    });
  }, [look, encoded, atmos]);
  useFrame(({ camera }) => {
    mesh.current?.position.copy(camera.position);
  });
  return (
    <mesh
      ref={mesh}
      material={material}
      renderOrder={-1000}
      frustumCulled={false}
      raycast={() => null}
    >
      <sphereGeometry args={[1000, 24, 16]} />
    </mesh>
  );
}
