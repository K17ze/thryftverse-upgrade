import type { MetadataRoute } from 'next';

/**
 * Public static routes only. Entity URLs (listings, profiles, auctions,
 * collections) are dynamic and, in live mode, unknowable at build time —
 * an honest sitemap omits them rather than guessing.
 */
const STATIC_ROUTES = [
  '/',
  '/explore',
  '/browse',
  '/categories',
  '/auctions',
  '/collections',
  '/galleria',
  '/live',
  '/co-own',
  '/co-own/pools',
  '/sell',
  '/about',
  '/help',
  '/buyer-protection',
  '/sustainability',
  '/privacy',
  '/terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.thryftverse.com';
  return STATIC_ROUTES.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/' ? 'daily' : 'weekly',
  }));
}
