import { describe, it, expect } from 'vitest';

/**
 * Agent Definition — the canonical data model for a user-defined AI agent.
 * These tests verify the typed capability taxonomy, default grants per
 * category, and risk-level labelling that the builder surface relies on.
 */

import {
  CAPABILITIES_BY_RISK,
  CAPABILITY_RISK_LABELS,
  DEFAULT_CAPABILITIES_BY_CATEGORY,
  RISK_TO_TIER,
  buildInitialCapabilityGrants,
  type AgentCapability,
  type AgentCategory,
} from '../platform/agents/agentDefinition';
import { CAPABILITY_TIER } from '../platform/agents/capabilityBroker';

// The full set of 32 capabilities defined by the Capability Broker.
const ALL_CAPABILITIES: AgentCapability[] = [
  // Tier A — reads
  'profile.read_public',
  'profile.read_private_preferences',
  'closet.read',
  'saved.read',
  'looks.read',
  'listings.read_own',
  'orders.read',
  'wallet.read_balance',
  'chat.read_current',
  'chat.read_selected_history',
  'search.run',
  // Tier B — drafts
  'profile.draft_edit',
  'listing.create_draft',
  'listing.draft_edit',
  'look.create_draft',
  'poster.create_draft',
  'chat.draft_reply',
  'offer.draft',
  'collection.create_draft',
  // Tier C — publish / send
  'chat.send',
  'listing.publish',
  'look.publish',
  'poster.publish',
  'profile.apply_edit',
  // Tier D — financial / security
  'offer.send',
  'auction.bid',
  'auction.buy_now',
  'coown.place_order',
  'wallet.convert',
  'wallet.withdraw',
  'payment.confirm',
  'account.change_security',
];

describe('agentDefinition — DEFAULT_CAPABILITIES_BY_CATEGORY', () => {
  const CATEGORIES: AgentCategory[] = [
    'assistant',
    'styling',
    'commerce',
    'moderation',
    'safety',
    'automation',
  ];

  it('has an entry for every agent category', () => {
    for (const category of CATEGORIES) {
      expect(DEFAULT_CAPABILITIES_BY_CATEGORY[category]).toBeDefined();
      expect(Array.isArray(DEFAULT_CAPABILITIES_BY_CATEGORY[category])).toBe(true);
    }
  });

  it('only contains valid AgentCapability values', () => {
    const valid = new Set(ALL_CAPABILITIES);
    for (const category of CATEGORIES) {
      for (const cap of DEFAULT_CAPABILITIES_BY_CATEGORY[category]) {
        expect(valid.has(cap), `unknown capability "${cap}" in ${category}`).toBe(true);
      }
    }
  });

  it('never grants Tier C (publish/send) or Tier D (financial) by default', () => {
    for (const category of CATEGORIES) {
      for (const cap of DEFAULT_CAPABILITIES_BY_CATEGORY[category]) {
        const tier = CAPABILITY_TIER[cap];
        expect(
          tier === 'A' || tier === 'B',
          `${category} default grants must not include Tier C/D capability "${cap}" (tier ${tier})`
        ).toBe(true);
      }
    }
  });

  it('grants the expected capabilities for each category', () => {
    expect(DEFAULT_CAPABILITIES_BY_CATEGORY.assistant).toEqual([
      'profile.read_public',
      'closet.read',
      'saved.read',
      'search.run',
      'chat.draft_reply',
    ]);
    expect(DEFAULT_CAPABILITIES_BY_CATEGORY.styling).toEqual([
      'profile.read_public',
      'closet.read',
      'looks.read',
      'chat.draft_reply',
      'look.create_draft',
    ]);
    expect(DEFAULT_CAPABILITIES_BY_CATEGORY.commerce).toEqual([
      'listings.read_own',
      'orders.read',
      'listing.create_draft',
      'listing.draft_edit',
      'offer.draft',
    ]);
    expect(DEFAULT_CAPABILITIES_BY_CATEGORY.moderation).toEqual([
      'chat.read_current',
      'chat.read_selected_history',
    ]);
    expect(DEFAULT_CAPABILITIES_BY_CATEGORY.safety).toEqual([
      'chat.read_current',
      'chat.read_selected_history',
    ]);
    expect(DEFAULT_CAPABILITIES_BY_CATEGORY.automation).toEqual([
      'profile.read_public',
      'listings.read_own',
      'orders.read',
      'listing.create_draft',
    ]);
  });
});

describe('agentDefinition — CAPABILITY_RISK_LABELS coverage', () => {
  it('covers all 32 capabilities', () => {
    expect(Object.keys(CAPABILITY_RISK_LABELS)).toHaveLength(32);
    for (const cap of ALL_CAPABILITIES) {
      expect(
        CAPABILITY_RISK_LABELS[cap],
        `missing risk label for "${cap}"`
      ).toBeDefined();
    }
  });

  it('every label has a non-empty string label and a valid risk level', () => {
    const validRisks = new Set(['low', 'medium', 'high', 'critical']);
    for (const cap of ALL_CAPABILITIES) {
      const entry = CAPABILITY_RISK_LABELS[cap];
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
      expect(validRisks.has(entry.risk), `invalid risk "${entry.risk}" for ${cap}`).toBe(true);
    }
  });
});

