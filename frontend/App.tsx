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
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as Network from 'expo-network';
import { View, ActivityIndicator, Text, TextInput, Alert } from 'react-native';
import { ActiveTheme, Colors } from './src/constants/colors';
import { ToastProvider } from './src/context/ToastContext';
import { TabScrollProvider } from './src/context/TabScrollContext';
import { CurrencyProvider } from './src/context/CurrencyContext';
import { BackendDataProvider } from './src/context/BackendDataContext';
import { SettingsPreferencesProvider } from './src/context/SettingsPreferencesContext';
import { AccessibilityPreferencesProvider } from './src/context/AccessibilityPreferencesContext';
import { ToastContainer } from './src/components/Toast';
import { AppErrorBoundary, initSentry, installGlobalErrorHandler, ObserveRoot, markInteractive, Sentry, registerSentryNavigationContainer } from './src/platform/monitoring';
import { registerAppNavigationRef } from './src/platform/monitoring/appNavigation';
import { KeyboardProvider } from './src/platform/keyboard';
import { ServerStateProvider, useMobileQueryLifecycle } from './src/platform/server';
import { BrandedSplash } from './src/components/BrandedSplash';
import { Typography } from './src/theme/designTokens';
import { ThemeProvider } from './src/theme/ThemeContext';
import {
  applyThemePreference,
  getStoredThemePreference,
  subscribeThemePreferenceChange,
} from './src/theme/themePreference';
import { restoreAuthSession } from './src/services/authApi';
import { useStore } from './src/store/useStore';
import { joinGroupByInviteOnApi } from './src/services/chatApi';
import { parseApiError } from './src/lib/apiClient';
import { useOfflineQueue } from './src/lib/offlineQueue';
import { getStoredProfileMedia } from './src/preferences/profileMediaPreferences';
import { getStoredAuthSnapshot } from './src/preferences/authSnapshot';
import type { RootStackParamList } from './src/navigation/types';
import { extractGroupInviteToken } from './src/utils/groupInviteLink';
import { linking } from './src/navigation/linking';
import { usePushNotificationTap, setNavigationReady } from './src/hooks/usePushNotificationTap';
import { useUnreadNotificationCount } from './src/hooks/useUnreadNotificationCount';
import { trackScreenView } from './src/lib/telemetry';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Keep app startup resilient even if splash API rejects.
});

initSentry();

// Wrap React Native's default global JS error handler so uncaught errors are
// logged and forwarded to Sentry, while preserving the dev redbox and native
// crash reporting behaviour. Idempotent — safe to call once at startup.
installGlobalErrorHandler();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

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
    allowFontScaling: false,
    maxFontSizeMultiplier: 1.06,
    style: [textDefaultProps.style, { fontFamily: textFamily, letterSpacing: 0 }],
  };

  const inputDefaultProps = (TextInput as any).defaultProps ?? {};
  (TextInput as any).defaultProps = {
    ...inputDefaultProps,
    allowFontScaling: false,
    maxFontSizeMultiplier: 1.04,
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

  const [fontsLoaded, fontLoadError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
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

  React.useEffect(() => {
    const unsubscribe = subscribeThemePreferenceChange(() => {
      setThemeTick((value) => value + 1);
    });

    return unsubscribe;
  }, []);

  React.useEffect(() => {
    let mounted = true;

    const initializeAppBootstrapState = async () => {
      const preference = await getStoredThemePreference();
      applyThemePreference(preference);

      const [storedProfileMedia, localAuthSnapshot] = await Promise.all([
        getStoredProfileMedia(),
        getStoredAuthSnapshot(),
      ]);

      const store = useStore.getState();

      if (localAuthSnapshot?.user) {
        store.login(localAuthSnapshot.user);
        store.setTwoFactorEnabled(localAuthSnapshot.twoFactorEnabled);
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
          <KeyboardProvider>
          <ServerStateProvider>
            <ToastProvider>
              <BackendDataProvider>
                <CurrencyProvider>
                  <SettingsPreferencesProvider>
                    <TabScrollProvider>
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
                        {ThemeReadyNavigator ? <ThemeReadyNavigator /> : null}
                      </NavigationContainer>
                    </TabScrollProvider>
                  </SettingsPreferencesProvider>
                </CurrencyProvider>
              </BackendDataProvider>
              <ToastContainer />
            </ToastProvider>
          </ServerStateProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
    </ThemeProvider>
    </AccessibilityPreferencesProvider>
  );
}