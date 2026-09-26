import type { Metadata } from 'next';
import { CreateStreamFlow } from '@/components/livehost/CreateStreamFlow';

export const metadata: Metadata = {
  title: 'Go live — ThryftVerse',
};

export default function LiveCreatePage() {
  return <CreateStreamFlow />;
}
