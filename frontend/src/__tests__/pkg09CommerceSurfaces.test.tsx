import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PKG-09 — commerce surfaces regression tests.
 *
 * Every test in this file FAILS on the pre-fix code:
 *  - FRESH-01: a failed refresh blanked the populated live-shopping body.
 *  - FRESH-04: branded Apple/Google Pay buttons ignored device support and
 *    shared the generic card handler.
 *  - FRESH-05: the portfolio action sheet collapsed "paused" to Closed.
 *  - FRESH-06: the profile "For sale" stat was a vibration-only no-op.
 *  - FRESH-07: reorder mode mounted the entire closet inside a
 *    non-scrolling nested list.
 *  - FRESH-09: the last arbitrary photo was mislabeled as condition
 *    evidence.
 *  - S20-06: a blocked seller's public Q&A kept a live ask composer.
 */

// ── Shared mocks ────────────────────────────────────────────────────────────

const mockColors = {
  background: '#ffffff',
  surface: '#f5f5f5',
  surfaceAlt: '#f0f0f0',
  textPrimary: '#000000',
  textSecondary: '#666666',
  textMuted: '#999999',
  textInverse: '#ffffff',
  scrimTextPrimary: '#ffffff',
  border: '#e0e0e0',
  borderSubtle: '#f0f0f0',
  brand: '#0066cc',
  brandSubtle: '#e6f0ff',
  success: '#00aa44',
  successText: '#007a33',
  dangerText: '#cc0000',
  overlay: 'rgba(0,0,0,0.5)',
};

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: mockColors, isDark: false }),
}));

// File-level react-native override: the shared setup mock lacks AppState,
// Alert and Linking, all of which sit inside the checkout payment-flow and
// Q&A render paths exercised below. Keep the same forwardRef host-component
// shape so `findHost` lookups stay consistent with the rest of the suite.
vi.mock('react-native', () => {
  const React = require('react');
  const createMock = (name: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(name, { ref, ...props })
    );
  return {
    View: createMock('View'),
    Text: createMock('Text'),
    TextInput: createMock('TextInput'),
    ScrollView: createMock('ScrollView'),
    FlatList: createMock('FlatList'),
    Pressable: createMock('Pressable'),
    TouchableOpacity: createMock('TouchableOpacity'),
    KeyboardAvoidingView: createMock('KeyboardAvoidingView'),
    SafeAreaView: createMock('SafeAreaView'),
    StatusBar: createMock('StatusBar'),
    ActivityIndicator: createMock('ActivityIndicator'),
    RefreshControl: createMock('RefreshControl'),
    Modal: createMock('Modal'),
    Alert: { alert: vi.fn(), prompt: vi.fn() },
    AppState: {
      currentState: 'active',
      addEventListener: vi.fn(() => ({ remove: () => {} })),
      removeEventListener: vi.fn(),
    },
    StyleSheet: {
      create: (s: any) => s,
      flatten: (s: any) => s,
      absoluteFillObject: {},
      hairlineWidth: 1,
    },
    Platform: { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default, Version: 17 },
    Dimensions: {
      get: () => ({ width: 375, height: 812, scale: 3, fontScale: 1 }),
    },
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 3, fontScale: 1 }),
    I18nManager: {
      isRTL: false,
      forceRTL: vi.fn(),
      allowRTL: vi.fn(),
      swapLeftAndRightInRTL: vi.fn(),
    },
    Appearance: {
      getColorScheme: () => 'light',
      addChangeListener: () => ({ remove: () => {} }),
    },
    PanResponder: {
      create: (config: any) => ({ panHandlers: { ...config } }),
    },
    AccessibilityInfo: {
      announceForAccessibility: vi.fn(() => Promise.resolve()),
      isReduceMotionEnabled: vi.fn(() => Promise.resolve(false)),
      isScreenReaderEnabled: vi.fn(() => Promise.resolve(false)),
      addEventListener: vi.fn(() => ({ remove: () => {} })),
      removeEventListener: vi.fn(),
      setAccessibilityFocus: vi.fn(),
      sendAccessibilityEvent: vi.fn(),
    },
    UIManager: {
      setLayoutAnimationEnabledExperimental: vi.fn(),
    },
    LayoutAnimation: {
      configureNext: vi.fn(),
      create: vi.fn(),
      Types: { easeInEaseOut: 'easeInEaseOut', linear: 'linear', spring: 'spring' },
      Properties: { opacity: 'opacity', scaleX: 'scaleX', scaleY: 'scaleY', scaleXY: 'scaleXY' },
      Presets: { easeInEaseOut: {}, linear: {}, spring: {} },
    },
    Linking: {
      openURL: vi.fn(() => Promise.resolve()),
      canOpenURL: vi.fn(() => Promise.resolve(true)),
      addEventListener: vi.fn(() => ({ remove: () => {} })),
      getInitialURL: vi.fn(() => Promise.resolve(null)),
    },
    Keyboard: {
      dismiss: vi.fn(),
      addListener: vi.fn(() => ({ remove: () => {} })),
    },
    Vibration: { vibrate: vi.fn(), cancel: vi.fn() },
    PixelRatio: {
      get: () => 3,
      getFontScale: () => 1,
      getPixelSizeForLayoutSize: (v: number) => v,
      roundToNearestPixel: (v: number) => v,
    },
    useColorScheme: () => 'light',
    BackHandler: {
      addEventListener: vi.fn(() => ({ remove: () => {} })),
      exitApp: vi.fn(),
    },
    InteractionManager: {
      runAfterInteractions: (fn: any) => {
        if (typeof fn === 'function') fn();
        return { cancel: () => {}, done: Promise.resolve(), then: (cb: any) => cb?.() };
      },
    },
    Easing: {
      linear: (t: number) => t,
      ease: (t: number) => t,
      inOut: (e: any) => e,
    },
    findNodeHandle: () => null,
    NativeModules: {},
  };
});

