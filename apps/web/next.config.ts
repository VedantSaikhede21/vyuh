import { join } from 'node:path';
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

/** Security headers (system plan S10). The app needs inline scripts from Next and WebGL
 *  workers; everything else stays same-origin plus the API and Supabase. */
function securityHeaders() {
  const api = process.env.NEXT_PUBLIC_API_URL
    ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
    : '';
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' ${api} ${supabase}${isProd ? '' : ' ws: http://localhost:*'}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  ];
}

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@vyuh/shared', '@vyuh/sim-core'],
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker image (offline build): a self-contained server, traced from the repo root.
  ...(process.env.VYUH_STANDALONE
    ? { output: 'standalone' as const, outputFileTracingRoot: join(import.meta.dirname, '../..') }
    : {}),
  devIndicators: false,
  env: { NEXT_PUBLIC_WEB_BUILD: buildId() },
  // Dev-only routes (/dev/ui, /dev/hero) are `page.dev.tsx` and do not exist in
  // production builds (decision 63).
  pageExtensions: isProd ? ['tsx', 'ts'] : ['tsx', 'ts', 'dev.tsx'],
  // Terrain presets (up to ~4 MB each), spectrogram templates and landing media
  // are re-fetched on every visit with Next's default `max-age=0`. Their paths are
  // not content-hashed, so a day plus a week of stale-while-revalidate, not
  // `immutable`: a re-built preset reaches users within a day (Phase 6F).
  async headers() {
    const cache = [
      { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
    ];
    const media = [
      '/terrain/:path*',
      '/signatures/:path*',
      '/landing/:path*',
      '/models/:path*',
      '/renders/:path*',
    ].map((source) => ({ source, headers: cache }));
    return [...media, { source: '/:path*', headers: securityHeaders() }];
  },
};

export default nextConfig;
