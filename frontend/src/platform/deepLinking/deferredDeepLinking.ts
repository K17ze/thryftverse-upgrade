/**
 * Deferred deep linking adapter.
 *
 * Deferred deep links survive app install: a user clicks a link, installs
 * the app, and opens it for the first time — the deep link is then
 * delivered to the freshly installed app. This adapter normalises the
 * interface across providers (Branch.io, AppsFlyer) so the rest of the app
 * can consume deferred links without coupling to a specific SDK.
 *
 * The active provider is selected via the `EXPO_PUBLIC_DEFERRED_DEEPLINK_PROVIDER`
 * environment variable:
 *  - `'branch'`     — Branch.io (lazy-loads `expo-branch` or `react-native-branch`).
 *  - `'appsflyer'`  — AppsFlyer (lazy-loads `react-native-appsflyer`).
 *  - `'none'`       — (default) no deferred deep linking; all functions are no-ops.
 *
 * All provider loading is dynamic (`import()`) and cached. Every function
 * degrades gracefully: if the provider SDK is missing or initialisation
 * fails, the function resolves to `null` / no-op rather than throwing.
 *
 * ── Branch.io setup ──
 *  1. `npx expo install expo-branch` (or `react-native-branch` for bare workflows).
 *  2. Set `EXPO_PUBLIC_DEFERRED_DEEPLINK_PROVIDER=branch` in your environment.
 *  3. Configure the Branch key in `app.json` under `expo.extra.branch.key`.
 *  4. Add the Branch domains to the Universal Links / App Links entitlements.
 *
 * ── AppsFlyer setup ──
 *  1. `npx expo install react-native-appsflyer`.
 *  2. Set `EXPO_PUBLIC_DEFERRED_DEEPLINK_PROVIDER=appsflyer` in your environment.
 *  3. Configure the AppsFlyer dev key in `app.json` under
 *     `expo.extra.appsflyer.devKey`.
 *  4. Add the AppsFlyer OneLink domains to the Universal Links / App Links
 *     entitlements.
 */

type DeferredDeepLinkProvider = 'branch' | 'appsflyer' | 'none';

interface InitializeOptions {
  onLinkReceived: (url: string) => void;
  onInstallAttribution: (data: Record<string, unknown>) => void;
}

interface DeferredDeepLinkProviderModule {
  initialize: (options: InitializeOptions) => Promise<void>;
  getPendingDeferredLink: () => Promise<string | null>;
  checkInstallAttribution: () => Promise<Record<string, unknown> | null>;
}

const noopProvider: DeferredDeepLinkProviderModule = {
  initialize: () => Promise.resolve(),
  getPendingDeferredLink: () => Promise.resolve(null),
  checkInstallAttribution: () => Promise.resolve(null),
};

let providerCache: DeferredDeepLinkProviderModule | null = null;
let providerLoadPromise: Promise<DeferredDeepLinkProviderModule> | null = null;

function getConfiguredProvider(): DeferredDeepLinkProvider {
  const raw = process.env.EXPO_PUBLIC_DEFERRED_DEEPLINK_PROVIDER;
  if (raw === 'branch' || raw === 'appsflyer') {
    return raw;
  }
  return 'none';
}

async function loadBranchProvider(): Promise<DeferredDeepLinkProviderModule> {
  try {
    const mod = await import('expo-branch');
    const Branch = mod.default ?? mod;
    const subscribe = Branch.subscribe ?? Branch.addListener;

    return {
      initialize: ({ onLinkReceived, onInstallAttribution }) =>
        new Promise<void>((resolve) => {
          if (subscribe) {
            subscribe((params) => {
              if (params.error) return;
              const url = params.url;
              if (typeof url === 'string' && url.length > 0) {
                pendingLink = url;
                onLinkReceived(url);
              }
              onInstallAttribution(params as Record<string, unknown>);
            });
          }
          resolve();
        }),
      getPendingDeferredLink: async () => pendingLink,
      checkInstallAttribution: async () => {
        if (Branch.getLatestReferringParams) {
          try {
            return await Branch.getLatestReferringParams();
          } catch {
            return null;
          }
        }
        return null;
      },
    };
  } catch {
    return noopProvider;
  }
}

async function loadAppsFlyerProvider(): Promise<DeferredDeepLinkProviderModule> {
  try {
    const mod = await import('react-native-appsflyer');
    const AppsFlyer = mod.default ?? mod;

    return {
      initialize: ({ onLinkReceived, onInstallAttribution }) =>
        new Promise<void>((resolve) => {
          if (AppsFlyer.onInstallConversionData) {
            AppsFlyer.onInstallConversionData((data) => {
              onInstallAttribution(data);
            });
          }
          if (AppsFlyer.onAppOpenAttribution) {
            AppsFlyer.onAppOpenAttribution((data) => {
              const url = data.deepLink;
              if (typeof url === 'string' && url.length > 0) {
                pendingLink = url;
                onLinkReceived(url);
              }
            });
          }
          resolve();
        }),
      getPendingDeferredLink: async () => pendingLink,
      checkInstallAttribution: async () => {
        if (AppsFlyer.getAppsFlyerUID) {
          try {
            const uid = AppsFlyer.getAppsFlyerUID();
            if (typeof uid === 'string') {
              return { appsFlyerUid: uid };
            }
          } catch {
            return null;
          }
        }
        return null;
      },
    };
  } catch {
    return noopProvider;
  }
}

let pendingLink: string | null = null;

async function loadProvider(): Promise<DeferredDeepLinkProviderModule> {
  if (providerCache) return providerCache;
  if (providerLoadPromise) return providerLoadPromise;

  const configured = getConfiguredProvider();

  providerLoadPromise = (async () => {
    let provider: DeferredDeepLinkProviderModule;
    switch (configured) {
      case 'branch':
        provider = await loadBranchProvider();
        break;
      case 'appsflyer':
        provider = await loadAppsFlyerProvider();
        break;
      default:
        provider = noopProvider;
        break;
    }
    providerCache = provider;
    return provider;
  })();

  try {
    return await providerLoadPromise;
  } finally {
    providerLoadPromise = null;
  }
}

/**
 * Initialises the deferred deep linking provider and registers callbacks
 * for incoming deferred links and install attribution data. Safe to call
 * multiple times — the provider is loaded once and cached.
 *
 * @param options.onLinkReceived        - Called when a deferred deep link is delivered.
 * @param options.onInstallAttribution  - Called with install attribution payload.
 */
export async function initializeDeferredDeepLinking(
  options: InitializeOptions,
): Promise<void> {
  try {
    const provider = await loadProvider();
    await provider.initialize(options);
  } catch {
  }
}

/**
 * Returns the pending deferred deep link URL (if any) that was delivered
 * on first app open after install. Resolves to `null` when no deferred
 * link is available or the provider is unavailable.
 */
export async function getPendingDeferredLink(): Promise<string | null> {
  try {
    const provider = await loadProvider();
    return await provider.getPendingDeferredLink();
  } catch {
    return null;
  }
}

/**
 * Returns install attribution data from the deferred deep linking
 * provider. Resolves to `null` when attribution is unavailable or the
 * provider is unavailable.
 */
export async function checkInstallAttribution(): Promise<Record<string, unknown> | null> {
  try {
    const provider = await loadProvider();
    return await provider.checkInstallAttribution();
  } catch {
    return null;
  }
}
