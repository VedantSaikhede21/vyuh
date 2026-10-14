import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@vyuh/shared', '@vyuh/sim-core'],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
