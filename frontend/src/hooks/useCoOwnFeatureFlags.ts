import { useState, useEffect } from 'react';
import {
  getCoOwnFlags,
  subscribeToFlagChanges,
  type CoOwnFeatureFlags,
} from '../services/coownFeatureFlags';

/**
 * useCoOwnFeatureFlags — React hook for consuming Co-Own feature flags.
 *
 * Returns the current flags and re-renders when flags change.
 */
export function useCoOwnFeatureFlags(): CoOwnFeatureFlags {
  const [flags, setFlags] = useState<CoOwnFeatureFlags>(getCoOwnFlags);

  useEffect(() => {
    return subscribeToFlagChanges(setFlags);
  }, []);

  return flags;
}
