import type { RootStackParamList } from '../../navigation/types';
import { trackTelemetryEvent } from '../../lib/telemetry';

export type CommerceMode = 'standard' | 'auction' | 'co_own';

export type CommerceDestinationSource =
  | {
      commerceMode: 'standard';
      listingId: string;
      auctionId?: never;
      assetId?: never;
    }
  | {
      commerceMode: 'auction';
      auctionId: string;
      listingId?: string;
      assetId?: never;
    }
  | {
      commerceMode: 'co_own';
      assetId: string;
      listingId?: string;
      auctionId?: never;
    };

export type CommerceDestination =
  | { ok: true; screen: 'ItemDetail'; params: { itemId: string } }
  | { ok: true; screen: 'AuctionDetail'; params: { auctionId: string } }
  | { ok: true; screen: 'AssetDetail'; params: { assetId: string } }
  | { ok: false; reason: string; commerceMode: CommerceMode };

export function resolveCommerceDestination(
  source: CommerceDestinationSource
): CommerceDestination {
  switch (source.commerceMode) {
    case 'standard': {
      if (!source.listingId) {
        logRoutingFailure('standard', source, 'missing_listing_id');
        return { ok: false, reason: 'This listing is unavailable.', commerceMode: 'standard' };
      }
      return { ok: true, screen: 'ItemDetail', params: { itemId: source.listingId } };
    }

    case 'auction': {
      if (!source.auctionId) {
        logRoutingFailure('auction', source, 'missing_auction_id');
        return { ok: false, reason: 'This auction is unavailable.', commerceMode: 'auction' };
      }
      return { ok: true, screen: 'AuctionDetail', params: { auctionId: source.auctionId } };
    }

    case 'co_own': {
      if (!source.assetId) {
        logRoutingFailure('co_own', source, 'missing_asset_id');
        return { ok: false, reason: 'This co-own asset is unavailable.', commerceMode: 'co_own' };
      }
      return { ok: true, screen: 'AssetDetail', params: { assetId: source.assetId } };
    }

    default: {
      logRoutingFailure('standard', source, 'unknown_mode');
      return { ok: false, reason: "We couldn't open this item.", commerceMode: 'standard' };
    }
  }
}

function logRoutingFailure(
  commerceMode: CommerceMode,
  source: Partial<CommerceDestinationSource>,
  failureReason: string
) {
  trackTelemetryEvent('commerce_routing_failure', {
    commerce_mode: commerceMode,
    listing_id: source.listingId ?? null,
    auction_id: source.auctionId ?? null,
    asset_id: source.assetId ?? null,
    failure_reason: failureReason,
  });
}

export type CommerceScreenName = 'ItemDetail' | 'AuctionDetail' | 'AssetDetail';

export function isCommerceScreen(screen: string): screen is CommerceScreenName {
  return screen === 'ItemDetail' || screen === 'AuctionDetail' || screen === 'AssetDetail';
}

export function navigateToCommerceDestination(
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void },
  source: CommerceDestinationSource,
  options?: { onFailure?: (result: Extract<CommerceDestination, { ok: false }>) => void }
): boolean {
  const destination = resolveCommerceDestination(source);
  if (destination.ok) {
    navigation.navigate(destination.screen, destination.params);
    return true;
  }
  if (options?.onFailure) {
    options.onFailure(destination);
  }
  return false;
}
