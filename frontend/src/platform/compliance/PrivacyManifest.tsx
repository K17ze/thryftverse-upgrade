/**
 * Third-party SDK privacy manifest.
 *
 * Verifies and displays the privacy practices of all third-party SDKs
 * installed in the app. Used in Settings → Privacy → Third-party SDKs.
 *
 * The manifest is generated from the frontend's `package.json` dependencies
 * and cross-referenced with a static privacy manifest that documents each
 * SDK's data collection practices, tracking status, and privacy policy URL.
 *
 * @example
 * ```tsx
 * import { PrivacyManifest, getInstalledSDKs } from '../platform/compliance';
 *
 * const sdks = getInstalledSDKs();
 * <PrivacyManifest sdks={sdks} />
 * ```
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  AccessibilityRole,
  Linking,
} from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface SDKPrivacyEntry {
  /** npm package name. */
  name: string;
  /** Installed version. */
  version: string;
  /** Human-readable description of what the SDK does. */
  description: string;
  /** Categories of data collected by the SDK. */
  dataCollected: string[];
  /** Whether the SDK performs cross-app tracking. */
  trackingEnabled: boolean;
  /** URL to the SDK provider's privacy policy. */
  privacyUrl: string;
}

/**
 * Static privacy manifest mapping known SDK package names to their privacy
 * practices. SDKs not listed here are reported as "unverified" and should
 * be audited before the next release.
 */
