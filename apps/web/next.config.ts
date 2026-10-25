import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

/** Short commit of this build for the status page: BUILD_SHA, Vercel's, git, else "unknown". */
function buildId(): string {
  const given = process.env.BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (given) return given.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@vyuh/shared', '@vyuh/sim-core'],
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  env: { NEXT_PUBLIC_WEB_BUILD: buildId() },
  // Dev-only routes (/dev/ui, /dev/hero) are `page.dev.tsx` and do not exist in
  // production builds (decision 63).
  pageExtensions: isProd ? ['tsx', 'ts'] : ['tsx', 'ts', 'dev.tsx'],
};

export default nextConfig;
