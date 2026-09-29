import type { MetadataRoute } from 'next';

/**
 * Private/account surfaces never belong in an index — disallow is
 * prefix-matched, so each entry covers the whole subtree.
 */
const DISALLOWED = [
  '/checkout',
  '/bag',
  '/settings',
  '/wallet',
  '/inbox',
  '/orders',
  '/seller-hub',
  '/review',
  '/support',
];

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.thryftverse.com';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: DISALLOWED,
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
