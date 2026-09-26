'use client';

/**
 * Postage preferences — seller-side shipping defaults persisted on device,
 * mirroring the mobile postagePreferences slice (carrier key, free shipping,
 * bundle postage discount). On mobile these write through to
 * PATCH /users/me/postage; on web they persist locally — the screen copy
 * marks the sync boundary honestly.
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