// The setup-level analytics mock only exports the two store-facing methods;
// the payment flow also calls track/trackFunnelStep.
vi.mock('../analytics', () => ({
  identifyUser: vi.fn(),
  resetIdentity: vi.fn(),
  track: vi.fn(),
  trackFunnelStep: vi.fn(),
}));

vi.mock('../i18n/useAppTranslation', () => {
  // A stable `t` — the screens memoize loaders on it, so a new function per
  // render would loop effects forever under act().
  const t = (key: string) => key;
  return { useAppTranslation: () => ({ t }) };
});

const navNavigate = vi.fn();
const navReplace = vi.fn();
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: navNavigate,
    goBack: vi.fn(),
    push: vi.fn(),
    replace: navReplace,
  }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {},
  useScrollToTop: () => {},
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(() => Promise.resolve()),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  }),
}));

vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({
    light: () => {},
    medium: () => {},
    heavy: () => {},
    selection: () => {},
    error: () => {},
    patterns: { save: () => {} },
  }),
}));

vi.mock('../hooks/useFormattedPrice', () => ({
  useFormattedPrice: () => ({
    formatFromFiat: (v: number) => `£${v.toFixed(2)}`,
    fxRates: {},
    displayMode: 'fiat',
  }),
}));

vi.mock('../hooks/useConnectivity', () => ({
  useConnectivity: () => ({ isOffline: false }),
}));

const showErrorMock = vi.fn();
const showInfoMock = vi.fn();
vi.mock('../hooks/useNotifications', () => ({
  useNotifications: () => ({ showError: showErrorMock, showInfo: showInfoMock }),
}));