const STATIC_MANIFEST: Record<string, Omit<SDKPrivacyEntry, 'name' | 'version'>> = {
  '@sentry/react-native': {
    description: 'Crash reporting and performance monitoring',
    dataCollected: ['Device ID', 'Crash data', 'Performance metrics', 'IP address'],
    trackingEnabled: false,
    privacyUrl: 'https://sentry.io/privacy/',
  },
  'posthog-react-native': {
    description: 'Product analytics and feature flags',
    dataCollected: ['Anonymous device ID', 'App usage events', 'Screen views'],
    trackingEnabled: false,
    privacyUrl: 'https://posthog.com/privacy',
  },
  '@stripe/stripe-react-native': {
    description: 'Payment processing',
    dataCollected: ['Payment method data', 'Transaction data'],
    trackingEnabled: false,
    privacyUrl: 'https://stripe.com/privacy',
  },
  '@intercom/intercom-react-native': {
    description: 'Customer support messaging',
    dataCollected: ['User ID', 'Email', 'Chat messages', 'Device info'],
    trackingEnabled: false,
    privacyUrl: 'https://www.intercom.com/privacy',
  },
  '@livekit/react-native': {
    description: 'Real-time video and audio streaming',
    dataCollected: ['Stream metadata', 'Connection info'],
    trackingEnabled: false,
    privacyUrl: 'https://livekit.io/privacy',
  },
  '@react-native-async-storage/async-storage': {
    description: 'Local key-value storage (legacy)',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://reactnative.dev/docs/asyncstorage',
  },
  '@react-native-community/netinfo': {
    description: 'Network connectivity detection',
    dataCollected: ['Network type', 'Connection status'],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/react-native-netinfo/react-native-netinfo',
  },
  '@shopify/flash-list': {
    description: 'High-performance list rendering',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://shopify.github.io/flash-list/',
  },
  '@shopify/react-native-skia': {
    description: 'GPU-accelerated 2D graphics rendering',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://shopify.github.io/react-native-skia/',
  },
  'react-native-mmkv': {
    description: 'High-performance synchronous key-value storage',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/mrousavy/react-native-mmkv',
  },
  'react-native-vision-camera': {
    description: 'Camera access for photo and video capture',
    dataCollected: ['Camera frames (user-initiated only)'],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/mrousavy/react-native-vision-camera',
  },
  'react-native-vision-camera-mlkit': {
    description: 'On-device ML Kit barcode and text recognition',
    dataCollected: ['Camera frames (on-device, not transmitted)'],
    trackingEnabled: false,
    privacyUrl: 'https://developers.google.com/ml-kit/privacy',
  },
  'react-native-share': {
    description: 'Social sharing of listings and content',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/react-native-community/react-native-share',
  },
  'react-native-haptic-feedback': {
    description: 'Tactile haptic feedback for interactions',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/midasvi/react-native-haptic-feedback',
  },
  'expo-notifications': {
    description: 'Push notification delivery',
    dataCollected: ['Device push token', 'Notification preferences'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-secure-store': {
    description: 'Encrypted secure storage for sensitive data',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-local-authentication': {
    description: 'Biometric authentication (Face ID / Touch ID)',
    dataCollected: ['Biometric auth result (boolean, no biometric data)'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-image': {
    description: 'Optimized image rendering and caching',
    dataCollected: ['Image cache URLs'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-image-picker': {
    description: 'Photo library and camera image selection',
    dataCollected: ['Selected image URIs (user-initiated)'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-image-manipulator': {
    description: 'Image resizing and format conversion',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-clipboard': {
    description: 'System clipboard access',
    dataCollected: ['Clipboard content (user-initiated, ephemeral)'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-network': {
    description: 'Network state inspection',
    dataCollected: ['Network type', 'Connection status'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-asset': {
    description: 'Static asset loading and caching',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-font': {
    description: 'Custom font loading',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-haptics': {
    description: 'Haptic feedback patterns',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-blur': {
    description: 'Native blur view effects',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-linear-gradient': {
    description: 'Linear gradient views',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-file-system': {
    description: 'Local file system access',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-media-library': {
    description: 'Media library access for saving media',
    dataCollected: ['Media library access (user-initiated)'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-video': {
    description: 'Video playback component',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-audio': {
    description: 'Audio recording and playback',
    dataCollected: ['Audio data (user-initiated)'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-web-browser': {
    description: 'In-app browser for external links',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-apple-authentication': {
    description: 'Sign in with Apple',
    dataCollected: ['Apple ID credential (user-initiated)'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-auth-session': {
    description: 'OAuth authentication session handling',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-constants': {
    description: 'App configuration and build constants',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-updates': {
    description: 'Over-the-air update delivery',
    dataCollected: ['Update ID', 'Runtime version'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-localization': {
    description: 'Device locale and region detection',
    dataCollected: ['Device locale'],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-status-bar': {
    description: 'Status bar appearance control',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'expo-splash-screen': {
    description: 'Splash screen display control',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  'qrcode': {
    description: 'QR code generation',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/soldair/node-qrcode',
  },
  'lottie-react-native': {
    description: 'Lottie animation rendering',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://airbnb.io/lottie/',
  },
  'i18next': {
    description: 'Internationalization framework',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://www.i18next.com/',
  },
  'react-i18next': {
    description: 'React bindings for i18next',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://www.i18next.com/',
  },
  'zod': {
    description: 'Type-safe schema validation',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://zod.dev/',
  },
  'zustand': {
    description: 'Lightweight state management',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/pmndrs/zustand',
  },
  '@tanstack/react-query': {
    description: 'Server state management and caching',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://tanstack.com/query/latest/docs/privacy',
  },
  'react-hook-form': {
    description: 'Performant form state management',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://react-hook-form.com/',
  },
  '@hookform/resolvers': {
    description: 'Schema resolvers for react-hook-form',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/react-hook-form/resolvers',
  },
  'victory-native': {
    description: 'Data visualization charts',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://formidable.com/open-source/victory/',
  },
  'react-native-svg': {
    description: 'SVG rendering for React Native',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/react-native-svg/react-native-svg',
  },
  'react-native-reanimated': {
    description: 'Smooth gesture-driven animations',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://docs.swmansion.com/react-native-reanimated/',
  },
  'react-native-gesture-handler': {
    description: 'Native gesture recognition',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://docs.swmansion.com/react-native-gesture-handler/',
  },
  'react-native-screens': {
    description: 'Native screen container optimization',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/software-mansion/react-native-screens',
  },
  'react-native-safe-area-context': {
    description: 'Safe area inset handling',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/th3rdwave/react-native-safe-area-context',
  },
  'react-native-keyboard-controller': {
    description: 'Keyboard interaction management',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://kirillzyusko.github.io/react-native-keyboard-controller/',
  },
  'react-native-shared-hero': {
    description: 'Shared element transitions',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://github.com/Ijzerkist/react-native-shared-hero',
  },
  '@expo/ui': {
    description: 'Expo cross-platform UI components',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  '@expo/vector-icons': {
    description: 'Icon font rendering',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
  '@expo-google-fonts/inter': {
    description: 'Inter font family',
    dataCollected: [],
    trackingEnabled: false,
    privacyUrl: 'https://expo.dev/privacy',
  },
};

/**
 * Reads the frontend package.json and returns a list of installed SDKs
 * with their privacy practices. SDKs not found in the static manifest
 * are marked as "unverified" with an empty data collection list.
 *
 * This function is safe to call at module load time — it reads the
 * package.json synchronously and falls back to an empty list if the
 * file is unavailable.
 */
export function getInstalledSDKs(): SDKPrivacyEntry[] {
  let pkg: { dependencies?: Record<string, string> };
  try {
    pkg = require('../../../package.json');
  } catch {
    return [];
  }

  const dependencies = pkg.dependencies ?? {};
  const entries: SDKPrivacyEntry[] = [];

  for (const [name, version] of Object.entries(dependencies)) {
    const known = STATIC_MANIFEST[name];
    if (known) {
      entries.push({ name, version, ...known });
    } else {
      entries.push({
        name,
        version,
        description: 'Unverified — privacy practices not yet documented',
        dataCollected: [],
        trackingEnabled: false,
        privacyUrl: '',
      });
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

export interface PrivacyManifestProps {
  /** List of SDK privacy entries to display. */
  sdks?: SDKPrivacyEntry[];
}

export function PrivacyManifest({
  sdks,
}: PrivacyManifestProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const resolvedSdks = useMemo(() => sdks ?? getInstalledSDKs(), [sdks]);

  const trackingSdks = useMemo(
    () => resolvedSdks.filter((s) => s.trackingEnabled),
    [resolvedSdks],
  );
  const unverifiedSdks = useMemo(
    () => resolvedSdks.filter((s) => s.privacyUrl === ''),
    [resolvedSdks],
  );

  const listRole: AccessibilityRole = 'list';

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    summary: {
      paddingHorizontal: Space.lg,
      paddingTop: 20,
      paddingBottom: Space.md,
    },
    summaryText: {
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textSecondary,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
    },
    summaryBold: {
      fontWeight: '600',
      color: colors.textPrimary,
    },
    warningBanner: {
      backgroundColor: colors.warningSubtle,
      marginHorizontal: Space.lg,
      borderRadius: Radius.lg,
      padding: 14,
      marginBottom: 8,
    },
    warningText: {
      fontSize: TypographyV2.body.size,
      color: colors.warning,
    },
    sdkCard: {
      paddingHorizontal: Space.lg,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    sdkName: {
      fontSize: TypographyV2.body.size,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    sdkVersion: {
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      marginBottom: 6,
    },
    sdkDescription: {
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      lineHeight: TypographyV2.body.lineHeight,
      marginBottom: 8,
    },
    dataLabel: {
      fontSize: TypographyV2.meta.size,
      fontWeight: '500',
      color: colors.textMuted,
      marginBottom: 6,
    },
    dataChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      marginRight: 6,
      marginBottom: 4,
    },
    chipText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
    },
    noDataText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    trackingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    trackingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.warning,
      marginRight: 6,
    },
    trackingText: {
      fontSize: TypographyV2.meta.size,
      color: colors.warning,
      fontWeight: '500',
    },
    privacyLink: {
      fontSize: TypographyV2.body.size,
      color: colors.brand,
      marginTop: 8,
    },
  });

  return (
    <ScrollView
      style={styles.container}
      accessible
      accessibilityRole={listRole}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          <Text style={styles.summaryBold}>{resolvedSdks.length}</Text> third-party
          SDKs are installed in ThryftVerse.
          {trackingSdks.length > 0 && (
            <Text style={styles.summaryBold}>
              {' '}{trackingSdks.length} perform cross-app tracking.
            </Text>
          )}
        </Text>
      </View>

      {unverifiedSdks.length > 0 && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            {unverifiedSdks.length} SDK(s) have unverified privacy practices.
            Audit them before the next release.
          </Text>
        </View>
      )}

      {resolvedSdks.map((sdk) => (
        <View key={`${sdk.name}@${sdk.version}`} style={styles.sdkCard}>
          <Text style={styles.sdkName}>{sdk.name}</Text>
          <Text style={styles.sdkVersion}>v{sdk.version}</Text>
          <Text style={styles.sdkDescription}>{sdk.description}</Text>

          <Text style={styles.dataLabel}>Data collected:</Text>
          {sdk.dataCollected.length > 0 ? (
            <View style={styles.dataChipRow}>
              {sdk.dataCollected.map((d) => (
                <View key={d} style={styles.chip}>
                  <Text style={styles.chipText}>{d}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noDataText}>No data collected</Text>
          )}

          {sdk.trackingEnabled && (
            <View style={styles.trackingBadge}>
              <View style={styles.trackingDot} />
              <Text style={styles.trackingText}>Cross-app tracking enabled</Text>
            </View>
          )}

          {sdk.privacyUrl ? (
            <Pressable
              onPress={() => Linking.openURL(sdk.privacyUrl)}
              accessible
              accessibilityRole="link"
              accessibilityLabel={`Privacy policy for ${sdk.name}`}
            >
              <Text style={styles.privacyLink}>Privacy policy ›</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
