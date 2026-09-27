import type { Metadata } from 'next';
import { CoOwnGuideView } from '@/components/coown/CoOwnGuideView';

export const metadata: Metadata = {
  title: 'How Co-Own works',
  description:
    'Fractional ownership of real collectables — buying, selling, fees, trust and holder votes.',
};

export default function CoOwnGuidePage() {
  return <CoOwnGuideView />;
}
