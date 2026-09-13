import { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { LookApiItem } from '../../services/looksApi';
import type { HydratedLookTag } from '../../components/look/LookHotspots';
import { tagToReference } from '../../components/lookdetail/tagToReference';
import { openProductDetail } from '../../platform/product/openProductDetail';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';
import { useAnalyticsEvent } from '../useAnalyticsEvent';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface UseLookInspectResult {
  /** The tag currently shown in the tap-to-inspect sheet, or null. */
  inspectTag: HydratedLookTag | null;
  closeInspect: () => void;
  /** Hotspot tap — opens the inspect sheet (never navigates directly). */
  handleTagTap: (tag: HydratedLookTag) => void;
  /** "View details" confirmation — navigates to the canonical product detail. */
  handleViewDetails: () => void;
}

/**
 * Owns the tap-to-inspect domain: the inspect-sheet tag state plus the
 * hotspot-tap and view-details handlers. Navigation to the canonical
 * product detail only happens when the user confirms "View details".
 */
export function useLookInspect(look: LookApiItem | null): UseLookInspectResult {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const analyticsEvent = useAnalyticsEvent();

  const [inspectTag, setInspectTag] = useState<HydratedLookTag | null>(null);
  const closeInspect = useCallback(() => setInspectTag(null), []);

  // Tap-to-inspect: open the bottom sheet first. Navigation to the canonical
  // product detail only happens when the user confirms "View details".
  const handleTagTap = useCallback(
    (tag: HydratedLookTag) => {
      haptic.light();
      const ref = tagToReference(tag, look?.id ?? '');
      if (!ref) {
        // No id to navigate on — surface an honest message instead of a dead tap.
        show('This tag has no product attached', 'info');
        return;
      }
      setInspectTag(tag);
    },
    [haptic, look, show]
  );

  const handleViewDetails = useCallback(() => {
    if (!inspectTag || !look) return;
    const ref = tagToReference(inspectTag, look.id);
    setInspectTag(null);
    if (ref) {
      analyticsEvent.productClick('look', look.id, { surface: 'look_detail', ownerId: look.creatorId });
      openProductDetail(navigation, ref);
    } else {
      show('This item is no longer available', 'info');
    }
  }, [inspectTag, look, navigation, show, analyticsEvent]);

  return { inspectTag, closeInspect, handleTagTap, handleViewDetails };
}
