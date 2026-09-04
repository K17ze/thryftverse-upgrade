import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme, Theme, createNavigationContainerRef } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Inter_300Light,
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { Caveat_400Regular } from '@expo-google-fonts/caveat';
import { DancingScript_400Regular } from '@expo-google-fonts/dancing-script';
import { Lobster_400Regular } from '@expo-google-fonts/lobster';
import { Pacifico_400Regular } from '@expo-google-fonts/pacifico';
import { PlayfairDisplay_400Regular, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { loadAsync as fontLoadAsync } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { View, ActivityIndicator, Text, TextInput, Alert, AppState } from 'react-native';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { ActiveTheme, Colors, DARK_COLORS, LIGHT_COLORS } from './src/constants/colors';
import { ToastProvider } from './src/context/ToastContext';
import { TabScrollProvider } from './src/context/TabScrollContext';
import { CurrencyProvider } from './src/context/CurrencyContext';
import { BackendDataProvider } from './src/context/BackendDataContext';
import { SettingsPreferencesProvider } from './src/context/SettingsPreferencesContext';
import { AccessibilityPreferencesProvider } from './src/context/AccessibilityPreferencesContext';
import { TaxonomyProvider } from './src/context/TaxonomyContext';
import { ToastContainer, PushSoftAskOverlay } from './src/components/Toast';
import { UpdateManager } from './src/platform/updates';
import { AppErrorBoundary, initSentry, installGlobalErrorHandler, ObserveRoot, markInteractive, Sentry, registerSentryNavigationContainer } from './src/platform/monitoring';
import { registerAppNavigationRef } from './src/platform/monitoring/appNavigation';
import { KeyboardProvider } from './src/platform/keyboard';
import { ServerStateProvider, useMobileQueryLifecycle } from './src/platform/server';
import { RealtimeProvider } from './src/platform/realtime';
import { PostHogProvider } from './src/analytics/PostHogProvider';
import { SupportProvider } from './src/platform/support';
import { BrandedSplash } from './src/components/BrandedSplash';
import { Typography } from './src/theme/designTokens';
import { ThemeProvider } from './src/theme/ThemeContext';
import {
  applyThemePreference,
  getStoredThemePreference,
  subscribeThemePreferenceChange,
} from './src/theme/themePreference';
import { restoreAuthSession } from './src/services/authApi';
import { resumeCreatorUploads } from './src/creator/core/upload';
import { useStore } from './src/store/useStore';
import { joinGroupByInviteOnApi } from './src/services/chatApi';
import { initChatOutboxDrain, drainChatOutbox } from './src/services/chatOutbox';
import { initOutboxDrain } from './src/storage/outboxClient';
import { runSync, type SyncDomain } from './src/storage/syncEngine';
import { parseApiError } from './src/lib/apiClient';
import { useOfflineQueue } from './src/lib/offlineQueue';
import { getStoredProfileMedia } from './src/preferences/profileMediaPreferences';
import { getStoredAuthSnapshot } from './src/preferences/authSnapshot';
import { getStoredSettingsPreferences } from './src/preferences/settingsPreferences';
import type { RootStackParamList } from './src/navigation/types';
import { extractGroupInviteToken } from './src/utils/groupInviteLink';
import { initializeSslPinning } from './src/utils/sslPinning';
import { linking } from './src/navigation/linking';
import { SignupWallProvider } from './src/hooks/useSignupWall';
import { usePushNotificationTap, setNavigationReady } from './src/hooks/usePushNotificationTap';
import { useUnreadNotificationCount } from './src/hooks/useUnreadNotificationCount';
import { usePushTokenCleanup } from './src/hooks/usePushTokenCleanup';
import { useDeepLinkAuth } from './src/hooks/useDeepLinkAuth';
import { useScreenshotTracking } from './src/platform/screenCapture';
import { trackScreenView } from './src/lib/telemetry';
import { trackScreenChange } from './src/analytics/useScreenTracking';
import { auditColorContrast } from './src/utils/accessibilityAudit';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Keep app startup resilient even if splash API rejects.
});

initSentry();

// Wrap React Native's default global JS error handler so uncaught errors are
// logged and forwarded to Sentry, while preserving the dev redbox and native
// crash reporting behaviour. Idempotent — safe to call once at startup.
installGlobalErrorHandler();

