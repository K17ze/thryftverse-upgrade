import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CURRENCIES,
  DEFAULT_CURRENCY_CODE,
  SupportedCurrencyCode,
} from '../constants/currencies';
import {
  CurrencyDisplayMode,
  DEFAULT_GOLD_RATES,
  GoldRates,
} from '../utils/currency';
import { fetchOnezeDisplayRates } from '../services/onezeQuoteApi';

interface CurrencyContextValue {
  currencyCode: SupportedCurrencyCode;
  displayMode: CurrencyDisplayMode;
  goldRates: GoldRates;
  rateUpdatedAt: number;
  rateSource: string;
  settlementCurrencies: Set<string>;
  setCurrencyCode: (code: SupportedCurrencyCode) => void;
  setDisplayMode: (mode: CurrencyDisplayMode) => void;
  cycleDisplayMode: () => void;
}

const CurrencyContext = React.createContext<CurrencyContextValue | undefined>(undefined);

const DISPLAY_MODE_SEQUENCE: CurrencyDisplayMode[] = ['both', 'fiat', 'ize'];
const CURRENCY_PREF_STORAGE_KEY = 'thryftverse:currency-pref:v1';

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currencyCode, setCurrencyCode] = React.useState<SupportedCurrencyCode>(DEFAULT_CURRENCY_CODE);
  const [displayMode, setDisplayMode] = React.useState<CurrencyDisplayMode>('both');
  const [goldRates, setGoldRates] = React.useState<GoldRates>(DEFAULT_GOLD_RATES);
  const [rateUpdatedAt, setRateUpdatedAt] = React.useState<number>(Date.now());
  const [rateSource, setRateSource] = React.useState<string>('fallback:static');
  const [settlementCurrencies, setSettlementCurrencies] = React.useState<Set<string>>(new Set(['GBP']));
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    const loadSavedPreference = async () => {
      try {
        const raw = await AsyncStorage.getItem(CURRENCY_PREF_STORAGE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as {
          currencyCode?: SupportedCurrencyCode;
          displayMode?: CurrencyDisplayMode;
        };

        if (parsed.currencyCode && parsed.currencyCode in CURRENCIES) {
          setCurrencyCode(parsed.currencyCode);
        }

        if (parsed.displayMode && DISPLAY_MODE_SEQUENCE.includes(parsed.displayMode)) {
          setDisplayMode(parsed.displayMode);
        }
      } catch {
        // Ignore persisted preference corruption and fall back to defaults.
      } finally {
        if (isMounted) {
          setIsHydrated(true);
        }
      }
    };

    loadSavedPreference();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isHydrated) {
      return;
    }

    AsyncStorage.setItem(
      CURRENCY_PREF_STORAGE_KEY,
      JSON.stringify({
        currencyCode,
        displayMode,
      })
    ).catch(() => {
      // Best-effort persistence; UI should remain responsive even if storage fails.
    });
  }, [currencyCode, displayMode, isHydrated]);

  const cycleDisplayMode = React.useCallback(() => {
    setDisplayMode((current) => {
      const index = DISPLAY_MODE_SEQUENCE.indexOf(current);
      const nextIndex = (index + 1) % DISPLAY_MODE_SEQUENCE.length;
      return DISPLAY_MODE_SEQUENCE[nextIndex];
    });
  }, []);

  const refreshRates = React.useCallback(async () => {
    const result = await fetchOnezeDisplayRates();
    setGoldRates(result.goldRates);
    setRateSource(result.rateSource);
    setRateUpdatedAt(result.rateUpdatedAt);
    setSettlementCurrencies(result.settlementCurrencies);
  }, []);

  React.useEffect(() => {
    void refreshRates();
    const interval = setInterval(() => void refreshRates(), 120000);
    return () => clearInterval(interval);
  }, [refreshRates]);

  const value = React.useMemo<CurrencyContextValue>(
    () => ({
      currencyCode,
      displayMode,
      goldRates,
      rateUpdatedAt,
      rateSource,
      settlementCurrencies,
      setCurrencyCode,
      setDisplayMode,
      cycleDisplayMode,
    }),
    [currencyCode, displayMode, goldRates, rateUpdatedAt, rateSource, settlementCurrencies, cycleDisplayMode]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrencyContext() {
  const context = React.useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrencyContext must be used within CurrencyProvider');
  }

  return context;
}