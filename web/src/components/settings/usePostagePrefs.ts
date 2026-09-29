'use client';

/**
 * Postage preferences — seller-side shipping defaults mirroring the
 * mobile postagePreferences slice (carrier key, free shipping, bundle
 * postage discount). Live mode hydrates them from GET /users/me/postage
 * and writes through PATCH /users/me/postage — this store is the
 * optimistic mirror and the fixture-mode truth.
 */

import { useEffect, useState } from 'react';

export interface PostagePrefs {
  carrierKey: string | null;
  freeShipping: boolean;
  bundleDiscount: boolean;
}

const KEY = 'thryftverse.web.postage-prefs';

const DEFAULTS: PostagePrefs = {
  carrierKey: null,
  freeShipping: false,
  bundleDiscount: false,
};

export function usePostagePrefs(): {
  prefs: PostagePrefs;
  loaded: boolean;
  update: (patch: Partial<PostagePrefs>) => void;
} {
  const [prefs, setPrefs] = useState<PostagePrefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<PostagePrefs>) });
    } catch {
      /* corrupt payload → defaults */
    }
    setLoaded(true);
  }, []);

  const update = (patch: Partial<PostagePrefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — session state still applies */
      }
      return next;
    });

  return { prefs, loaded, update };
}

/** Account-switch reset — drops the persisted seller shipping defaults
 *  (the next session starts from defaults until the seller re-authors). */
export function resetPostagePrefs(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — nothing persisted to clear */
  }
}