// ──────────────────────────────────────────────────────────────────────────
// Foreground notification presentation
// ----------------------------------------------------------------------------
// `setNotificationHandler` MUST be configured at module level (outside any
// React component) so expo-notifications can consult it before the first
// component mounts. Without it, notifications delivered while the app is in
// the foreground are silently dropped — no alert, no banner, no sound.
//
// Presentation is driven by the notification's `eventType` payload field:
//   - Actionable events (auction outbid/won, order lifecycle, chat, payouts,
//     resolution) interrupt with a sound, badge update, and high priority.
//   - Low-priority "generic" / news notifications present silently with a
//     default priority so they don't pull the user's attention away from the
//     foreground task.
//
// The brand accent colour for notification chrome is applied via the
// navigation theme (`notification: Colors.danger`) and the Android
// notification channel colour — `NotificationBehavior` itself exposes no
// colour field, so the brand token is referenced here for documentation.
// ──────────────────────────────────────────────────────────────────────────
const ACTIONABLE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'auction_outbid',
  'auction_won',
  'auction_ending_soon',
  'order_created',
  'order_paid',
  'order_dispatched',
  'order_delivered',
  'order_cancelled',
  'order_refunded',
  'resolution_opened',
  'resolution_status_changed',
  'chat_message',
  'payout_processed',
  'refund_completed',
]);

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
    const eventType = typeof data.eventType === 'string' ? data.eventType : null;
    const isActionable = eventType ? ACTIONABLE_EVENT_TYPES.has(eventType) : false;
    const isGeneric = eventType === null || eventType === 'generic';

    return {
      // iOS: present an alert banner; Android: show the heads-up banner.
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      // Sound only for actionable categories — silent for generic/news so the
      // foreground experience stays calm.
      shouldPlaySound: isActionable,
      // Badge updates for everything except generic news pings.
      shouldSetBadge: !isGeneric,
      // Android priority: HIGH interrupts with a heads-up; DEFAULT respects
      // the channel's importance without forcing a peek.
      priority: isActionable
        ? Notifications.AndroidNotificationPriority.HIGH
        : Notifications.AndroidNotificationPriority.DEFAULT,
    };
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Notification action categories — interactive buttons on notifications.
// ----------------------------------------------------------------------------
// G5: Per-type iOS notification categories so the OS presents inline action
// buttons relevant to the event type, not just chat messages.
// ──────────────────────────────────────────────────────────────────────────

// Message category: Reply + Mark as read
Notifications.setNotificationCategoryAsync('message', [
  {
    identifier: 'reply',
    buttonTitle: 'Reply',
    options: { opensAppToForeground: false },
  },
  {
    identifier: 'mark_as_read',
    buttonTitle: 'Mark as read',
    options: { opensAppToForeground: false, isDestructive: false },
  },
]).catch(() => { /* best-effort */ });

// Order category: Track order + Mark as read
Notifications.setNotificationCategoryAsync('order', [
  {
    identifier: 'track_order',
    buttonTitle: 'Track',
    options: { opensAppToForeground: true },
  },
  {
    identifier: 'mark_as_read',
    buttonTitle: 'Mark as read',
    options: { opensAppToForeground: false, isDestructive: false },
  },
]).catch(() => { /* best-effort */ });

// Auction category: View bid + Dismiss
Notifications.setNotificationCategoryAsync('auction', [
  {
    identifier: 'view_bid',
    buttonTitle: 'View',
    options: { opensAppToForeground: true },
  },
  {
    identifier: 'mark_as_read',
    buttonTitle: 'Dismiss',
    options: { opensAppToForeground: false, isDestructive: false },
  },
]).catch(() => { /* best-effort */ });

// Social category: View + Mark as read
Notifications.setNotificationCategoryAsync('social', [
  {
    identifier: 'view',
    buttonTitle: 'View',
    options: { opensAppToForeground: true },
  },
  {
    identifier: 'mark_as_read',
    buttonTitle: 'Mark as read',
    options: { opensAppToForeground: false, isDestructive: false },
  },
]).catch(() => { /* best-effort */ });

const navigationRef = createNavigationContainerRef<RootStackParamList>();

let lastListingDraftSyncAt = 0;
const LISTING_DRAFT_SYNC_MIN_INTERVAL_MS = 60_000;

function runSyncListingDraft(): void {
  const now = Date.now();
  if (now - lastListingDraftSyncAt < LISTING_DRAFT_SYNC_MIN_INTERVAL_MS) {
    return;
  }
  lastListingDraftSyncAt = now;
  const domain: SyncDomain = 'listing_draft';
  runSync(domain).catch(() => undefined);
}

