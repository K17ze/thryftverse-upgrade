/**
 * /category/[slug] — server shell. The taxonomy is a static catalogue in
 * both data modes, so a slug miss is always definitive — not-found.tsx
 * at 404 instead of the client view's soft empty state. generateMetadata
 * reads the same resolver.
 */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryClient } from '@/components/search/CategoryClient';
import { MasonrySkeleton } from '@/components/ui/Skeleton';
import { resolveCategoryForRoute } from '@/lib/api/server';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolution = resolveCategoryForRoute(slug);
  if (resolution.status !== 'resolved') return { title: 'Category' };

  const category = resolution.value;
  const description = `Shop second-hand ${category.name.toLowerCase()} from independent sellers on ThryftVerse.`;
  return {
    title: category.name,
    description,
    openGraph: {
      title: category.name,
      description,
      type: 'website',
      images: category.image ? [{ url: category.image, alt: category.name }] : undefined,
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  if (resolveCategoryForRoute(slug).status === 'missing') notFound();
  return (
    <Suspense fallback={<MasonrySkeleton columns={4} />}>
      <CategoryClient slug={slug} />
    </Suspense>
  );
}
