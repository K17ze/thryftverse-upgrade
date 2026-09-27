/**
 * /verification/demands/[id] — the respond surface for one demand.
 * Mirrors the mobile VerificationResponseScreen contract: evidence photos
 * + optional notes → pending transitions to responded; terminal statuses
 * render their own end-states.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemandResponseView } from '@/components/verification/DemandResponseView';

export const metadata: Metadata = {
  title: 'Respond to verification',
};

export default async function VerificationDemandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isInteger(demandId)) notFound();
  return <DemandResponseView demandId={demandId} />;
}
