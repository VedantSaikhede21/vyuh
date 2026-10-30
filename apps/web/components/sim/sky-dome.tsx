'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BackSide, Color, ShaderMaterial, Vector3, type Mesh } from 'three';
import type { EnvironmentLook } from '@/lib/sim/environment-look';

const VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// No HDR and no tone mapping: colours are written as given, so the dome matches
// the terrain's edge fade exactly and can never blow out (audit P1-3).
const FRAGMENT = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uSunAmount;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, pow(up, 0.55));
  float toSun = max(dot(dir, uSun), 0.0);
  sky += uSunColor * uSunAmount * (pow(toSun, 64.0) * 0.18 + smoothstep(0.9996, 0.9999, toSun));
  gl_FragColor = vec4(sky, 1.0);
}`;

/**
 * Sky for a view (terrain plan §7.1): zenith to horizon from the sun's elevation,
 * with a soft sun. Follows the camera so it never clips. `encoded` is true where
 * the output goes straight to the screen (tactical view), false for the linear
 * EO render target.
 */
export function SkyDome({ look, encoded }: { look: EnvironmentLook; encoded: boolean }) {
  const camera = useThree((s) => s.camera);
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => {
    const prep = (c: Color) => (encoded ? c.clone().convertLinearToSRGB() : c.clone());
    return new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: false,
      uniforms: {
        uZenith: { value: prep(look.skyZenith) },
        uHorizon: { value: prep(look.skyHorizon) },
        uSun: { value: new Vector3(...look.trueSunDir) },
        uSunColor: { value: prep(look.sunColor) },
        uSunAmount: { value: look.sunVisible ? 1 : 0 },
      },
    });
  }, [look, encoded]);
  useFrame(() => {
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
