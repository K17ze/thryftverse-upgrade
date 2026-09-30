'use client';

import { Badge } from '@/components/ui/Badge';
import type { ManagedListingRow } from '../listingManagementModel';

export function statusBadge(status: ManagedListingRow['status']) {
  if (status === 'sold') return <Badge variant="neutral">Sold</Badge>;
  if (status === 'draft') return <Badge variant="warning">Draft</Badge>;
  // Paused is a deliberate seller state, not a fault — neutral badge,
  // the row keeps Resume instead of masquerading as active.
  if (status === 'paused') return <Badge variant="neutral">Paused</Badge>;
  if (status === 'held') return <Badge variant="neutral">On hold</Badge>;
  return <Badge variant="success">Active</Badge>;
}

/** Compact status word for the small-screen meta line. */
export function statusWord(status: ManagedListingRow['status']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'draft':
      return 'Draft';
    case 'held':
      return 'On hold';
    default:
      return 'Sold';
  }
}
