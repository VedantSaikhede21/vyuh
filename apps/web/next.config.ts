import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @vyuh/shared ships TypeScript source.
  transpilePackages: ['@vyuh/shared'],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
