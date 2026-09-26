'use client';

import { SupportHub } from '@/components/support/SupportHub';

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <h1 className="sr-only">Support</h1>
      <SupportHub />
    </div>
  );
}
