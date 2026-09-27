import type { Metadata } from 'next';
import { HostConsole } from '@/components/livehost/HostConsole';

export const metadata: Metadata = {
  title: 'Host console — ThryftVerse',
};

export default async function LiveHostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HostConsole streamId={id} />;
}