vi.mock('../context/BackendDataContext', () => ({
  useBackendData: () => ({ refreshListings: vi.fn(() => Promise.resolve()) }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock('../hooks/useSignupWall', () => ({
  useSignupWall: () => ({ requireAuth: () => true }),
}));

vi.mock('../store/useStore', () => ({
  useStore: (selector: (s: unknown) => unknown) =>
    selector({ currentUser: { id: 'viewer-1', username: 'viewer' } }),
}));

// ── Commerce API boundary ───────────────────────────────────────────────────

const createOrderMock = vi.fn();
const completeOrderCheckoutMock = vi.fn();
const cancelOrderMock = vi.fn();
const getOrderMock = vi.fn();
const createCommercePaymentIntentMock = vi.fn();
const createOnezeCheckoutIntentMock = vi.fn();
const createStripeOrderSheetMock = vi.fn();
const getPaymentIntentStatusMock = vi.fn();

vi.mock('../services/commerceApi', () => ({
  createOrder: (...args: unknown[]) => createOrderMock(...args),
  completeOrderCheckout: (...args: unknown[]) => completeOrderCheckoutMock(...args),
  cancelOrder: (...args: unknown[]) => cancelOrderMock(...args),
  getOrder: (...args: unknown[]) => getOrderMock(...args),
  createCommercePaymentIntent: (...args: unknown[]) => createCommercePaymentIntentMock(...args),
  createOnezeCheckoutIntent: (...args: unknown[]) => createOnezeCheckoutIntentMock(...args),
  createStripeOrderSheet: (...args: unknown[]) => createStripeOrderSheetMock(...args),
  getPaymentIntentStatus: (...args: unknown[]) => getPaymentIntentStatusMock(...args),
}));

const waitSettlementMock = vi.fn();
vi.mock('../services/checkoutPaymentIntent', () => ({
  waitForPaymentIntentSettlement: (...args: unknown[]) => waitSettlementMock(...args),
}));

vi.mock('../platform/payments/stripeMobile', () => ({
  configureStripeMobile: vi.fn(() => Promise.resolve()),
  getStripeReturnUrl: () => 'thryftverse://stripe-redirect',
}));

// ── Stripe SDK boundary — the tender-specific rail under test ───────────────

const confirmPlatformPayPaymentMock = vi.fn();
const initPaymentSheetMock = vi.fn();
const presentPaymentSheetMock = vi.fn();

vi.mock('@stripe/stripe-react-native', () => ({
  confirmPlatformPayPayment: (...args: unknown[]) => confirmPlatformPayPaymentMock(...args),
  initPaymentSheet: (...args: unknown[]) => initPaymentSheetMock(...args),
  presentPaymentSheet: (...args: unknown[]) => presentPaymentSheetMock(...args),
  isPlatformPaySupported: () => Promise.resolve(true),
  initStripe: vi.fn(),
  PaymentSheetError: { Canceled: 'Canceled' },
  PlatformPayError: { Canceled: 'Canceled' },
  PlatformPay: {
    PaymentType: { Immediate: 'Immediate', Deferred: 'Deferred', Recurring: 'Recurring' },
    ApplePayMerchantCapability: { Supports3DS: 'supports3DS' },
  },
}));

// ── Live home boundary ──────────────────────────────────────────────────────

const fetchLiveSessionsMock = vi.fn();
vi.mock('../services/liveShoppingApi', () => ({
  fetchLiveSessions: (...args: unknown[]) => fetchLiveSessionsMock(...args),
}));

vi.mock('../components/live/liveBroadcastApi', () => ({
  remindBroadcastSession: vi.fn(() => Promise.resolve()),
  unremindBroadcastSession: vi.fn(() => Promise.resolve()),
  persistLocalReminder: vi.fn(() => Promise.resolve()),
  LiveRemindersUnavailableError: class LiveRemindersUnavailableError extends Error {},
}));

vi.mock('../components/live/SessionCards', () => {
  const React = require('react');
  return {
    LiveSessionCard: ({ session }: { session: { id: string } }) =>
      React.createElement('Text', null, `LIVE-CARD ${session.id}`),
    UpcomingSessionRow: () => null,
    ReplaySessionCard: () => null,
    LIVE_CARD_WIDTH: 280,
    UPCOMING_THUMB_SIZE: 56,
  };
});

// ── Listing API boundary (ListingQA) ────────────────────────────────────────

const fetchQuestionsMock = vi.fn();
const askQuestionMock = vi.fn();
vi.mock('../services/listingsApi', () => ({
  fetchListingQuestions: (...args: unknown[]) => fetchQuestionsMock(...args),
  askListingQuestion: (...args: unknown[]) => askQuestionMock(...args),
  answerListingQuestion: vi.fn(),
}));

// ── Component mocks — keep renders shallow at the boundary, never the unit ──

vi.mock('../components/AnimatedPressable', () => {
  const React = require('react');
  return {
    AnimatedPressable: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('Pressable', { ref, ...props })),
  };
});

vi.mock('../components/HorizontalRail', () => {
  const React = require('react');
  return {
    HorizontalRail: (props: { children?: React.ReactNode }) =>
      React.createElement('View', null, props.children),
  };
});

vi.mock('../components/OfflineBanner', () => {
  const React = require('react');
  return {
    // Always renders a retry target so tests can drive handleRetry.
    OfflineBanner: (props: { onRetry?: () => void }) =>
      React.createElement('Pressable', { testID: 'offline-retry', onPress: props.onRetry }),
  };
});

vi.mock('../components/flagship', () => {
  const React = require('react');
  return {
    FlagshipScreen: (props: { children?: React.ReactNode; header?: React.ReactNode }) =>
      React.createElement('View', null, props.header, props.children),
    FlagshipHeader: () => null,
    FlagshipState: (props: { title?: string; actionLabel?: string; onAction?: () => void }) =>
      React.createElement('View', null,
        React.createElement('Text', null, props.title),
        props.actionLabel
          ? React.createElement('Pressable', { accessibilityLabel: props.actionLabel, onPress: props.onAction })
          : null),
    SkeletonBlock: () => null,
    SkeletonTextLine: () => null,
  };
});

vi.mock('../components/commerce/detail', () => {
  const React = require('react');
  return {
    CommerceDetailUnavailableInline: (props: { title: string; body?: string; onRetry?: () => void }) =>
      React.createElement('View', null,
        React.createElement('Text', null, props.title),
        props.body ? React.createElement('Text', null, props.body) : null,
        props.onRetry
          ? React.createElement('Pressable', { testID: 'inline-retry', onPress: props.onRetry })
          : null),
    CommerceDetailSection: (props: { children?: React.ReactNode }) =>
      React.createElement('View', null, props.children),
  };
});

vi.mock('../components/commerce', () => ({
  CategoryEvidence: () => null,
}));

vi.mock('@shopify/flash-list', () => {
  const React = require('react');
  return {
    // Props-only element — tests assert on `data`/`scrollEnabled`, not on
    // recycled cells (recycling is FlashList's own contract).
    FlashList: (props: Record<string, unknown>) => React.createElement('FlashList', props),
  };
});

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: () => null,
}));

