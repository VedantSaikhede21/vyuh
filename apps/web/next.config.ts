import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@vyuh/shared', '@vyuh/sim-core'],
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Dev-only routes (/dev/ui, /dev/hero) are `page.dev.tsx` and do not exist in
  // production builds (decision 63).
  pageExtensions: isProd ? ['tsx', 'ts'] : ['tsx', 'ts', 'dev.tsx'],
};

export default nextConfig;
