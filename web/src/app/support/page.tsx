import type { Metadata } from 'next';
import { SupportHub } from '@/components/support/SupportHub';

export const metadata: Metadata = {
  title: 'Support',
};

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-16 lg:max-w-[1440px]">
      <SupportHub />
    </div>
  );
}
