import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Agent Capability Broker — spec 05 (Capability Broker, Permissions &
 * Approvals). These tests assert the security boundary that prevents agents
 * from bypassing canonical transaction UI and enforces the four approval
 * tiers.
 */

// In-memory AsyncStorage backing so the ledger and grant store actually
// persist across calls within a test. The global setup.ts mock returns
// `null` for every getItem, which would make the ledger always empty; we
// override it here with a real in-memory map.
const memoryStore = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => {
  return {
    default: {
      setItem: vi.fn((key: string, value: string) => {
        memoryStore.set(key, value);
        return Promise.resolve();
      }),
      getItem: vi.fn((key: string) => Promise.resolve(memoryStore.get(key) ?? null)),
      removeItem: vi.fn((key: string) => {
        memoryStore.delete(key);
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        memoryStore.clear();
        return Promise.resolve();
      }),
      getAllKeys: vi.fn(() => Promise.resolve(Array.from(memoryStore.keys()))),
      multiGet: vi.fn(() => Promise.resolve([])),
      multiSet: vi.fn(() => Promise.resolve()),
      multiRemove: vi.fn(() => Promise.resolve()),
    },
  };
});

import {
  CAPABILITY_TIER,
  TIER_D_NEVER_ALWAYS_ALLOW,
  requestCapability,
  resolveApproval,
  canAgentBypassCanonicalUI,
  isFinancialCapability,
  getGrant,
  clearGrants,
  type AgentCapability,
} from '../platform/agents/capabilityBroker';
import { getAgentActivity, clearAgentActivity } from '../services/agentActivityLedger';

const TIER_A_CAP: AgentCapability = 'profile.read_public';
const TIER_B_CAP: AgentCapability = 'listing.create_draft';
const TIER_C_CAP: AgentCapability = 'chat.send';
const TIER_D_CAP: AgentCapability = 'offer.send';

const AGENT_ID = 'agent_test_001';

