import { useCurrencyContext } from '../context/CurrencyContext';

export function useFxRate() {
  const { currencyCode, fxRates, rateUpdatedAt } = useCurrencyContext();

  return {
    currencyCode,
    fxRate: fxRates[currencyCode],
    fxRates,
    rateUpdatedAt,
  };
}