// ── Imports under test (after mocks) ────────────────────────────────────────

import LiveShoppingHomeScreen from '../screens/LiveShoppingHomeScreen';
import { ClosetGrid } from '../components/myprofile/ClosetGrid';
import { CheckoutFooter } from '../components/checkout/CheckoutFooter';
import { ItemDetailItemDetails } from '../components/itemdetail/ItemDetailItemDetails';
import { ListingQA } from '../components/product/ListingQA';
import { formatPositionStatusLabel } from '../components/portfolio/portfolioViewModels';
import { useCheckoutPaymentFlow } from '../hooks/checkout/useCheckoutPaymentFlow';
import type { Listing } from '../domain';
import type { CoOwnPositionVM } from '../services/coOwnPortfolio';
import type { CheckoutPostageOption } from '../utils/checkoutFlow';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function mount(el: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(el);
  });
  return renderer;
}

function allText(renderer: TestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: TestRenderer.ReactTestInstance | string) => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    for (const child of node.children) {
      if (typeof child === 'string') out.push(child);
      else walk(child as TestRenderer.ReactTestInstance);
    }
  };
  walk(renderer.root);
  return out;
}

const hasText = (renderer: TestRenderer.ReactTestRenderer, s: string) =>
  allText(renderer).some((t) => t.includes(s));

const findHost = (renderer: TestRenderer.ReactTestRenderer, type: string) =>
  renderer.root.findAll((n) => n.type === type);

function readSource(rel: string): string {
  return readFileSync(resolve(__dirname, '..', rel), 'utf-8');
}

const SCREENS = (name: string) => readSource(`screens/${name}`);
const COMPONENTS = (rel: string) => readSource(`components/${rel}`);

// ════════════════════════════════════════════════════════════════════════════
// FRESH-01 — live home keeps last-good content on refresh failure
// ════════════════════════════════════════════════════════════════════════════

