import type { Metadata } from 'next';
import { DistributionsView } from '@/components/coown/DistributionsView';

export const metadata: Metadata = {
  title: 'Co-Own Distributions',
  description:
    'Full income history across your Co-Own holdings — per-unit rate, units held, ex-date and paid date.',
};

export default function CoOwnDistributionsPage() {
  return <DistributionsView />;
}
