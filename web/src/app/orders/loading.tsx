import { RowSkeleton } from '@/components/orders/RowSkeleton';

/** Streaming skeleton for the orders segment — the same list-row geometry
 *  the loaded list renders (thumb, title, meta, status, price). */
export default function Loading() {
  return <RowSkeleton />;
}
