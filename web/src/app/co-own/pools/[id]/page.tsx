import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DATA_MODE } from '@/lib/api/client';
import { resolvePoolForRoute } from '@/lib/api/server';
import { PoolDetailView } from '@/components/pools/PoolDetailView';
import { PoolLiveNotice } from '../PoolLiveNotice';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  // Live pools have no backend surface — the page renders the live notice
  // and resolution never runs; the title stays generic (fixture names are
  // demo data and must never leak into live metadata).
  if (DATA_MODE === 'live') return { title: 'Pools' };
  const { id } = await params;
  const resolution = await resolvePoolForRoute(id);
  if (resolution.status !== 'resolved') return { title: 'Pool' };
  const pool = resolution.value;
  return {
    title: pool.name,
    description: `${pool.name} — a group-buy pool targeting ${pool.unitsTarget} units, ${pool.members.length}/${pool.memberCap} members.`,
  };
}

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (DATA_MODE === 'live') return <PoolLiveNotice />;
  const resolution = await resolvePoolForRoute(id);
  // Session-created pools live in the client store — 'unresolvable'
  // renders the client view, which keeps its own miss handling.
  if (resolution.status === 'missing') notFound();
  return <PoolDetailView id={id} />;
}
