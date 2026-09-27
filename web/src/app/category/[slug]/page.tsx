import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CategoryClient } from '@/components/search/CategoryClient';
import { MasonrySkeleton } from '@/components/ui/Skeleton';
import { CATEGORIES } from '@/lib/data/fixtures';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.slug === slug);
  return { title: category ? category.name : 'Category' };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  return (
    <Suspense fallback={<MasonrySkeleton columns={4} />}>
      <CategoryClient slug={slug} />
    </Suspense>
  );
}
