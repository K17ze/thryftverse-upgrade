import { describe, expect, it } from 'vitest';
import {
  CurrencyDisplayMode,
  DEFAULT_FX_RATES,
  formatPrice,
  toIze,
} from '../utils/currency';

function buildPricingSurface(mode: CurrencyDisplayMode) {
  const itemIze = toIze(89.5, 'GBP', DEFAULT_FX_RATES);
  const protectionIze = toIze(5.18, 'GBP', DEFAULT_FX_RATES);
  const postageIze = toIze(2.89, 'GBP', DEFAULT_FX_RATES);
  const totalIze = itemIze + protectionIze + postageIze;
  const promoteIze = toIze(1.99, 'GBP', DEFAULT_FX_RATES);

  return {
    mode,
    itemPrice: formatPrice({ izeAmount: itemIze, currencyCode: 'GBP', displayMode: mode }),
    platformChargeLine: `incl. ${formatPrice({
      izeAmount: protectionIze,
      currencyCode: 'GBP',
      displayMode: mode,
    })} Platform charge`,
    checkoutTotal: formatPrice({ izeAmount: totalIze, currencyCode: 'GBP', displayMode: mode }),
    promoteCta: `Promote for ${formatPrice({ izeAmount: promoteIze, currencyCode: 'GBP', displayMode: mode })}`,
  };
}

describe('pricing display-mode snapshots', () => {
  it('keeps key pricing copy stable across fiat/ize/both modes', () => {
    const views = [
      buildPricingSurface('fiat'),
      buildPricingSurface('ize'),
      buildPricingSurface('both'),
    ];

    expect(views).toMatchInlineSnapshot(`
      [
        {
          "checkoutTotal": "£97.57",
          "itemPrice": "£89.50",
          "mode": "fiat",
          "platformChargeLine": "incl. £5.18 Platform charge",
          "promoteCta": "Promote for £1.99",
        },
        {
          "checkoutTotal": "123.506329 1ze",
          "itemPrice": "113.291139 1ze",
          "mode": "ize",
          "platformChargeLine": "incl. 6.556962 1ze Platform charge",
          "promoteCta": "Promote for 2.518987 1ze",
        },
        {
          "checkoutTotal": "123.506329 1ze · £97.57",
          "itemPrice": "113.291139 1ze · £89.50",
          "mode": "both",
          "platformChargeLine": "incl. 6.556962 1ze · £5.18 Platform charge",
          "promoteCta": "Promote for 2.518987 1ze · £1.99",
        },
      ]
    `);
  });
});