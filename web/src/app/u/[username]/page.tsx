/**
 * /u/[username] — public profile server shell. The member resolves
 * server-side so a deleted or renamed handle lands on not-found.tsx at
 * 404 instead of the client view's soft-404. ProfileClient carries the
 * interactive surface.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveMemberForRoute } from '@/lib/api/server';
import { ProfileClient } from './ProfileClient';

interface MemberPageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: MemberPageProps): Promise<Metadata> {
  const { username } = await params;
  const resolution = await resolveMemberForRoute(username);
  if (resolution.status !== 'resolved') return { title: 'Member' };

  const user = resolution.value;
  const title = `@${user.username}`;
  const description =
    user.bio?.trim() ||
    `${user.followers} followers · ${user.listingCount} listings on ThryftVerse`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      images: user.avatar ? [{ url: user.avatar, alt: title }] : undefined,
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function MemberPage({ params }: MemberPageProps) {
  const { username } = await params;
  const resolution = await resolveMemberForRoute(username);
  if (resolution.status === 'missing') notFound();
  return <ProfileClient />;
}
