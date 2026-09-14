import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchListingByIdFromApi, type ListingApiItem } from '../../services/listingsApi';
import { useToast } from '../../context/ToastContext';
import { t } from '../../i18n';

interface UseEditListingDataParams {
  itemId: string;
  /** Called with the fetched listing record to hydrate form + media state. */
  onHydrate: (listing: ListingApiItem) => void;
}

/**
 * Owns the edit-listing fetch lifecycle: initial load on mount, the retry
 * path used by the error state, `isLoading`/`loadError` flags and the raw
 * `listing` record. Extracted verbatim from EditListingScreen — the mount
 * fetch toasts on failure while the manual retry only flags the error state
 * (the user is already looking at it), and both paths share one hydration
 * callback so the field/media seeding lives in exactly one place.
 */
export function useEditListingData({ itemId, onHydrate }: UseEditListingDataParams) {
  const { show: showToast } = useToast();
  const [listing, setListing] = useState<ListingApiItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback((notifyOnError: boolean) => {
    setIsLoading(true);
    setLoadError(false);
    fetchListingByIdFromApi(itemId)
      .then((res) => {
        if (!mountedRef.current) return;
        if (res.ok && res.listing) {
          setListing(res.listing);
          onHydrate(res.listing);
        } else {
          setLoadError(true);
          if (notifyOnError) showToast(t('listing.edit.couldNotLoad'), 'error');
        }
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoadError(true);
        if (notifyOnError) showToast(t('listing.edit.couldNotLoad'), 'error');
      })
      .finally(() => { if (mountedRef.current) setIsLoading(false); });
  }, [itemId, onHydrate, showToast]);

  /* ── fetch listing on mount ── */
  useEffect(() => {
    load(true);
  }, [load]);

  /** Error-state retry — identical fetch, no toast (the error UI is visible). */
  const retry = useCallback(() => {
    load(false);
  }, [load]);

  return { listing, isLoading, loadError, retry };
}
