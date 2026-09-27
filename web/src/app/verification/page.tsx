/**
 * /verification — staged KYC flow (Intro → Identity → Document → Review →
 * Status), porting the mobile VerificationStatusScreen + KycFlowCard step
 * model. Fixture mode: the review is simulated and honestly labelled.
 */

import type { Metadata } from 'next';
import { VerificationFlow } from '@/components/verification/VerificationFlow';

export const metadata: Metadata = {
  title: 'Identity verification',
};

export default function VerificationPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6">
      <VerificationFlow />
    </div>
  );
}
