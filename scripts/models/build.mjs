// Contact models: raw Sketchfab downloads → small GLBs in apps/web/public/models.
//
//   node scripts/models/build.mjs            (all models)
//   node scripts/models/build.mjs heli bird  (some)
//
// Raw downloads go in scripts/models/raw/<folder>/ (git-ignored; sources and
// licences in docs/realism-sources.md). Each model is cleaned here (only the
// base-colour texture is kept: normal and metal maps add nothing at camera
// ranges; unused nodes and animations dropped), then run through the pinned
// gltf-transform CLI via npx (not a project dependency, decision 175):
// prune → weld → simplify (heavy models only) → resize → WebP → quantize.
// Orientation, size and rotor set-up happen at load time in
// apps/web/lib/sim/contact-models.ts.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const OUT = path.join(HERE, '..', '..', 'apps', 'web', 'public', 'models');
const CLI = '@gltf-transform/cli@4.5.1';

/**
 * id: output file name. src: raw folder. drop: node names removed with their
 * children. keepAnimations: only the bird (its wingbeat is baked at load).
 * simplify: target ratio for heavy meshes. tex: texture size in px.
 */
const MODELS = [
  { id: 'quad-small', src: 'dji_mavic_2_pro', tex: 512 },
  { id: 'fpv', src: 'fpv_kamikaze_drone_low-poly', simplify: 0.15, error: 0.01, tex: 512 },
  { id: 'quad-heavy', src: 'drone_for_agriculturelow_poly', simplify: 0.25, error: 0.02, tex: 512 },
  { id: 'loitering', src: 'uav_gerbera_low-poly', simplify: 0.5, tex: 512 },
  { id: 'fixed-wing', src: 'orlan-10', simplify: 0.12, tex: 512 },
  { id: 'heli', src: 'bell_huey_helicopter', drop: ['Inside1'], tex: 512 },
  { id: 'bird', src: 'crow_ascend', keepAnimations: true, tex: 256 },
];

function run(args) {
  execFileSync('npx', ['--yes', CLI, ...args], { stdio: ['ignore', 'ignore', 'inherit'], shell: true });
}

/** Strip everything but the base-colour map; drop named nodes and (unless kept) animations. */
function clean(model) {
  const dir = path.join(RAW, model.src);
  const g = JSON.parse(fs.readFileSync(path.join(dir, 'scene.gltf'), 'utf8'));
  for (const m of g.materials ?? []) {
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
    delete m.emissiveFactor;
    if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    delete m.extensions;
  }
  const drop = new Set();
  const mark = (i) => {
    drop.add(i);
    for (const c of g.nodes[i].children ?? []) mark(c);
  };
  g.nodes.forEach((n, i) => {
    if (model.drop?.includes(n.name)) mark(i);
  });
  // Detach dropped nodes (indices stay valid; prune removes the orphans).
  for (const n of g.nodes) if (n.children) n.children = n.children.filter((c) => !drop.has(c));
  for (const s of g.scenes) s.nodes = s.nodes.filter((c) => !drop.has(c));
  if (!model.keepAnimations) delete g.animations;
  const file = path.join(dir, '_clean.gltf');
  fs.writeFileSync(file, JSON.stringify(g));
  return file;
}

function build(model) {
  const work = path.join(RAW, '_work');
  fs.mkdirSync(work, { recursive: true });
  const step = (name) => path.join(work, `${model.id}.${name}.glb`);
  run(['prune', clean(model), step('a')]);
  run(['weld', step('a'), step('b')]);
  let cur = step('b');
  if (model.simplify) {
    const error = String(model.error ?? 0.002);
    run(['simplify', cur, step('c'), '--ratio', String(model.simplify), '--error', error]);
    cur = step('c');
  }
  run(['resize', cur, step('d'), '--width', String(model.tex), '--height', String(model.tex)]);
  run(['webp', step('d'), step('e'), '--quality', '85']);
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `${model.id}.glb`);
  // KHR_mesh_quantization: read natively by three's GLTFLoader (no decoder).
  run(['quantize', step('e'), out]);
  console.log(`${model.id.padEnd(11)} ${(fs.statSync(out).size / 1024).toFixed(0).padStart(5)} KB`);
}

const only = process.argv.slice(2);
for (const m of MODELS) if (only.length === 0 || only.includes(m.id)) build(m);
