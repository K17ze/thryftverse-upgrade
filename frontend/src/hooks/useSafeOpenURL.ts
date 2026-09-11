/**
 * useSafeOpenURL — opens a URL with graceful failure handling.
 *
 * Linking.openURL can reject (no handler, invalid URL, permission denied).
 * This hook catches that failure and offers a "Copy link" fallback so the
 * user is never left with an unhandled promise rejection and no recourse.
 *
 * Returns a stable callback that can be dropped into any onPress handler.
 */
import { useCallback } from 'react';
import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useToast } from '../context/ToastContext';
import { useHaptic } from './useHaptic';

export function useSafeOpenURL() {
  const { show } = useToast();
  const haptic = useHaptic();

  return useCallback(
    async (url: string, contextLabel?: string) => {
      const supported = await Linking.canOpenURL(url).catch(() => false);
      if (!supported) {
        haptic.error();
        try {
          await Clipboard.setStringAsync(url);
          show(
            contextLabel
              ? `Cannot open "${contextLabel}" — link copied to clipboard`
              : 'Cannot open link — copied to clipboard',
            'info',
          );
        } catch {
          show('Unable to open or copy this link', 'error');
        }
        return;
      }
      try {
        await Linking.openURL(url);
      } catch {
        haptic.error();
        try {
          await Clipboard.setStringAsync(url);
          show(
            contextLabel
              ? `Could not open "${contextLabel}" — link copied to clipboard`
              : 'Could not open link — copied to clipboard',
            'info',
          );
        } catch {
          show('Unable to open this link. Please try again.', 'error');
        }
      }
    },
    [show, haptic],
  );
}