describe('Agent Capability Broker', () => {
  beforeEach(async () => {
    memoryStore.clear();
    await clearGrants();
    await clearAgentActivity();
  });

  afterEach(async () => {
    memoryStore.clear();
    await clearGrants();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Tier mapping
  // -------------------------------------------------------------------------

  describe('CAPABILITY_TIER mapping', () => {
    it('maps every read capability to Tier A', () => {
      const reads: AgentCapability[] = [
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
      ];
      for (const cap of reads) {
        expect(CAPABILITY_TIER[cap]).toBe('A');
      }
    });

    it('maps every draft capability to Tier B', () => {
      const drafts: AgentCapability[] = [
        'profile.draft_edit',
        'listing.create_draft',
        'listing.draft_edit',
        'look.create_draft',
        'poster.create_draft',
        'chat.draft_reply',
        'offer.draft',
        'collection.create_draft',
      ];
      for (const cap of drafts) {
        expect(CAPABILITY_TIER[cap]).toBe('B');
      }
    });

    it('maps every publish/send capability to Tier C', () => {
      const publish: AgentCapability[] = [
        'chat.send',
        'listing.publish',
        'look.publish',
        'poster.publish',
        'profile.apply_edit',
      ];
      for (const cap of publish) {
        expect(CAPABILITY_TIER[cap]).toBe('C');
      }
    });

    it('maps every financial capability to Tier D', () => {
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
        expect(CAPABILITY_TIER[cap]).toBe('D');
      }
    });

    it('exposes TIER_D_NEVER_ALWAYS_ALLOW = true', () => {
      expect(TIER_D_NEVER_ALWAYS_ALLOW).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Tier A — auto-approval after grant
  // -------------------------------------------------------------------------

  describe('Tier A — auto-approval after explicit grant', () => {
    it('returns an approval request when no grant exists', async () => {
      const req = await requestCapability(AGENT_ID, TIER_A_CAP, 'Read public profile');
      expect(req.agentId).toBe(AGENT_ID);
      expect(req.capability).toBe(TIER_A_CAP);
      expect(req.tier).toBe('A');
      expect(req.summary).toBe('Read public profile');
    });

    it('auto-allows after an always_allow grant is recorded', async () => {
      const req = await requestCapability(AGENT_ID, TIER_A_CAP, 'Read public profile');
      const result = await resolveApproval(req, true, true);
      expect(result.approved).toBe(true);
      expect(result.reason).toBe('user_approved');

      // Grant should now exist.
      const grant = getGrant(AGENT_ID, TIER_A_CAP);
      expect(grant).toBeDefined();
      expect(grant?.policy).toBe('always_allow');
      expect(grant?.tier).toBe('A');

      // Subsequent request should still return a request object, but the
      // grant is present — callers check getGrant to detect auto-allow.
      const grantAfter = getGrant(AGENT_ID, TIER_A_CAP);
      expect(grantAfter?.policy).toBe('always_allow');
    });
  });

  // -------------------------------------------------------------------------
  // Tier B — automatic (draft / reversible)
  // -------------------------------------------------------------------------

  describe('Tier B — draft capabilities', () => {
    it('returns a request with tier B when no grant exists', async () => {
      const req = await requestCapability(AGENT_ID, TIER_B_CAP, 'Create listing draft');
      expect(req.tier).toBe('B');
    });

    it('records an always_allow grant when approved with alwaysAllow', async () => {
      const req = await requestCapability(AGENT_ID, TIER_B_CAP, 'Create listing draft');
      await resolveApproval(req, true, true);
      const grant = getGrant(AGENT_ID, TIER_B_CAP);
      expect(grant?.policy).toBe('always_allow');
      expect(grant?.tier).toBe('B');
    });
  });

  // -------------------------------------------------------------------------
  // Tier C — ask by default, allow with always_allow
  // -------------------------------------------------------------------------

  describe('Tier C — communicative / publication', () => {
    it('asks by default (no grant)', async () => {
      const req = await requestCapability(AGENT_ID, TIER_C_CAP, 'Send chat message');
      expect(req.tier).toBe('C');
      const grant = getGrant(AGENT_ID, TIER_C_CAP);
      expect(grant).toBeUndefined();
    });

    it('allows with always_allow after explicit approval', async () => {
      const req = await requestCapability(AGENT_ID, TIER_C_CAP, 'Send chat message');
      const result = await resolveApproval(req, true, true);
      expect(result.approved).toBe(true);
      expect(result.reason).toBe('user_approved');
      const grant = getGrant(AGENT_ID, TIER_C_CAP);
      expect(grant?.policy).toBe('always_allow');
    });

    it('records user_denied when rejected', async () => {
      const req = await requestCapability(AGENT_ID, TIER_C_CAP, 'Send chat message');
      const result = await resolveApproval(req, false, false);
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('user_denied');
      expect(getGrant(AGENT_ID, TIER_C_CAP)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Tier D — always explicit, never always_allow
  // -------------------------------------------------------------------------

  describe('Tier D — financial / high-risk', () => {
    it('asks by default (no grant)', async () => {
      const req = await requestCapability(AGENT_ID, TIER_D_CAP, 'Send offer $40');
      expect(req.tier).toBe('D');
    });

    it('never records an always_allow grant even when alwaysAllow=true', async () => {
      const req = await requestCapability(AGENT_ID, TIER_D_CAP, 'Send offer $40');
      const result = await resolveApproval(req, true, true);
      // Approved, but the reason reflects that Tier D required explicit approval.
      expect(result.approved).toBe(true);
      expect(result.reason).toBe('tier_d_requires_explicit');
      // No always_allow grant should be persisted.
      const grant = getGrant(AGENT_ID, TIER_D_CAP);
      expect(grant).toBeUndefined();
    });

    it('records user_denied when rejected', async () => {
      const req = await requestCapability(AGENT_ID, TIER_D_CAP, 'Send offer $40');
      const result = await resolveApproval(req, false, false);
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('user_denied');
    });

    it('is never auto-allowed even if a stale always_allow grant existed', async () => {
      // Force a stale grant into the store via a Tier C approval, then
      // request a Tier D capability for the same agent — the broker must
      // still ask.
      const cReq = await requestCapability(AGENT_ID, TIER_C_CAP, 'Send chat message');
      await resolveApproval(cReq, true, true);
      expect(getGrant(AGENT_ID, TIER_C_CAP)?.policy).toBe('always_allow');

      const dReq = await requestCapability(AGENT_ID, TIER_D_CAP, 'Send offer $40');
      expect(dReq.tier).toBe('D');
      // No grant for the Tier D capability.
      expect(getGrant(AGENT_ID, TIER_D_CAP)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Transaction bypass protection
  // -------------------------------------------------------------------------

  describe('canAgentBypassCanonicalUI', () => {
    it('returns false for every financial capability', () => {
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
        expect(canAgentBypassCanonicalUI(cap)).toBe(false);
      }
    });

    it('returns false for non-financial capabilities too — no bypass allowed', () => {
      expect(canAgentBypassCanonicalUI('chat.send')).toBe(false);
      expect(canAgentBypassCanonicalUI('listing.publish')).toBe(false);
      expect(canAgentBypassCanonicalUI('profile.read_public')).toBe(false);
    });

    it('isFinancialCapability identifies Tier D capabilities', () => {
      expect(isFinancialCapability('offer.send')).toBe(true);
      expect(isFinancialCapability('wallet.withdraw')).toBe(true);
      expect(isFinancialCapability('chat.send')).toBe(false);
      expect(isFinancialCapability('search.run')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Grant persistence
  // -------------------------------------------------------------------------

  describe('grant persistence', () => {
    it('persists a grant with a stable id, tier, policy and timestamp', async () => {
      const req = await requestCapability(AGENT_ID, TIER_A_CAP, 'Read public profile');
      await resolveApproval(req, true, true);
      const grant = getGrant(AGENT_ID, TIER_A_CAP);
      expect(grant).toBeDefined();
      expect(grant?.id).toMatch(/^grant_/);
      expect(grant?.agentId).toBe(AGENT_ID);
      expect(grant?.capability).toBe(TIER_A_CAP);
      expect(grant?.tier).toBe('A');
      expect(grant?.policy).toBe('always_allow');
      expect(typeof grant?.grantedAt).toBe('string');
      // ISO timestamp should parse.
      expect(() => new Date(grant!.grantedAt).toISOString()).not.toThrow();
    });

    it('clearGrants removes grants for a specific agent', async () => {
      const req = await requestCapability(AGENT_ID, TIER_A_CAP, 'Read public profile');
      await resolveApproval(req, true, true);
      expect(getGrant(AGENT_ID, TIER_A_CAP)).toBeDefined();
      await clearGrants(AGENT_ID);
      expect(getGrant(AGENT_ID, TIER_A_CAP)).toBeUndefined();
    });

    it('clearGrants() with no argument removes all grants', async () => {
      const req1 = await requestCapability(AGENT_ID, TIER_A_CAP, 'Read public profile');
      await resolveApproval(req1, true, true);
      const req2 = await requestCapability('agent_other', TIER_C_CAP, 'Send chat');
      await resolveApproval(req2, true, true);
      await clearGrants();
      expect(getGrant(AGENT_ID, TIER_A_CAP)).toBeUndefined();
      expect(getGrant('agent_other', TIER_C_CAP)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Ledger integration
  // -------------------------------------------------------------------------

  describe('activity ledger integration', () => {
    it('records approval_requested when no grant exists', async () => {
      await clearGrants();
      await requestCapability(AGENT_ID, TIER_C_CAP, 'Send chat message');
      const activity = await getAgentActivity();
      const requested = activity.find(
        (e) => e.type === 'approval_requested' && e.agent === AGENT_ID,
      );
      expect(requested).toBeDefined();
      expect(requested?.capability).toBe(TIER_C_CAP);
      expect(requested?.policyTier).toBe('C');
    });

    it('records approval_granted when a request is approved', async () => {
      await clearGrants();
      const req = await requestCapability(AGENT_ID, TIER_C_CAP, 'Send chat message');
      await resolveApproval(req, true, false);
      const activity = await getAgentActivity();
      const granted = activity.find(
        (e) => e.type === 'approval_granted' && e.agent === AGENT_ID,
      );
      expect(granted).toBeDefined();
    });

    it('records approval_denied when a request is rejected', async () => {
      await clearGrants();
      const req = await requestCapability(AGENT_ID, TIER_D_CAP, 'Send offer $40');
      await resolveApproval(req, false, false);
      const activity = await getAgentActivity();
      const denied = activity.find(
        (e) => e.type === 'approval_denied' && e.agent === AGENT_ID,
      );
      expect(denied).toBeDefined();
      expect(denied?.approval).toBe('denied');
    });
  });
});
