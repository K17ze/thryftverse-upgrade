import React, { useEffect } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';

/**
 * CreateCameraScreen — thin redirect shim.
 *
 * Phase 6 Wave 3 merged the standalone CreateCamera route into CreatorStudio,
 * which already ships a CreatorEntryScreen (camera/gallery) built in. The
 * Create tab now navigates directly to CreatorStudio with `openEntry: true`.
 *
 * This screen remains registered in AppNavigator so any legacy callers that
 * still navigate to 'CreateCamera' (e.g. deep links, external code) are
 * transparently forwarded to the unified CreatorStudio flow instead of
 * crashing. It renders nothing and immediately replaces itself.
 *
 * visual-search mode is preserved: it routes to the VisualSearch screen
 * which has its own camera viewfinder and results flow.
 */
export default function CreateCameraScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  useEffect(() => {
    const rawMode = route.params?.mode;

    if (rawMode === 'visual-search') {
      // Visual search has its own dedicated screen with a viewfinder.
      navigation.replace('VisualSearch', undefined);
      return;
    }

    // Only 'look' | 'poster' are valid CreatorStudio types.
    // Default to 'look' for any unrecognised value so the user always
    // lands in a valid studio.
    const type: 'look' | 'poster' = rawMode === 'poster' ? 'poster' : 'look';

    navigation.replace('CreatorStudio', {
      type,
      openEntry: true,
    });
  }, [navigation, route.params?.mode]);

  return null;
}