let globalTypographyApplied = false;

function applyGlobalTypographyDefaults(useInterFonts: boolean) {
  if (globalTypographyApplied) {
    return;
  }

  globalTypographyApplied = true;

  const textFamily = useInterFonts ? Typography.family.regular : undefined;
  const inputFamily = useInterFonts ? Typography.family.medium : undefined;

  const textDefaultProps = (Text as any).defaultProps ?? {};
  (Text as any).defaultProps = {
    ...textDefaultProps,
    allowFontScaling: true,
    maxFontSizeMultiplier: 1.35,
    style: [textDefaultProps.style, { fontFamily: textFamily, letterSpacing: 0 }],
  };

  const inputDefaultProps = (TextInput as any).defaultProps ?? {};
  (TextInput as any).defaultProps = {
    ...inputDefaultProps,
    allowFontScaling: true,
    maxFontSizeMultiplier: 1.35,
    selectionColor: Colors.brand,
    style: [inputDefaultProps.style, { fontFamily: inputFamily, letterSpacing: 0 }],
  };
}

export default function App() {
  useMobileQueryLifecycle();
  const [showBrandedSplash, setShowBrandedSplash] = React.useState(true);
  const [bootTimedOut, setBootTimedOut] = React.useState(false);
  const [themeInitialized, setThemeInitialized] = React.useState(false);
  const [ThemeReadyNavigator, setThemeReadyNavigator] = React.useState<React.ComponentType | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = React.useState<string | null>(null);
  const [isJoiningInvite, setIsJoiningInvite] = React.useState(false);
  const [queuedConversationId, setQueuedConversationId] = React.useState<string | null>(null);
  const [, setThemeTick] = React.useState(0);
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const upsertConversation = useStore((state) => state.upsertConversation);

  usePushNotificationTap();
  useUnreadNotificationCount();
  usePushTokenCleanup();
  // Authentication-aware deep-link redirect: intercepts auth-required deep
  // links when the user is unauthenticated, stores the intended destination,
  // and replays it after a successful login. See DEEP_LINK_INVENTORY.md.
  useDeepLinkAuth();
  // Detect screenshots on non-protected screens and report them to analytics.
  // Protected screens block screenshots at the OS level, so this listener only
  // fires on surfaces where tracking (not blocking) is the desired behaviour.
  useScreenshotTracking();

  // Performance: only block first paint on the Inter family (used on every
  // screen from boot). The 8 display fonts below are used exclusively in the
  // Creator canvas/text tools, which the user always navigates to after the
  // first paint. Loading them lazily after appReady removes ~8 font decode
  // operations from the critical cold-start path and directly reduces the
  // "Skipped 185 frames" jank observed on cold start.
  const [fontsLoaded, fontLoadError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      setBootTimedOut(true);
    }, 4500);

    return () => clearTimeout(timeoutId);
  }, []);

  // Performance: mark the app as interactive as early as possible so Sentry
  // and EAS Observe can correlate the TTI metric. The first markInteractive()
  // call wins; later calls are ignored. A Sentry breadcrumb is also recorded
  // so the timestamp is visible in the event timeline.
  React.useEffect(() => {
    try {
      if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
        performance.mark('app:interactive');
      }
    } catch {
      // performance API may be unavailable on some platforms.
    }

    Sentry.addBreadcrumb?.({
      category: 'performance',
      message: 'App interactive',
      level: 'info',
      data: { timestamp: Date.now() },
    });

    markInteractive({ surface: 'app_mounted' });
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Dev-only WCAG 2.2 contrast audit at boot.
  // ----------------------------------------------------------------------------
  // Audits the critical text-on-surface color pairs for both base and
  // high-contrast palettes in both themes. Fails are logged to console.error
  // so they surface during development. No-op in production — the function
  // itself returns early when __DEV__ is false.
  // ──────────────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!__DEV__) return;

    const basePairs = [
      // Dark base palette — textMuted must clear 4.5:1 on surface/surfaceAlt
      { name: 'dark.textMuted/surface', foreground: DARK_COLORS.textMuted, background: DARK_COLORS.surface },
      { name: 'dark.textMuted/surfaceAlt', foreground: DARK_COLORS.textMuted, background: DARK_COLORS.surfaceAlt },
      { name: 'dark.textMuted/background', foreground: DARK_COLORS.textMuted, background: DARK_COLORS.background },
      { name: 'dark.textSecondary/surface', foreground: DARK_COLORS.textSecondary, background: DARK_COLORS.surface },
      // Light base palette
      { name: 'light.textMuted/surface', foreground: LIGHT_COLORS.textMuted, background: LIGHT_COLORS.surface },
      { name: 'light.textMuted/surfaceAlt', foreground: LIGHT_COLORS.textMuted, background: LIGHT_COLORS.surfaceAlt },
      { name: 'light.textMuted/background', foreground: LIGHT_COLORS.textMuted, background: LIGHT_COLORS.background },
      { name: 'light.textSecondary/surface', foreground: LIGHT_COLORS.textSecondary, background: LIGHT_COLORS.surface },
    ];

    auditColorContrast(basePairs, 'App.boot');
  }, []);

  // P0.14: Mount the application-owned chat outbox drain. NetInfo reconnects
  // flush pending messages; an AppState listener re-drains on foreground.
  React.useEffect(() => {
    resumeCreatorUploads().catch(() => undefined);
    initChatOutboxDrain();
    drainChatOutbox().catch(() => undefined);
    initOutboxDrain();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        resumeCreatorUploads().catch(() => undefined);
        drainChatOutbox().catch(() => undefined);
        runSyncListingDraft();
      }
    });
    return () => subscription.remove();
  }, []);

  React.useEffect(() => {
    const unsubscribe = subscribeThemePreferenceChange(() => {
      setThemeTick((value) => value + 1);
    });

    return unsubscribe;
  }, []);

  React.useEffect(() => {
    let mounted = true;

    const initializeAppBootstrapState = async () => {
      // Initialise SSL public-key pinning before any network request so every
      // HTTPS connection (fetch, Axios, image loaders) is validated against
      // the pinned keys once the native module is installed. Safe to call in
      // dev — it no-ops when the module is absent and never throws.
      try {
        await initializeSslPinning();
      } catch {
        // Pinning init must never block app startup.
      }

      const preference = await getStoredThemePreference();
      applyThemePreference(preference);

      const [storedProfileMedia, localAuthSnapshot, storedSettings] = await Promise.all([
        getStoredProfileMedia(),
        getStoredAuthSnapshot(),
        getStoredSettingsPreferences(),
      ]);

      const store = useStore.getState();

      if (localAuthSnapshot?.user) {
        // When biometric login is enabled, restore the user into the store
        // (so the navigator knows they are authenticated) but set the
        // pending flag so AppNavigator shows BiometricLogin as the initial
        // route instead of MainTabs. The BiometricLogin screen clears the
        // flag after a successful Face ID / Touch ID prompt.
        if (storedSettings.biometricLoginEnabled) {
          store.setBiometricLoginPending(true);
        }
        store.login(localAuthSnapshot.user);
        store.setTwoFactorEnabled(localAuthSnapshot.twoFactorEnabled);
        runSyncListingDraft();
        store.hydrateBlockedUsers().catch(() => undefined);
      }

      if (storedProfileMedia.avatar) {
        store.updateUserAvatar(storedProfileMedia.avatar);
      }

      if (storedProfileMedia.cover) {
        store.updateUserCover(storedProfileMedia.cover);
      }

      store.hydrateProfileMediaOverrides(storedProfileMedia.byUserId);

      if (!mounted) {
        return;
      }

      const navigatorModule = require('./src/navigation/AppNavigator');
      setThemeReadyNavigator(() => navigatorModule.default);
      setThemeInitialized(true);

      restoreAuthSession()
        .then((restoredSession) => {
          if (!restoredSession) {
            return;
          }

          const latestStore = useStore.getState();
          latestStore.login(restoredSession.storeUser);
          latestStore.setTwoFactorEnabled(restoredSession.user.twoFactorEnabled);
          runSyncListingDraft();
          latestStore.hydrateBlockedUsers().catch(() => undefined);
        })
        .catch(() => {
          // Session refresh is best-effort and should not interrupt app usage.
        });
    };

    initializeAppBootstrapState().catch(() => {
      // Bootstrap failures should never block app startup.

      if (!mounted) {
        return;
      }

      const navigatorModule = require('./src/navigation/AppNavigator');
      setThemeReadyNavigator(() => navigatorModule.default);
      setThemeInitialized(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const fontsReady = fontsLoaded || !!fontLoadError || bootTimedOut;
  const appReady = fontsReady && themeInitialized && !!ThemeReadyNavigator;

  // Lazy-load display fonts after the app is interactive so they are
  // available when the user opens the Creator, without blocking boot.
  React.useEffect(() => {
    if (!appReady) return;
    void fontLoadAsync({
      Anton_400Regular,
      BebasNeue_400Regular,
      Caveat_400Regular,
      DancingScript_400Regular,
      Lobster_400Regular,
      Pacifico_400Regular,
      PlayfairDisplay_400Regular,
      PlayfairDisplay_700Bold,
      PressStart2P_400Regular,
    });
  }, [appReady]);

  const processedInviteTokensRef = React.useRef<Set<string>>(new Set());

  // Screen-level performance tracking: emit a Sentry breadcrumb on every
  // navigation state change so screen transitions are visible in the event
  // timeline and correlate with per-screen transactions created by the
  // reactNavigationIntegration.
  const onNavigationStateChange = React.useCallback((state: unknown) => {
    if (!state) {
      return;
    }

    try {
      const currentRoute = navigationRef.getCurrentRoute();
      if (currentRoute?.name) {
        Sentry.addBreadcrumb?.({
          category: 'navigation',
          message: `Navigated to ${currentRoute.name}`,
          level: 'info',
        });

        // Privacy-first screen view tracking — only the route name and
        // non-PII params are recorded. PII keys are stripped by the
        // telemetry module, and the user's analytics opt-out preference
        // is respected inside trackTelemetryEvent.
        const params = currentRoute.params as Record<string, string | number> | undefined;
        trackScreenView(currentRoute.name, params);
        // PostHog screen view tracking — emits a typed `screen_view` event
        // with previous-screen context for funnel/flow analysis. No-op in
        // dev mode (no PostHog API key).
        trackScreenChange(currentRoute);
      }
    } catch {
      // Navigation observability must never crash the app.
    }
  }, []);

  const captureInviteFromUrl = React.useCallback((url: string | null) => {
    if (!url) {
      return false;
    }

    // Only accept our registered scheme or HTTPS universal links
    const lowerUrl = url.toLowerCase();
    if (
      !lowerUrl.startsWith('thryftverse://') &&
      !lowerUrl.startsWith('https://thryftverse.') &&
      !lowerUrl.startsWith('exp://')
    ) {
      return false;
    }

    if (!/group-invite/i.test(url)) {
      return false;
    }

    const inviteToken = extractGroupInviteToken(url);
    if (!inviteToken) {
      return false;
    }

    // Validate token length bounds
    if (inviteToken.length < 8 || inviteToken.length > 260) {
      return false;
    }

    // Prevent re-processing the same token across foreground cycles
    if (processedInviteTokensRef.current.has(inviteToken)) {
      return false;
    }

    processedInviteTokensRef.current.add(inviteToken);
    setPendingInviteToken(inviteToken);
    return true;
  }, []);

  React.useEffect(() => {
    void (async () => {
      const initialUrl = await Linking.getInitialURL();
      captureInviteFromUrl(initialUrl);
    })();

    const subscription = Linking.addEventListener('url', ({ url }) => {
      captureInviteFromUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [captureInviteFromUrl]);

  React.useEffect(() => {
    if (!appReady || !pendingInviteToken || !isAuthenticated || isJoiningInvite) {
      return;
    }

    let cancelled = false;
    setIsJoiningInvite(true);

    void (async () => {
      try {
        const result = await joinGroupByInviteOnApi(pendingInviteToken);

        if (cancelled) {
          return;
        }

        upsertConversation(result.conversation);
        setPendingInviteToken(null);

        if (navigationRef.isReady()) {
          navigationRef.navigate('Chat', {
            conversationId: result.conversation.id,
          });
          // EAS Observe: deep-link navigation has completed and the user has
          // landed on the invite destination. Harmless if TTI was already
          // recorded — only the first markInteractive() call is kept.
          markInteractive({ surface: 'deep_link_invite' });
        } else {
          setQueuedConversationId(result.conversation.id);
        }

        Alert.alert('Group Invite', result.joined ? 'Joined group successfully.' : 'You are already in this group.');
      } catch (error) {
        if (cancelled) {
          return;
        }

        const parsedError = parseApiError(error, 'Unable to join this group invite.');
        Alert.alert('Group Invite', parsedError.message);
        setPendingInviteToken(null);
      } finally {
        if (!cancelled) {
          setIsJoiningInvite(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appReady, isAuthenticated, isJoiningInvite, pendingInviteToken, upsertConversation]);

  React.useEffect(() => {
    if (!appReady) {
      return;
    }

    applyGlobalTypographyDefaults(fontsLoaded);
    SplashScreen.hideAsync().catch(() => {
      // Ignore hide failures and continue rendering app.
    });

    // Offline queue listener
    let networkSub: ReturnType<typeof Network.addNetworkStateListener> | undefined;

    // Initial flush attempt if we boot up and have network
    Network.getNetworkStateAsync().then((state) => {
      if (state.isInternetReachable) {
        useOfflineQueue.getState().flushQueue(fetch);
      }
    });

    networkSub = Network.addNetworkStateListener((state) => {
      if (state.isInternetReachable) {
        useOfflineQueue.getState().flushQueue(fetch);
      }
    });

    return () => {
      if (networkSub && typeof networkSub.remove === 'function') {
        networkSub.remove();
      }
    };
  }, [appReady, fontsLoaded]);

  if (!appReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#090909', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#e8dcc8" />
      </View>
    );
  }

  const baseNavigationTheme = ActiveTheme === 'light' ? DefaultTheme : DarkTheme;

  const premiumNavigationTheme: Theme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      primary: Colors.brand,
      background: Colors.background,
      card: Colors.surface,
      text: Colors.textPrimary,
      border: Colors.border,
      notification: Colors.danger,
    },
    fonts: {
      regular: {
        fontFamily: Typography.family.medium,
        fontWeight: '500' as const,
      },
      medium: {
        fontFamily: Typography.family.semibold,
        fontWeight: '600' as const,
      },
      bold: {
        fontFamily: Typography.family.bold,
        fontWeight: '700' as const,
      },
      heavy: {
        fontFamily: Typography.family.bold,
        fontWeight: '700' as const,
      },
    },
  };

  if (showBrandedSplash) {
    return (
      <AccessibilityPreferencesProvider>
        <ThemeProvider>
          <BrandedSplash
            onFinish={() => {
              setShowBrandedSplash(false);
              // EAS Observe: the branded splash has dismissed and the real app
              // surface is about to mount. The first markInteractive() records
              // the TTI metric; later calls are ignored.
              markInteractive({ surface: 'splash_resolved' });
            }}
          />
        </ThemeProvider>
      </AccessibilityPreferencesProvider>
    );
  }

  return (
    <AccessibilityPreferencesProvider>
    <ThemeProvider>
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <PostHogProvider>
          <SupportProvider>
          <KeyboardProvider>
          <ServerStateProvider>
            <RealtimeProvider>
            <ToastProvider>
              <BackendDataProvider>
                <TaxonomyProvider>
                <CurrencyProvider>
                  <SettingsPreferencesProvider>
                    <TabScrollProvider>
                      {/* Global reduced-motion config — ensures every Reanimated
                          animation respects the device's Reduce Motion setting.
                          Placed at the app root so it covers all child animations. */}
                      <ReducedMotionConfig mode={ReduceMotion.System} />
                      <NavigationContainer
                        ref={navigationRef}
                        theme={premiumNavigationTheme}
                        linking={linking}
                        onStateChange={onNavigationStateChange}
                        onReady={() => {
                          setNavigationReady(true);

                          // Register the navigation container with Sentry's
                          // React Navigation integration so each screen
                          // transition creates a performance transaction.
                          registerSentryNavigationContainer(navigationRef);

                          // EAS Observe: the navigation container is ready and
                          // the user can interact with the real app surface.
                          // This is the primary TTI signal; only the first
                          // markInteractive() call records the metric.
                          markInteractive({ surface: 'navigation_ready' });

                          if (!queuedConversationId) {
                            return;
                          }

                          navigationRef.navigate('Chat', {
                            conversationId: queuedConversationId,
                          });
                          setQueuedConversationId(null);
                        }}
                      >
                        <StatusBar style={ActiveTheme === 'light' ? 'dark' : 'light'} />
                        <SignupWallProvider>
                          {ThemeReadyNavigator ? <ThemeReadyNavigator /> : null}
                        </SignupWallProvider>
                      </NavigationContainer>
                    </TabScrollProvider>
                  </SettingsPreferencesProvider>
                </CurrencyProvider>
                </TaxonomyProvider>
              </BackendDataProvider>
              <ToastContainer />
              <PushSoftAskOverlay />
              <UpdateManager />
            </ToastProvider>
            </RealtimeProvider>
          </ServerStateProvider>
          </KeyboardProvider>
          </SupportProvider>
          </PostHogProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
    </ThemeProvider>
    </AccessibilityPreferencesProvider>
  );
}