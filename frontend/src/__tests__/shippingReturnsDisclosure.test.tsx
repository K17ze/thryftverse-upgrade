import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { ShippingReturnsInfo } from '../components/commerce/detail/ShippingReturnsInfo';
import type { ListingCommerceContext } from '../platform/product/listingDetailContract';

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: { textPrimary: '#111111', textSecondary: '#666666', textMuted: '#767676' } }),
}));
vi.mock('../hooks/useHaptic', () => ({ useHaptic: () => ({ light: vi.fn() }) }));
vi.mock('../hooks/useFormattedPrice', () => ({
  useFormattedPrice: () => ({ currencyCode: 'GBP', formatFromFiat: (value: number) => `£${value.toFixed(2)}` }),
}));

function renderPolicy(returnPolicy: ListingCommerceContext['returnPolicy']) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ShippingReturnsInfo commerce={{
      itemPrice: 25, currency: 'GBP', shippingPayer: 'seller', returnPolicy,
    }} />);
  });
  const action = () => renderer.root.findAll((node) =>
    node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function'
  )[0];
  return { renderer, action };
}

describe('shipping and returns disclosure', () => {
  it.each([
    [{ accepted: false }, 'No returns'],
    [{ accepted: true, windowDays: 14 }, '14-day returns'],
    [{ accepted: null, summary: 'Seller will confirm return terms' }, 'Seller will confirm return terms'],
    [null, 'Return policy confirmed at checkout'],
  ] satisfies Array<[ListingCommerceContext['returnPolicy'], string]>)(
    'exposes policy %j before the buyer expands the row', (policy, expected) => {
      const { renderer, action } = renderPolicy(policy);
      expect(action().props.accessibilityLabel).toBe(`Shipping and returns. Free shipping · ${expected}`);
      expect(action().props.accessibilityState.expanded).toBe(false);
      expect(renderer.root.findAll((node) => node.props.value === 'No restocking fee')).toHaveLength(0);
      act(() => action().props.onPress());
      expect(action().props.accessibilityState.expanded).toBe(true);
      expect(action().props.accessibilityHint).toBe('Hide shipping and returns details');
      // An unknown fee must remain absent even after opening the details.
      expect(renderer.root.findAll((node) => node.props.value === 'No restocking fee')).toHaveLength(0);
      act(() => action().props.onPress());
      expect(action().props.accessibilityState.expanded).toBe(false);
      act(() => renderer.unmount());
    },
  );
});
