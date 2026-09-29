import type { NextConfig } from 'next';

// ── Environment boundary — fail the build on misconfiguration rather
// than ship a silently-degraded deployment.
//   • DATA_MODE must be exactly 'fixture' or 'live' — a typo would
//     quietly render fixture data on a "live" deploy.
//   • 'live' in production requires an explicit API base — without it
//     every request would fall through to localhost.
// Fixture mode remains a legitimate production choice (demo/showcase
// deploys) — it is an explicit value, not the absence of config.
const dataMode = process.env.NEXT_PUBLIC_DATA_MODE ?? 'fixture';
if (dataMode !== 'fixture' && dataMode !== 'live') {
  throw new Error(
    `NEXT_PUBLIC_DATA_MODE must be "fixture" or "live" — got "${dataMode}".`,
  );
}
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
if (
  process.env.NODE_ENV === 'production' &&
  dataMode === 'live' &&
  !apiBase
) {
  throw new Error(
    'NEXT_PUBLIC_DATA_MODE=live requires NEXT_PUBLIC_API_BASE_URL. ' +
      'Refusing to build a production bundle that cannot reach an API.',
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Verification builds can be redirected away from the dev server's
  // live .next directory: BUILD_DIST_DIR=.next-verify next build.
  ...(process.env.BUILD_DIST_DIR ? { distDir: process.env.BUILD_DIST_DIR } : {}),
  outputFileTracingRoot: __dirname,
  images: {
    qualities: [75, 80, 90],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.unsplash.com' },
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'https', hostname: '**.minio.dev' },
    ],
  },
  async rewrites() {
    // Only proxy when the API base is explicitly configured — an unset
    // variable must not silently route /api/* to localhost.
    if (!apiBase) return [];
    return [
      { source: '/api/:path*', destination: `${apiBase.replace(/\/$/, '')}/:path*` },
    ];
  },
  async redirects() {
    // Vocabulary move: syndicates → pools. The segment was renamed, so
    // legacy /co-own/syndicate URLs resolve permanently to /co-own/pools.
    return [
      { source: '/co-own/syndicate', destination: '/co-own/pools', permanent: true },
      { source: '/co-own/syndicate/:path*', destination: '/co-own/pools/:path*', permanent: true },
      // Defensive plural variant — the backend/domain contract spells the
      // segment /co-own/syndicates/:id, so cover the plural legacy URL too.
      { source: '/co-own/syndicates', destination: '/co-own/pools', permanent: true },
      { source: '/co-own/syndicates/:path*', destination: '/co-own/pools/:path*', permanent: true },
    ];
  },
};

export default nextConfig;