describe('FRESH-01 — LiveShoppingHomeScreen refresh failure', () => {
  beforeEach(() => {
    fetchLiveSessionsMock.mockReset();
    navNavigate.mockReset();
  });

  it('keeps the populated body visible with an inline retry notice when refresh fails', async () => {
    fetchLiveSessionsMock.mockResolvedValueOnce({
      sessions: [
        { id: 's1', status: 'live', title: 'Show one' },
        { id: 's2', status: 'upcoming', title: 'Show two' },
      ],
    });

    const renderer = await mount(<LiveShoppingHomeScreen />);
    expect(hasText(renderer, 'LIVE-CARD s1')).toBe(true);

    // Next load fails — pull-to-refresh / retry path.
    fetchLiveSessionsMock.mockRejectedValueOnce(new Error('network down'));
    const retry = findHost(renderer, 'Pressable').find(
      (n) => n.props.testID === 'offline-retry',
    );
    expect(retry).toBeTruthy();
    await act(async () => {
      retry!.props.onPress();
      await Promise.resolve();
    });

    // Old behaviour: summary + error matched no render branch → blank body.
    expect(hasText(renderer, 'LIVE-CARD s1')).toBe(true);
    expect(hasText(renderer, 'refreshFailed.title')).toBe(true);
    // The full-screen error state must NOT replace populated content.
    expect(hasText(renderer, 'error.title')).toBe(false);
  });

  it('still shows the full error state when nothing was ever loaded', async () => {
    fetchLiveSessionsMock.mockRejectedValueOnce(new Error('network down'));
    const renderer = await mount(<LiveShoppingHomeScreen />);
    expect(hasText(renderer, 'error.title')).toBe(true);
    expect(hasText(renderer, 'LIVE-CARD')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FRESH-04 — branded tender buttons: device gate + tender-specific action
// ════════════════════════════════════════════════════════════════════════════

function CheckoutHarness() {
  const flow = useCheckoutPaymentFlow({
    itemId: 'listing-1',
    item: { id: 'listing-1', title: 'Vintage jacket', price: 100, sellerId: 'seller-9', images: [] } as unknown as Listing,
    userId: 'buyer-1',
    isHydrating: false,
    savedAddressId: 42,
    savedPaymentMethod: null,
    checkoutCapabilities: null,
    postageOption: { carrierId: 'royal-mail', quoteId: 'q1', priceFromGbp: 3.49 } as CheckoutPostageOption,
    verificationRequested: false,
    useBalance: false,
    walletBalance: 0,
    useOnezePayment: false,
    onezeBalance: 0,
    setHasAttemptedPay: () => {},
  });
  // Expose the flow on the element for assertions.
  return <TestRendererHost flow={flow} />;
}

// Simple host element so the hook result is inspectable via props.
function TestRendererHost(props: { flow: ReturnType<typeof useCheckoutPaymentFlow> }) {
  void props;
  return null;
}

describe('FRESH-04 — platform-pay tender rail', () => {
  const sheetConfig = {
    provider: 'stripe',
    orderId: 'order-1',
    paymentIntentClientSecret: 'pi_1_secret_abc',
    customerId: 'cus_1',
    customerSessionClientSecret: 'cks_1',
    publishableKey: 'pk_test_abc',
    merchantDisplayName: 'ThryftVerse',
    merchantCountryCode: 'GB',
    currency: 'gbp',
    returnUrl: 'thryftverse://stripe-redirect',
    applePayEnabled: true,
    googlePayEnabled: true,
  };

  beforeEach(() => {
    createOrderMock.mockReset().mockResolvedValue({ id: 'order-1', status: 'created' });
    completeOrderCheckoutMock.mockReset().mockResolvedValue({});
    cancelOrderMock.mockReset().mockResolvedValue({});
    getOrderMock.mockReset().mockResolvedValue(null);
    createCommercePaymentIntentMock.mockReset().mockResolvedValue({
      intent: { id: 'pi_1', status: 'requires_confirmation', gatewayId: 'stripe_americas' },
      idempotent: false,
    });
    createOnezeCheckoutIntentMock.mockReset();
    createStripeOrderSheetMock.mockReset().mockResolvedValue(sheetConfig);
    getPaymentIntentStatusMock.mockReset();
    confirmPlatformPayPaymentMock.mockReset().mockResolvedValue({ error: undefined });
    initPaymentSheetMock.mockReset().mockResolvedValue({ error: undefined });
    presentPaymentSheetMock.mockReset().mockResolvedValue({ error: undefined });
    waitSettlementMock.mockReset().mockResolvedValue('succeeded');
    navReplace.mockReset();
  });

  it('the wallet tender is eligible without a saved card while the card rail is not', async () => {
    const renderer = await mount(<CheckoutHarness />);
    const host = renderer.root.findByType(TestRendererHost);
    const flow = host.props.flow as ReturnType<typeof useCheckoutPaymentFlow>;
    // No saved payment method: the card rail is correctly ineligible, but
    // the wallet supplies its credential at confirm time — the branded CTA
    // must stay available (old code had no separate eligibility at all).
    expect(flow.platformPayEligible).toBe(true);
    expect(flow.checkoutEligible).toBe(false);
  });

  it('handlePlatformPay confirms the order intent via the native wallet sheet, never the card PaymentSheet', async () => {
    const renderer = await mount(<CheckoutHarness />);
    const host = renderer.root.findByType(TestRendererHost);
    const flow = host.props.flow as ReturnType<typeof useCheckoutPaymentFlow>;
    expect(typeof flow.handlePlatformPay).toBe('function');

    await act(async () => {
      flow.handlePlatformPay();
      // Flush the async pay pipeline.
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    });

    expect(createOrderMock).toHaveBeenCalledTimes(1);
    const orderInput = createOrderMock.mock.calls[0][0] as Record<string, unknown>;
    // Wallet tender carries no stored payment method — the credential is
    // created at confirm time.
    expect(orderInput.paymentMethodId).toBeUndefined();

    expect(createStripeOrderSheetMock).toHaveBeenCalledWith('order-1');
    expect(confirmPlatformPayPaymentMock).toHaveBeenCalledTimes(1);
    expect(confirmPlatformPayPaymentMock.mock.calls[0][0]).toBe('pi_1_secret_abc');
    // The card PaymentSheet must NOT be presented for a named wallet tender.
    expect(initPaymentSheetMock).not.toHaveBeenCalled();
    expect(presentPaymentSheetMock).not.toHaveBeenCalled();
  });

  it('never shows success when the server only reports pending settlement', async () => {
    waitSettlementMock.mockResolvedValue('pending');
    const renderer = await mount(<CheckoutHarness />);
    const host = renderer.root.findByType(TestRendererHost);
    const flow = host.props.flow as ReturnType<typeof useCheckoutPaymentFlow>;

    await act(async () => {
      flow.handlePlatformPay();
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    });

    const flowAfter = renderer.root.findByType(TestRendererHost).props
      .flow as ReturnType<typeof useCheckoutPaymentFlow>;
    expect(flowAfter.stage).toBe('payment_pending');
    expect(flowAfter.stage).not.toBe('payment_succeeded');
    // Pending settlement lands on the order surface, never the success screen.
    expect(navReplace).toHaveBeenCalledWith('OrderDetail', { orderId: 'order-1' });
    expect(navReplace).not.toHaveBeenCalledWith('Success', expect.anything());
  });
});

describe('FRESH-04 — footer tender mapping + device gate', () => {
  const footerProps = {
    itemLabel: '£100.00',
    deliveryLabel: '£3.49',
    protectionLabel: '£5.00',
    totalLabel: '£108.49',
    onPressSummary: () => {},
    payLabel: 'Pay £108.49',
    payDisabled: false,
    isSubmitting: false,
    walletAvailable: true,
    reducedMotion: true,
  };

  it('the branded Apple Pay button invokes the wallet action, not the card handler', async () => {
    const onPay = vi.fn();
    const onWalletPay = vi.fn();
    const renderer = await mount(
      <CheckoutFooter
        {...footerProps}
        showApplePay={true}
        showGooglePay={false}
        onPay={onPay}
        onWalletPay={onWalletPay}
        walletPayDisabled={false}
      />,
    );
    const walletBtn = findHost(renderer, 'Pressable').find(
      (n) => typeof n.props.accessibilityLabel === 'string'
        && n.props.accessibilityLabel.includes('Apple Pay'),
    );
    expect(walletBtn).toBeTruthy();
    await act(async () => {
      walletBtn!.props.onPress();
    });
    // Old code wired the branded button to the same generic onPay — a named
    // tender silently ran the card path.
    expect(onWalletPay).toHaveBeenCalledTimes(1);
    expect(onPay).not.toHaveBeenCalled();
  });

  it('an unsupported device renders no branded tender button (capability alone is not enough)', () => {
    // The device-support gate lives in CheckoutScreen: show* booleans must
    // require platformPaySupported, not just merchant capability.
    const src = SCREENS('CheckoutScreen.tsx');
    const appleExpr = src.match(/showApplePay=\{([^}]*)\}/);
    const googleExpr = src.match(/showGooglePay=\{([^}]*)\}/);
    expect(appleExpr).toBeTruthy();
    expect(googleExpr).toBeTruthy();
    expect(appleExpr![1]).toContain('platformPaySupported');
    expect(googleExpr![1]).toContain('platformPaySupported');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FRESH-05 — paused portfolio status in the action sheet
// ════════════════════════════════════════════════════════════════════════════

describe('FRESH-05 — portfolio sheet status', () => {
  const basePosition = {
    assetId: 'a1',
    listingId: 'l1',
    issuerId: 'i1',
    title: 'Asset',
    imageUrl: null,
    unitsOwned: 10,
    totalUnits: 100,
    ownershipPct: 10,
    unitPriceGbp: 25,
    unitPriceStable: 25,
    settlementMode: 'ONEZE',
    currentValueGbp: 250,
    markedValueGbp: 250,
    estimatedSaleProceedsGbp: null,
    saleDepthUnits: 0,
    saleProceedsAsOf: undefined,
    avgEntryPriceGbp: 20,
    realizedPnlGbp: 0,
    unrealizedPnlGbp: 50,
    availableUnits: 10,
    sellableUnits: 10,
    isOpen: true,
    createdAt: '2026-01-01T00:00:00Z',
  } as unknown as CoOwnPositionVM;

  it('labels a paused position Paused — never collapses it to Closed', () => {
    expect(formatPositionStatusLabel({ ...basePosition, status: 'paused' })).toBe('Paused');
    expect(formatPositionStatusLabel({ ...basePosition, status: 'open' })).toBe('Active');
    expect(formatPositionStatusLabel({ ...basePosition, status: 'closed' })).toBe('Closed');
  });

  it('the action sheet uses the shared status formatter, not an isOpen binary', () => {
    const src = SCREENS('PortfolioScreen.tsx');
    // Old code: actionSheetAsset.isOpen ? 'Active' : 'Closed' — a paused
    // position rendered "Closed".
    expect(src).toContain('formatPositionStatusLabel(actionSheetAsset)');
    expect(src).not.toMatch(/isOpen \? 'Active' : 'Closed'/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FRESH-06 — "For sale" stat selects + scrolls to the listings tab
// ════════════════════════════════════════════════════════════════════════════

describe('FRESH-06 — For sale stat is wired to the listings tab', () => {
  it('pressing the stat selects the listings tab and scrolls to it', () => {
    const src = SCREENS('MyProfileScreen.tsx');
    // Old code: onPressListings={() => { haptic.light(); /* no-op */ }}.
    expect(src).toContain('onPressListings={handlePressListings}');
    const handler = src.match(/const handlePressListings = useCallback\(\(\) => \{([\s\S]*?)\}, \[/);
    expect(handler).toBeTruthy();
    expect(handler![1]).toContain("setActiveTab('listings')");
    expect(handler![1]).toContain('scrollTo');
    // The scroll target is the measured tab-content offset, not a guess.
    expect(src).toContain('onTabContentLayout');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FRESH-07 — reorder grid virtualization
// ════════════════════════════════════════════════════════════════════════════

describe('FRESH-07 — reorder mounts the closet on a virtualized surface', () => {
  const makeListings = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `l${i}`,
      title: `Item ${i}`,
      price: 10 + i,
      images: [],
    })) as unknown as Listing[];

  const gridProps = (listings: Listing[], reorderMode: boolean) => ({
    listings,
    reorderMode,
    isSaving: false,
    reducedMotion: true,
    onToggleReorder: vi.fn(),
    onViewAll: vi.fn(),
    onStartSelling: vi.fn(),
    onImport: vi.fn(),
    renderItem: () => <React.Fragment />,
  });

  it('the inline grid stays capped at the preview limit even in reorder mode', async () => {
    const listings = makeListings(1000);
    const renderer = await mount(<ClosetGrid {...gridProps(listings, true)} />);
    const lists = findHost(renderer, 'FlashList');
    // Old code: reorderMode ? listings : slice(0,12) on ONE non-scrolling
    // list — 1000 media views mounted eagerly inside the profile ScrollView.
    const nonScrolling = lists.filter((n) => n.props.scrollEnabled === false);
    expect(nonScrolling.length).toBe(1);
    expect((nonScrolling[0].props.data as unknown[]).length).toBeLessThanOrEqual(12);
  });

  it('the full closet renders inside a scrollable (virtualized) list, not the nested grid', async () => {
    const listings = makeListings(1000);
    const renderer = await mount(<ClosetGrid {...gridProps(listings, true)} />);
    const lists = findHost(renderer, 'FlashList');
    const scrollable = lists.filter(
      (n) => n.props.scrollEnabled !== false,
    );
    // A dedicated reorder surface holds the full set in a real scrolling
    // list — recycling bounds mounted cells.
    expect(scrollable.length).toBeGreaterThanOrEqual(1);
    const fullList = scrollable.find(
      (n) => (n.props.data as unknown[]).length === 1000,
    );
    expect(fullList).toBeTruthy();
    expect(fullList!.props.scrollEnabled).not.toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FRESH-09 — no fabricated "condition photo" from gallery position
// ════════════════════════════════════════════════════════════════════════════

describe('FRESH-09 — condition-photo semantics', () => {
  const item = {
    id: 'l1',
    title: 'Jacket',
    condition: 'Good',
    description: 'A jacket.',
    images: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
    category: 'coats',
  } as unknown as Listing;

  const detailsProps = (onOpenViewer: (i: number) => void) => ({
    item,
    conditionMeta: null,
    descriptionExpanded: false,
    setDescriptionExpanded: () => {},
    onOpenViewer,
  });

  it('labels the gallery jump generically — no photo is tagged as condition evidence', async () => {
    const renderer = await mount(
      <ItemDetailItemDetails {...detailsProps(() => {})} />,
    );
    // Old code: "View condition photos" jumped to the LAST image and
    // presented it as flaw evidence.
    expect(hasText(renderer, 'View condition photos')).toBe(false);
    expect(hasText(renderer, 'View all photos')).toBe(true);
  });

  it('the gallery jump opens the photo set from the start, not an arbitrary last shot', async () => {
    const openViewer = vi.fn();
    const renderer = await mount(
      <ItemDetailItemDetails {...detailsProps(openViewer)} />,
    );
    const jump = findHost(renderer, 'Pressable').find(
      (n) => n.props.accessibilityLabel === 'View all item photos',
    );
    expect(jump).toBeTruthy();
    await act(async () => {
      jump!.props.onPress();
    });
    // Old code opened images.length - 1 and called it "condition evidence".
    expect(openViewer).toHaveBeenCalledWith(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// S20-06 — blocked seller keeps Q&A read access, loses the ask composer
// ════════════════════════════════════════════════════════════════════════════

describe('S20-06 — blocked seller public Q&A', () => {
  const existingQuestion = {
    id: 'q1',
    listingId: 'l1',
    askerId: 'asker-7',
    askerName: 'asker',
    text: 'Is this still available?',
    createdAt: '2026-09-20T10:00:00.000Z',
    answer: null,
  };

  beforeEach(() => {
    fetchQuestionsMock.mockReset().mockResolvedValue([existingQuestion]);
    askQuestionMock.mockReset();
  });

  it('hides the ask composer with an honest reason while keeping existing Q&A readable', async () => {
    const renderer = await mount(
      <ListingQA listingId="l1" currentUserName="viewer" isSeller={false} isSellerBlocked={true} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    // READ access preserved.
    expect(hasText(renderer, 'Is this still available?')).toBe(true);
    // The ask composer is gone — replaced by the relationship state.
    const askInput = renderer.root.findAll(
      (n) => n.props.accessibilityLabel === 'Ask a question',
    );
    expect(askInput.length).toBe(0);
    expect(hasText(renderer, 'You blocked this seller')).toBe(true);
  });

  it('renders the ask composer for an unblocked viewer', async () => {
    const renderer = await mount(
      <ListingQA listingId="l1" currentUserName="viewer" isSeller={false} isSellerBlocked={false} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const askInput = renderer.root.findAll(
      (n) => (n.type as string) === 'TextInput' && n.props.accessibilityLabel === 'Ask a question',
    );
    expect(askInput.length).toBe(1);
    expect(hasText(renderer, 'You blocked this seller')).toBe(false);
  });

  it('a blocked viewer cannot submit even via a stale composer path', async () => {
    const renderer = await mount(
      <ListingQA listingId="l1" currentUserName="viewer" isSeller={false} isSellerBlocked={false} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    // Flip to blocked while the sheet is open — the composer must leave.
    await act(async () => {
      renderer.update(
        <ListingQA listingId="l1" currentUserName="viewer" isSeller={false} isSellerBlocked={true} />,
      );
    });
    const askInput = renderer.root.findAll(
      (n) => n.props.accessibilityLabel === 'Ask a question',
    );
    expect(askInput.length).toBe(0);
    expect(askQuestionMock).not.toHaveBeenCalled();
  });

  it('the screen threads the shared blocked capability into the sheet (single source, not recomputed)', () => {
    const screen = SCREENS('ItemDetailScreen.tsx');
    expect(screen).toContain('isSellerBlocked={isSellerBlocked}');
    const sheets = COMPONENTS('itemdetail/ItemDetailSheets.tsx');
    const qaUsage = sheets.match(/<ListingQA[\s\S]*?\/>/);
    expect(qaUsage).toBeTruthy();
    expect(qaUsage![0]).toContain('isSellerBlocked={isSellerBlocked}');
  });
});
