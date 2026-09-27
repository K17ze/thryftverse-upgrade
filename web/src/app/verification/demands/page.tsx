/**
 * /verification/demands — the seller verification-demand inbox.
 * Mirrors the mobile SellerVerificationScreen: pending demands needing
 * evidence, then history. Fixture-backed in fixture mode.
 */

import type { Metadata } from 'next';
import { DemandList } from '@/components/verification/DemandList';

export const metadata: Metadata = {
  title: 'Verification requests',
};

export default function VerificationDemandsPage() {
  return <DemandList />;
}
