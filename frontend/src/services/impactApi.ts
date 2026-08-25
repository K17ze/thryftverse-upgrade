import { fetchJson } from '../lib/apiClient';

export interface ListingImpactResponse {
  available: true;
  co2eAvoidedKg: number;
  co2eProductionAvoidedKg: number;
  co2eEolAvoidedKg: number;
  co2eShippingKg: number;
  co2ePackagingKg: number;
  methodologyVersion: string;
  factorSources: string[];
}

export interface ListingImpactUnavailable {
  available: false;
  error?: string;
}

export interface ImpactLedgerEntry {
  id: string;
  orderId: string | null;
  listingId: string | null;
  co2eAvoidedKg: number;
  co2eProductionAvoidedKg: number;
  co2eEolAvoidedKg: number;
  co2eShippingKg: number;
  co2ePackagingKg: number;
  methodologyVersion: string;
  factorSources: string[];
  createdAt: string;
}

export interface ImpactLedgerResponse {
  totalCo2eAvoidedKg: number;
  itemCount: number;
  entries: ImpactLedgerEntry[];
}

export interface OrderImpactResponse {
  ok: true;
  ledgerId: string;
  alreadyMaterialised: boolean;
  impact?: ListingImpactResponse;
}

export async function fetchListingImpact(
  listingId: string,
): Promise<ListingImpactResponse | ListingImpactUnavailable> {
  return fetchJson<ListingImpactResponse | ListingImpactUnavailable>(
    `/listings/${encodeURIComponent(listingId)}/impact`,
  );
}

export async function fetchMyImpactLedger(): Promise<ImpactLedgerResponse> {
  return fetchJson<ImpactLedgerResponse>('/users/me/impact-ledger');
}

export async function materialiseOrderImpact(
  orderId: string,
): Promise<OrderImpactResponse> {
  return fetchJson<OrderImpactResponse>(
    `/orders/${encodeURIComponent(orderId)}/impact`,
    { method: 'POST' },
  );
}
