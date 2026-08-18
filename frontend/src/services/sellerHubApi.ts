/**
 * Seller Hub API — server-backed aggregate for the Seller Hub OS.
 *
 * Per closure program 05_SELLER_HUB_AND_PROFILE_OS: no frontend
 * approximation of financial KPIs. All money, tasks, and inventory
 * counts come from the server aggregate endpoint.
 */

import { fetchJson } from '../lib/apiClient';

export interface SellerHubTask {
  type: 'ship_order' | 'respond_offer' | 'listing_issue';
  count: number;
  oldestDueAt?: string;
}

export interface SellerHubOverview {
  generatedAt: string;
  inventory: {
    active: number;
    drafts: number;
    paused: number;
    sold: number;
    listedValueGbp: number;
  };
  tasks: SellerHubTask[];
  performance: {
    period: '30d';
    grossSalesGbp: number;
    orders: number;
  };
}

interface SellerHubOverviewResponse {
  ok: boolean;
  overview: SellerHubOverview;
}

export async function fetchSellerHubOverview(): Promise<SellerHubOverview> {
  const response = await fetchJson<SellerHubOverviewResponse>('/seller-hub/overview');
  return response.overview;
}
