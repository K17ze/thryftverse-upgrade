/**
 * Explore topics — the authored destinations behind the "Trending topics"
 * band. Hrefs are composed from the real browse taxonomy (CATEGORY_TREE
 * subcategories deep-link via ?sub=, matching CategoryClient) and
 * catalogue-verified queries; each cover is borrowed from the listing
 * that best represents the topic, so media stays fixture-true.
 */

import { LISTINGS } from '@/lib/data/fixtures';
import { CATEGORY_TREE } from '@/components/search/taxonomy';

export interface ExploreTopic {
  label: string;
  href: string;
  image: string;
}

/** Subcategory deep link — ?sub is only emitted when the taxonomy declares it. */
const topicHref = (slug: string, subcategory?: string): string => {
  const subs = CATEGORY_TREE[slug] ?? [];
  const match = subcategory
    ? subs.find((s) => s.toLowerCase() === subcategory.toLowerCase())
    : undefined;
  return match
    ? `/category/${slug}?sub=${encodeURIComponent(match)}`
    : `/category/${slug}`;
};

const searchHref = (q: string) => `/search?q=${encodeURIComponent(q)}`;

const coverOf = (listingId: string): string =>
  LISTINGS.find((l) => l.id === listingId)?.images[0] ?? '';

export const TRENDING_TOPICS: ExploreTopic[] = [
  {
    label: 'Vintage knitwear',
    href: topicHref('women', 'Knitwear'),
    image: coverOf('l23'), // Mohair Blend Cardigan
  },
  {
    label: 'Streetwear drops',
    href: topicHref('men', 'T-shirts'),
    image: coverOf('l27'), // Graphic Print Tee
  },
  {
    label: 'Quiet luxury',
    href: searchHref('wool'),
    image: coverOf('l9'), // Oversized Wool Coat
  },
  {
    label: 'Retro sneakers',
    href: topicHref('sneakers'),
    image: coverOf('l24'), // Adidas Samba OG
  },
  {
    label: 'Leather weather',
    href: searchHref('leather'),
    image: coverOf('l7'), // Leather Biker Jacket
  },
  {
    label: 'Summer dresses',
    href: topicHref('women', 'Dresses'),
    image: coverOf('l6'), // Silk Slip Dress
  },
];
