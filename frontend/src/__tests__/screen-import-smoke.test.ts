import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/*
 * Screen static smoke tests.
 * We do NOT import React Native screens into the vitest node environment
 * because expo-modules-core requires native globals that are not available.
 * Instead we verify source file structure, exports, and key patterns.
 */

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('EditProfileScreen static smoke', () => {
  const src = readSrc('screens/EditProfileScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function EditProfileScreen/);
  });

  it('imports PremiumTextField', () => {
    expect(src).toContain("import { PremiumTextField }");
  });

  it('imports PremiumSelectRow', () => {
    expect(src).toContain("import { PremiumSelectRow }");
  });

  it('imports PremiumFormCard', () => {
    expect(src).toContain("import { PremiumFormCard }");
  });

  it('uses reactive theme (useAppTheme)', () => {
    expect(src).toContain('useAppTheme');
  });

  it('does not use ActiveTheme', () => {
    expect(src).not.toContain('ActiveTheme');
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('ChangePasswordScreenV2 static smoke', () => {
  const src = readSrc('screens/ChangePasswordScreenV2.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function ChangePasswordScreenV2/);
  });

  it('imports PremiumTextField', () => {
    expect(src).toContain("import { PremiumTextField }");
  });

  it('imports PremiumFormCard', () => {
    expect(src).toContain("import { PremiumFormCard }");
  });

  it('imports PremiumActionFooter', () => {
    expect(src).toContain("import { PremiumActionFooter }");
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('SellScreenV2 static smoke', () => {
  const src = readSrc('screens/SellScreenV2.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function SellScreenV2/);
  });

  it('uses Animated.ScrollView for reanimated scroll handler', () => {
    expect(src).toContain('Animated.ScrollView');
  });

  it('has useAnimatedScrollHandler safety comment', () => {
    expect(src).toContain('SAFETY: useAnimatedScrollHandler returns an object');
  });

  it('has auth guard before publish', () => {
    expect(src).toContain('Sign in to publish a listing');
  });

  it('does not send sellerId with unknown fallback', () => {
    expect(src).not.toContain("?? 'unknown'");
    expect(src).not.toContain('?? "unknown"');
  });

  it('blocks publish if currentUser is missing', () => {
    expect(src).toMatch(/if\s*\(\s*!currentUser\?\.id\s*\)/);
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('ListingSuccessScreen static smoke', () => {
  const src = readSrc('screens/ListingSuccessScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function ListingSuccessScreen/);
  });

  it('does not import MOCK_USERS', () => {
    expect(src).not.toContain('MOCK_USERS');
  });

  it('does not import MY_USER', () => {
    expect(src).not.toContain('MY_USER');
  });

  it('does not import ActiveTheme', () => {
    expect(src).not.toContain('ActiveTheme');
  });

  it('does not contain fake conversationId', () => {
    expect(src).not.toContain("conversationId: 'c1'");
  });

  it('does not contain fake growth claim', () => {
    expect(src).not.toContain('sell 3x faster');
  });

  it('does not contain fake support chat navigation', () => {
    expect(src).not.toContain('ChatConversation');
  });

  it('uses reactive theme (useAppTheme)', () => {
    expect(src).toContain('useAppTheme');
  });

  it('has real ItemDetail navigation', () => {
    expect(src).toContain("'ItemDetail'");
  });

  it('has real ManageListing navigation', () => {
    expect(src).toContain("'ManageListing'");
  });

  it('has real HelpSupport navigation', () => {
    expect(src).toContain("'HelpSupport'");
  });

  it('uses design tokens (Space, Type, Radius)', () => {
    expect(src).toContain('Space.');
    expect(src).toContain('Type.');
    expect(src).toContain('Radius.');
  });

  it('has no hardcoded gold/yellow colors', () => {
    expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|gold|yellow)/i);
  });
});

describe('HomeScreen static smoke', () => {
  const src = readSrc('screens/HomeScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function HomeScreen/);
  });

  it('does not import getFreshPosters mock', () => {
    expect(src).not.toContain("import { getFreshPosters }");
  });

  it('uses real poster API', () => {
    expect(src).toContain('fetchPostersFromApi');
  });

  it('has no gold/yellow gradient colors', () => {
    expect(src).not.toMatch(/#(?:f3c17c|d4a94a|f2ddaa|ffd700|ffdf00)/i);
  });
});

describe('BrowseScreen static smoke', () => {
  const src = readSrc('screens/BrowseScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function BrowseScreen/);
  });

  it('does not import MOCK_USERS', () => {
    expect(src).not.toContain('MOCK_USERS');
  });
});

describe('ItemDetailScreen static smoke', () => {
  const src = readSrc('screens/ItemDetailScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function ItemDetailScreen/);
  });

  it('does not import MOCK_USERS', () => {
    expect(src).not.toContain('MOCK_USERS');
  });
});

describe('SearchScreen static smoke', () => {
  const src = readSrc('screens/SearchScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function SearchScreen/);
  });

  it('does not import ActiveTheme', () => {
    expect(src).not.toContain('ActiveTheme');
  });
});

describe('GlobalSearchScreen static smoke', () => {
  const src = readSrc('screens/GlobalSearchScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function GlobalSearchScreen/);
  });

  it('does not import ActiveTheme', () => {
    expect(src).not.toContain('ActiveTheme');
  });
});

describe('VisualSearchScreen static smoke', () => {
  const src = readSrc('screens/VisualSearchScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function VisualSearchScreen/);
  });

  it('does not import ActiveTheme', () => {
    expect(src).not.toContain('ActiveTheme');
  });

  it('shows honest unavailable state', () => {
    expect(src).toContain('not connected yet');
  });

  it('calls backend visual-search endpoint', () => {
    expect(src).toContain("'/visual-search'");
  });
});

describe('FilterScreen static smoke', () => {
  const src = readSrc('screens/FilterScreen.tsx');

  it('has a default export', () => {
    expect(src).toMatch(/export default function FilterScreen/);
  });

  it('does not import ActiveTheme', () => {
    expect(src).not.toContain('ActiveTheme');
  });
});

describe('BrowseScreen static smoke', () => {
  const src = readSrc('screens/BrowseScreen.tsx');

  it('uses fetchFilteredListings', () => {
    expect(src).toContain('fetchFilteredListings');
  });

  it('does not show raw seller ID slices', () => {
    expect(src).not.toContain("sellerId.slice(0");
  });
});

describe('ItemDetailScreen static smoke', () => {
  const src = readSrc('screens/ItemDetailScreen.tsx');

  it('uses backend seller object', () => {
    expect(src).toContain('item.seller');
  });

  it('fetches related listings from backend', () => {
    expect(src).toContain('fetchRelatedListings');
  });
});

describe('GlobalSearchScreen static smoke', () => {
  const src = readSrc('screens/GlobalSearchScreen.tsx');

  it('does not contain hardcoded RECENT_SEARCHES array', () => {
    expect(src).not.toContain("const RECENT_SEARCHES = [");
  });

  it('uses AsyncStorage for recent searches', () => {
    expect(src).toContain('AsyncStorage');
  });

  it('does not claim fake trends', () => {
    expect(src).not.toContain('Trending now');
  });
});

describe('CheckoutScreen static smoke', () => {
  const src = readSrc('screens/CheckoutScreen.tsx');

  it('does not import MOCK_LISTINGS', () => {
    expect(src).not.toContain("import { MOCK_LISTINGS");
  });

  it('does not use mockFind', () => {
    expect(src).not.toContain('mockFind');
  });

  it('does not use picsum fallback', () => {
    expect(src).not.toContain('picsum.photos');
  });

  it('calls createOrder backend API', () => {
    expect(src).toContain('createOrder');
  });

  it('calls createCommercePaymentIntent backend API', () => {
    expect(src).toContain('createCommercePaymentIntent');
  });
});

describe('MyOrdersScreen static smoke', () => {
  const src = readSrc('screens/MyOrdersScreen.tsx');

  it('does not import MOCK_LISTINGS or MOCK_USERS', () => {
    expect(src).not.toContain("import { MOCK_LISTINGS");
    expect(src).not.toContain("import { MOCK_USERS");
  });

  it('calls listUserOrders backend API', () => {
    expect(src).toContain('listUserOrders');
  });

  it('does not use mockFind', () => {
    expect(src).not.toContain('mockFind');
  });
});

describe('OrderDetailScreen static smoke', () => {
  const src = readSrc('screens/OrderDetailScreen.tsx');

  it('does not import MOCK_LISTINGS or MOCK_USERS', () => {
    expect(src).not.toContain("import { MOCK_LISTINGS");
    expect(src).not.toContain("import { MOCK_USERS");
  });

  it('calls getOrder backend API', () => {
    expect(src).toContain('getOrder');
  });

  it('does not use picsum fallback', () => {
    expect(src).not.toContain('picsum.photos');
  });
});

describe('PaymentsScreen static smoke', () => {
  const src = readSrc('screens/PaymentsScreen.tsx');

  it('calls listUserPaymentMethods backend API', () => {
    expect(src).toContain('listUserPaymentMethods');
  });

  it('does not hardcode a balance amount', () => {
    expect(src).not.toContain('120.5');
  });
});

describe('BalanceScreen static smoke', () => {
  const src = readSrc('screens/BalanceScreen.tsx');

  it('does not hardcode availableBalance', () => {
    expect(src).not.toContain('useState(120.5)');
  });

  it('does not hardcode availableIzeBalance', () => {
    expect(src).not.toContain('useState(50000)');
  });

  it('calls getIzePosition backend API', () => {
    expect(src).toContain('getIzePosition');
  });

  it('does not contain fake transaction data', () => {
    expect(src).not.toContain('Y2K Hoodie');
    expect(src).not.toContain('Vintage Tee');
  });
});

describe('WithdrawScreen static smoke', () => {
  const src = readSrc('screens/WithdrawScreen.tsx');

  it('does not hardcode availableBalance', () => {
    expect(src).not.toContain('useState(120.5)');
  });

  it('calls getWalletSnapshot or listPayoutAccounts backend API', () => {
    const hasSnapshot = src.includes('getWalletSnapshot');
    const hasPayoutAccounts = src.includes('listPayoutAccounts');
    expect(hasSnapshot || hasPayoutAccounts).toBe(true);
  });
});

describe('BalanceHistoryScreen static smoke', () => {
  const src = readSrc('screens/BalanceHistoryScreen.tsx');

  it('does not contain fake transaction months', () => {
    expect(src).not.toContain('March 2026');
    expect(src).not.toContain('February 2026');
  });
});

describe('SuccessScreen static smoke', () => {
  const src = readSrc('screens/SuccessScreen.tsx');

  it('does not import MOCK_USERS', () => {
    expect(src).not.toContain("import { MOCK_USERS");
  });
});

/* ─── Premium primitive import guardrails ─── */
const PREMIUM_SCREENS = [
  'SellScreenV2.tsx',
  'PaymentsScreen.tsx',
  'BalanceScreen.tsx',
  'PostageScreen.tsx',
  'SettingsScreenV2.tsx',
  'AccountSettingsScreenV2.tsx',
  'CheckoutScreen.tsx',
  'OrderDetailScreen.tsx',
  'MyOrdersScreen.tsx',
  'ListingSuccessScreen.tsx',
  'EditProfileScreen.tsx',
];

const PREMIUM_PRIMITIVES = [
  'ElevatedSurface',
  'PremiumInputShell',
  'PremiumListSection',
  'PremiumStatusPill',
  'PremiumActionBar',
  'PremiumTextField',
  'PremiumFormCard',
  'PremiumSelectRow',
  'PremiumActionFooter',
  'SettingsSection',
  'SettingsRow',
  'SettingsPage',
  'IdentityCard',
];

describe('Premium primitive import guardrails', () => {
  for (const file of PREMIUM_SCREENS) {
    const src = readSrc(`screens/${file}`);

    it(`${file} imports at least one premium primitive`, () => {
      const hasPrimitive = PREMIUM_PRIMITIVES.some((p) => src.includes(p));
      expect(hasPrimitive).toBe(true);
    });

    it(`${file} has no gold/yellow color literals`, () => {
      expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|ffaa00|gold|yellow)/i);
    });

    it(`${file} does not import glass/blur components`, () => {
      expect(src).not.toContain('BlurView');
      expect(src).not.toContain("from 'expo-blur'");
      expect(src).not.toContain('expo-blur');
    });
  }
});

describe('Double-boxing guardrails', () => {
  const DOUBLE_BOXING_SCREENS = [
    'PaymentsScreen.tsx',
    'PostageScreen.tsx',
    'BalanceScreen.tsx',
    'AccountSettingsScreenV2.tsx',
    'SettingsScreenV2.tsx',
  ];

  for (const file of DOUBLE_BOXING_SCREENS) {
    const src = readSrc(`screens/${file}`);

    it(`${file} does not nest ElevatedSurface inside PremiumListSection`, () => {
      // Find any PremiumListSection whose children contain ElevatedSurface before the closing tag
      const pattern = /<PremiumListSection[\s\S]*?<ElevatedSurface[\s\S]*?<\/PremiumListSection>/;
      expect(src).not.toMatch(pattern);
    });

    it(`${file} does not nest ElevatedSurface inside SettingsSection`, () => {
      const pattern = /<SettingsSection[\s\S]*?<ElevatedSurface[\s\S]*?<\/SettingsSection>/;
      expect(src).not.toMatch(pattern);
    });
  }
});
