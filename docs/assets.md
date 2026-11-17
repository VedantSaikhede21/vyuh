# Rendering assets

Every 3D model, texture and rendering package the player ships, with where it came from and what it costs to download. Extends `docs/realism-sources.md` (which keeps the data sources and the realism citations). Started in realism plan step R0 (`docs/plans/realism-plan.md`).

## Pipeline

1. Raw downloads go in a git-ignored folder (`scripts/models/raw/` for the contact models).
2. `node scripts/assets/optimize.mjs <in.gltf|glb> <out.glb> [--texture-size N] [--no-simplify]` runs the pinned gltf-transform CLI (`@gltf-transform/cli@4.5.1` through npx, as decision 175 does): meshopt geometry (`EXT_meshopt_compression`) and KTX2 / Basis Universal textures (`KHR_texture_basisu`). KTX2 stays compressed on the GPU, so a 2048 px texture costs about a quarter to an eighth of the video memory of a PNG, JPEG or WebP one.
3. KTX2 encoding needs Khronos **KTX-Software** (`ktx` CLI, 4.3 or later) on the build machine. It is not in the winget catalogue; installed from the signed Windows installer at github.com/KhronosGroup/KTX-Software/releases (v4.4.2, signer "The Khronos Group Inc", 2026-11-17). Only the machine that builds assets needs it.
4. In the app, everything loads through `apps/web/lib/assets/gltf.ts` (`useAssetGltf`): one `MeshoptDecoder`, one `KTX2Loader` per renderer. The Basis transcoder (JS + WASM, ~570 KB, cached) is copied from three into `apps/web/public/basis/` by `apps/web/scripts/copy-decoders.ts` before dev and build (git-ignored, so it always matches three).
5. **Before the first compressed asset ships in the player**, production's CSP `script-src` needs `'wasm-unsafe-eval'` (`apps/web/next.config.ts`); dev already allows eval, so dev routes work today.

Proof (2026-11-17): `quad-small` rebuilt from its raw source with `--texture-size 512 --no-simplify` → `apps/web/public/models/pipeline-test/quad-small.glb`; `/dev/models?pipeline=1` loads it next to the shipped WebP model through `useAssetGltf`; `node apps/web/scripts/check-pipeline.ts` reports `EXT_meshopt_compression`, `KHR_mesh_quantization`, `KHR_texture_basisu` and a `CompressedTexture` on the NVIDIA RTX 3050 (screenshot `apps/web/e2e/reference/r0/pipeline-check.png`); `apps/web/test/asset-pipeline.test.ts` checks the file's extensions and KTX2 images.

## Assets

Sizes in KB (1 KB = 1,024 bytes). Original = the raw download's geometry and textures.

| Asset | Shipped as | Source | Author | Licence | Original | Shipped |
|---|---|---|---|---|---|---|
| Small quadcopter | `models/quad-small.glb` (WebP) | [DJI Mavic 2 Pro](https://sketchfab.com/3d-models/dji-mavic-2-pro-3e5b8566dbe24f4ba65473179650abd1) | MattMaksymowicz | CC BY 4.0 | 16,279 | 158 |
| Small quadcopter, pipeline test (not used by the player) | `models/pipeline-test/quad-small.glb` (meshopt + KTX2) | same | same | CC BY 4.0 | 16,279 | 91 |
| Heavy multirotor | `models/quad-heavy.glb` | [Drone For agriculture (Low Poly)](https://sketchfab.com/3d-models/drone-for-agriculturelow-poly-b6220a9a99d349d5aa64c8e7edef3758) | Bharat Nagar | CC BY 4.0 | 6,458 | 353 |
| FPV | `models/fpv.glb` | [FPV kamikaze drone Low-poly](https://sketchfab.com/3d-models/fpv-kamikaze-drone-low-poly-87f5bbb5b08641b782bc084ddd4082a7) | Kvasovich | CC BY 4.0 | 6,683 | 358 |
| Loitering munition | `models/loitering.glb` | [UAV Gerbera [Low-Poly]](https://sketchfab.com/3d-models/uav-gerbera-low-poly-0b619df8b433445f8d22f3c4afdf7758) | Vlarder1 | CC BY 4.0 | 2,106 | 150 |
| Small fixed-wing | `models/fixed-wing.glb` | [Orlan-10](https://sketchfab.com/3d-models/orlan-10-e2efb223c1814b7291818a9a7b4e80c5) | FLIGHTCLUB (flightclubua) | CC BY 4.0 | 5,319 | 125 |
| Friendly helicopter | `models/heli.glb` | [Bell Huey helicopter](https://sketchfab.com/3d-models/bell-huey-helicopter-755d8518a06e41b19752c1b54c0da588) | Duane's Mind | CC BY 4.0 | 1,007 | 63 |
| Birds | `models/bird.glb` | [Crow Ascend](https://sketchfab.com/3d-models/crow-ascend-e2e6d407b18547d2a9ed37a1707042e1) | Lahcen.el | CC BY 4.0 | 240 | 117 |

## Rendering packages

Pre-approved in `docs/plans/realism-plan.md` §7; each licence is checked at install and listed here.

| Package | Version | Licence (checked) | Used by |
|---|---|---|---|
| — | | | (none installed yet; R1 adds the Takram test packages) |

## Where big files live (proposal, R0 — nothing moved yet)

Limits checked 2026-11-17:

| Option | Free allowance | Catch |
|---|---|---|
| Vercel static files (today: `apps/web/public`) | 100 GB / month Fast Data Transfer, served from the CDN, cached or not | CLI source upload capped at 100 MB (Git deployments are built on Vercel from the repo instead); every byte counts against the 100 GB |
| Supabase Storage (already in the stack) | 1 GB stored, **50 MB per file** | Egress about 5 GB uncached + 5 GB cached a month (docs and pricing page disagree on the split): a 50 MB terrain set at that rate is ~100–200 first visits a month; a free project pauses after a week without activity |
| Git LFS on GitHub | 10 GiB stored, 10 GiB bandwidth / month (Free plan, current billing docs) | Every CI checkout and Vercel build that pulls the files counts against the bandwidth |

**Recommendation: Git LFS for the files, Vercel's static hosting to serve them.** Big binaries (terrain textures above ~5 MB, tree and house atlases, KTX2 sets) are tracked with LFS by path pattern, so git history stays small while every file stays versioned with the code that reads it. They are still served same-origin from `apps/web/public` through Vercel's CDN (100 GB a month, no CSP change, no second origin to keep in sync). CI does not need them (unit tests read none of them, `actions/checkout` with `lfs: false`), so LFS bandwidth goes only to Vercel builds (one full pull per deploy) and this machine. The offline Docker build keeps working unchanged, because it copies `apps/web/public` after `git lfs pull`.

Why not Supabase Storage, as the realism plan suggested: its free egress is about a tenth of Vercel's, a public demo with tens of MB per visit would exhaust it first, and the 50 MB per-file cap rules out the largest planned textures without splitting them; it would also add a second origin to the CSP and a sync step for the offline copy. Supabase stays the fallback if a single deploy grows past what Vercel will build, or LFS bandwidth runs out.

To check before moving anything: Vercel's build-output size for a Git deployment (the docs found give only the CLI cap), and Vercel's "Git LFS" project setting, which must be switched on for the build to see the files.

Sources: [Vercel limits](https://vercel.com/docs/limits), [Supabase pricing](https://supabase.com/docs/pricing), [Supabase bandwidth and storage egress](https://supabase.com/docs/guides/storage/serving/bandwidth.md), [GitHub Git LFS billing](https://docs.github.com/en/billing/concepts/product-billing/git-lfs).