describe('agentDefinition — risk levels match capability tiers', () => {
  it('RISK_TO_TIER maps each risk to the correct approval tier', () => {
    expect(RISK_TO_TIER.low).toBe('A');
    expect(RISK_TO_TIER.medium).toBe('B');
    expect(RISK_TO_TIER.high).toBe('C');
    expect(RISK_TO_TIER.critical).toBe('D');
  });

  it('reads are low risk', () => {
    const reads: AgentCapability[] = [
      'profile.read_public',
      'closet.read',
      'saved.read',
      'looks.read',
      'listings.read_own',
      'orders.read',
      'chat.read_current',
      'search.run',
    ];
    for (const cap of reads) {
      expect(CAPABILITY_RISK_LABELS[cap].risk).toBe('low');
      expect(CAPABILITY_TIER[cap]).toBe('A');
    }
  });

  it('drafts are medium risk', () => {
    const drafts: AgentCapability[] = [
      'profile.draft_edit',
      'listing.create_draft',
      'listing.draft_edit',
      'look.create_draft',
      'poster.create_draft',
      'chat.draft_reply',
      'offer.draft',
      'collection.create_draft',
      'profile.read_private_preferences',
      'wallet.read_balance',
      'chat.read_selected_history',
    ];
    for (const cap of drafts) {
      expect(CAPABILITY_RISK_LABELS[cap].risk).toBe('medium');
    }
  });

  it('publish/send capabilities are high risk', () => {
    const publish: AgentCapability[] = [
      'chat.send',
      'listing.publish',
      'look.publish',
      'poster.publish',
      'profile.apply_edit',
    ];
    for (const cap of publish) {
      expect(CAPABILITY_RISK_LABELS[cap].risk).toBe('high');
      expect(CAPABILITY_TIER[cap]).toBe('C');
    }
  });

  it('financial / security capabilities are critical risk', () => {
    const financial: AgentCapability[] = [
      'offer.send',
      'auction.bid',
      'auction.buy_now',
      'coown.place_order',
      'wallet.convert',
      'wallet.withdraw',
      'payment.confirm',
      'account.change_security',
    ];
    for (const cap of financial) {
      expect(CAPABILITY_RISK_LABELS[cap].risk).toBe('critical');
      expect(CAPABILITY_TIER[cap]).toBe('D');
    }
  });

  it('high and critical risk labels are consistent with the broker tiers', () => {
    // The UI risk vocabulary is mostly aligned with the broker tiers, but a
    // few sensitive Tier A reads (private preferences, wallet balance, chat
    // history) are elevated to 'medium' UI risk. The strict 1:1 mapping only
    // holds for the high/critical bands, which is what matters for the
    // approval boundary.
    for (const cap of ALL_CAPABILITIES) {
      const risk = CAPABILITY_RISK_LABELS[cap].risk;
      if (risk === 'high') {
        expect(CAPABILITY_TIER[cap]).toBe('C');
        expect(RISK_TO_TIER.high).toBe('C');
      } else if (risk === 'critical') {
        expect(CAPABILITY_TIER[cap]).toBe('D');
        expect(RISK_TO_TIER.critical).toBe('D');
      }
    }
  });
});

describe('agentDefinition — CAPABILITIES_BY_RISK grouping', () => {
  it('partitions all 32 capabilities across the four risk groups with no overlap', () => {
    const grouped = [
      ...CAPABILITIES_BY_RISK.low,
      ...CAPABILITIES_BY_RISK.medium,
      ...CAPABILITIES_BY_RISK.high,
      ...CAPABILITIES_BY_RISK.critical,
    ];
    expect(grouped).toHaveLength(32);
    expect(new Set(grouped).size).toBe(32);
    for (const cap of grouped) {
      expect(ALL_CAPABILITIES.includes(cap)).toBe(true);
    }
  });

  it('places each capability in the group matching its risk label', () => {
    for (const cap of CAPABILITIES_BY_RISK.low) {
      expect(CAPABILITY_RISK_LABELS[cap].risk).toBe('low');
    }
    for (const cap of CAPABILITIES_BY_RISK.medium) {
      expect(CAPABILITY_RISK_LABELS[cap].risk).toBe('medium');
    }
    for (const cap of CAPABILITIES_BY_RISK.high) {
      expect(CAPABILITY_RISK_LABELS[cap].risk).toBe('high');
    }
    for (const cap of CAPABILITIES_BY_RISK.critical) {
      expect(CAPABILITY_RISK_LABELS[cap].risk).toBe('critical');
    }
  });
});

describe('agentDefinition — buildInitialCapabilityGrants', () => {
  it('returns a grant for every capability (32)', () => {
    const grants = buildInitialCapabilityGrants('assistant');
    expect(grants).toHaveLength(32);
  });

  it('enables exactly the default capabilities for the category', () => {
    const grants = buildInitialCapabilityGrants('commerce');
    const enabled = grants.filter((g) => g.enabled).map((g) => g.capability);
    expect(enabled).toEqual(DEFAULT_CAPABILITIES_BY_CATEGORY.commerce);
  });

  it('defaults low/medium to ask_once and high/critical to always_ask', () => {
    const grants = buildInitialCapabilityGrants('assistant');
    for (const g of grants) {
      const risk = CAPABILITY_RISK_LABELS[g.capability].risk;
      if (risk === 'low' || risk === 'medium') {
        expect(g.approvalMode).toBe('ask_once');
      } else {
        expect(g.approvalMode).toBe('always_ask');
      }
    }
  });
});
