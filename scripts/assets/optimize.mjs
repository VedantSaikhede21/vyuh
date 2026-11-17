// Rendering-asset pipeline (realism plan R0): any glTF / GLB → one GLB with meshopt
// geometry and KTX2 (Basis Universal) textures, ready for apps/web/lib/assets.
//
//   node scripts/assets/optimize.mjs <input.gltf|glb> <output.glb> [--texture-size 1024] [--no-simplify]
//
// Runs the pinned gltf-transform CLI through npx (as scripts/models/build.mjs does,
// decision 175). KTX2 needs Khronos KTX-Software's `ktx` CLI (4.3 or later) on this
// machine: Windows installer from github.com/KhronosGroup/KTX-Software/releases
// (4.4.2 used here); the default install folder is added to PATH below. Only the
// build machine needs it: outputs are committed or uploaded (docs/assets.md), and
// CI never re-encodes.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CLI = '@gltf-transform/cli@4.5.1';
const KTX_DIRS = ['C:\\Program Files\\KTX-Software\\bin', '/usr/local/bin', '/opt/homebrew/bin'];

function usage(msg) {
  if (msg) console.error(msg);
  console.error(
    'usage: node scripts/assets/optimize.mjs <input> <output.glb> [--texture-size N] [--no-simplify]',
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const positional = args.filter(
  (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--texture-size'),
);
const [input, output] = positional;
if (!input || !output) usage();
if (!fs.existsSync(input)) usage(`no such file: ${input}`);
const sizeAt = args.indexOf('--texture-size');
const textureSize = sizeAt >= 0 ? Number(args[sizeAt + 1]) : 2048;
if (!Number.isInteger(textureSize) || textureSize < 16)
  usage('--texture-size must be an integer ≥ 16');
const simplify = !args.includes('--no-simplify');

const env = { ...process.env };
env.PATH = [...KTX_DIRS.filter((d) => fs.existsSync(d)), env.PATH ?? ''].join(path.delimiter);
try {
  const v = execFileSync('ktx', ['--version'], { env, encoding: 'utf8', shell: true }).trim();
  console.log(v);
} catch {
  usage('KTX-Software `ktx` CLI not found (see the header of this script).');
}

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
// gltf-transform prints the true sizes (a .gltf input with its .bin and textures).
execFileSync(
  'npx',
  [
    '--yes',
    CLI,
    'optimize',
    JSON.stringify(path.resolve(input)),
    JSON.stringify(path.resolve(output)),
    '--compress',
    'meshopt',
    '--texture-compress',
    'ktx2',
    '--texture-size',
    String(textureSize),
    '--simplify',
    String(simplify),
  ],
  { env, stdio: ['ignore', 'inherit', 'inherit'], shell: true },
);
