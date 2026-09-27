import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assessCustomsExposure } from '../lib/customsEstimate.js';

describe('assessCustomsExposure', () => {
  it('treats same-country shipments as domestic with no estimate', () => {
    const result = assessCustomsExposure({
      sellerCountry: 'GB',
      buyerCountry: 'GB',
      declaredValueGbp: 80,
    });
    assert.equal(result.crossBorder, false);
    assert.equal(result.sameCustomsTerritory, true);
    assert.equal(result.dutiesEstimateGbp, null);
    assert.equal(result.note, null);
  });

  it('treats intra-EU shipments as same customs territory', () => {
    const result = assessCustomsExposure({
      sellerCountry: 'FR',
      buyerCountry: 'DE',
      declaredValueGbp: 200,
    });
    assert.equal(result.crossBorder, false);
    assert.equal(result.dutiesEstimateGbp, null);
  });

  it('bands UK→EU under and over the duty threshold', () => {
    const under = assessCustomsExposure({
      sellerCountry: 'GB',
      buyerCountry: 'FR',
      declaredValueGbp: 100,
    });
    assert.equal(under.crossBorder, true);
    assert.ok(under.dutiesEstimateGbp);
    assert.equal(under.dutiesEstimateGbp.low, 0);
    assert.equal(under.dutiesEstimateGbp.high, 20);

    const over = assessCustomsExposure({
      sellerCountry: 'GB',
      buyerCountry: 'FR',
      declaredValueGbp: 300,
    });
    assert.equal(over.dutiesEstimateGbp?.high, 96);
  });

  it('applies the US de-minimis band', () => {
    const under = assessCustomsExposure({
      sellerCountry: 'GB',
      buyerCountry: 'US',
      declaredValueGbp: 500,
    });
    assert.equal(under.dutiesEstimateGbp?.high, 0);

    const over = assessCustomsExposure({
      sellerCountry: 'GB',
      buyerCountry: 'US',
      declaredValueGbp: 1000,
    });
    assert.equal(over.dutiesEstimateGbp?.high, 160);
  });

  it('flags cross-border without a band when value is unknown', () => {
    const result = assessCustomsExposure({
      sellerCountry: 'GB',
      buyerCountry: 'JP',
      declaredValueGbp: null,
    });
    assert.equal(result.crossBorder, true);
    assert.equal(result.dutiesEstimateGbp, null);
    assert.ok(result.note?.includes('Cross-border'));
  });

  it('degrades to domestic when seller country is unknown', () => {
    const result = assessCustomsExposure({
      sellerCountry: null,
      buyerCountry: 'FR',
      declaredValueGbp: 50,
    });
    assert.equal(result.crossBorder, false);
    assert.equal(result.sellerCountry, null);
  });
});
