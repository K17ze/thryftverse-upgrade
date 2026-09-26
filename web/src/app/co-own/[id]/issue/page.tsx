import type { Metadata } from 'next';
import { coOwnAssetById } from '@/lib/data/fixtures-coown';
import { ReportIssueView } from '@/components/coown/issue/ReportIssueView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const asset = coOwnAssetById(id);
  return {
    title: asset ? `Report an issue — ${asset.title}` : 'Report an issue',
    description: 'Flag a dispute, technical problem or fraud on a Co-Own asset.',
  };
}

export default async function ReportIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportIssueView id={id} />;
}
