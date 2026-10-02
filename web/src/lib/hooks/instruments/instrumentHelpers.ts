import { fetchJson } from '@/lib/api/http';
import type { LivePaymentMethodRow } from './instrumentTypes';

/** DELETE /users/:userId/addresses/:addressId — the only address mutation
 *  route besides create. 404s throw through fetchJson. */
export async function deleteLiveAddress(userId: string, addressId: string): Promise<void> {
  await fetchJson(
    `/users/${encodeURIComponent(userId)}/addresses/${encodeURIComponent(addressId)}`,
    { method: 'DELETE' },
  );
}

/** Fresh read of the raw methods rail to resolve a row's provider ref —
 *  verify-then-act: if the method vanished since the list rendered, this
 *  answers null instead of detaching the wrong instrument. */
export async function resolveProviderMethodRef(localId: string): Promise<string | null> {
  const payload = await fetchJson<{ ok?: boolean; items?: LivePaymentMethodRow[] }>(
    '/v2/payments/methods',
  );
  const row = (payload.items ?? []).find((r) => String(r.id) === localId);
  return typeof row?.providerPaymentMethodId === 'string'
    ? row.providerPaymentMethodId
    : null;
}

/** GET /orders/:id emits the instrument ids the order was placed with;
 *  the mapped CommerceOrder contract drops them, so this reads the raw row. */
export async function fetchLiveOrderInstrumentRefs(
  orderId: string,
  signal?: AbortSignal,
): Promise<{ addressId: number | null; paymentMethodId: number | null }> {
  const payload = await fetchJson<{
    ok?: boolean;
    order?: { addressId?: number | null; paymentMethodId?: number | null } | null;
  }>(`/orders/${encodeURIComponent(orderId)}`, undefined, { signal });
  const order = payload.order;
  return {
    addressId: typeof order?.addressId === 'number' ? order.addressId : null,
    paymentMethodId:
      typeof order?.paymentMethodId === 'number' ? order.paymentMethodId : null,
  };
}
