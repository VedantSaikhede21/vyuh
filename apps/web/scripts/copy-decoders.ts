// Copies three's Basis Universal transcoder (JS + WASM) into public/basis/ before
// dev and build, for KTX2 textures (lib/assets/gltf.ts, docs/assets.md). Copied, not
// committed, so it always matches the installed three; public/basis/ is git-ignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// three's package exports hide package.json, so use the app's own node_modules link (pnpm).
const from = resolve(import.meta.dirname, '../node_modules/three/examples/jsm/libs/basis');
const to = resolve(import.meta.dirname, '../public/basis');
mkdirSync(to, { recursive: true });
for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  copyFileSync(resolve(from, f), resolve(to, f));
}
console.log('copied the Basis transcoder for KTX2 textures');
