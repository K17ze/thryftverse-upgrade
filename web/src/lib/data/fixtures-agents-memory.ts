/**
 * Agent memory fixtures — the /agent-memory seed for fixture mode.
 * Dates live in the fixture world (Sep 2026) and are deterministic so
 * SSR and client render identically.
 *
 * Honesty: every row is a plausible durable fact about the fixture
 * member, scoped to a real fixture bot (or all bots when botId is null),
 * with the provenance fields the server contract carries — source,
 * confidence, use count. Retracted rows seed nothing here because the
 * list only shows what agents can still use.
 */

import type { AgentMemory, AgentMemorySettings } from '@/lib/contracts/agents';

export const AGENT_MEMORY_SETTINGS: AgentMemorySettings = {
  memoryEnabled: true,
  extractionEnabled: true,
};

export const AGENT_MEMORIES: AgentMemory[] = [
  {
    id: 'mem-001',
    botId: 'bot-listing-copilot',
    kind: 'preference',
    content: 'Titles lead with the brand and era — “Vintage Carhartt detroit jacket 90s”, not the other way round.',
    status: 'active',
    confidence: 0.92,
    sourceType: 'explicit',
    sourceConversationId: null,
    useCount: 6,
    lastUsedAt: '2026-09-28T18:41:00Z',
    createdAt: '2026-08-30T10:15:00Z',
    validFrom: '2026-08-30T10:15:00Z',
    validTo: null,
  },
  {
    id: 'mem-002',
    botId: null,
    kind: 'fact',
    content: 'Wears UK size 10 and EU 41 shoes.',
    status: 'active',
    confidence: 0.98,
    sourceType: 'explicit',
    sourceConversationId: null,
    useCount: 14,
    lastUsedAt: '2026-09-27T09:10:00Z',
    createdAt: '2026-07-12T16:02:00Z',
    validFrom: '2026-07-12T16:02:00Z',
    validTo: null,
  },
  {
    id: 'mem-003',
    botId: 'bot-offer-drafter',
    kind: 'directive',
    content: 'Never draft a counter-offer above £40 without asking first.',
    status: 'active',
    confidence: 1,
    sourceType: 'explicit',
    sourceConversationId: null,
    useCount: 3,
    lastUsedAt: '2026-09-24T12:04:00Z',
    createdAt: '2026-09-02T19:48:00Z',
    validFrom: '2026-09-02T19:48:00Z',
    validTo: null,
  },
  {
    id: 'mem-004',
    botId: 'bot-price-watch',
    kind: 'preference',
    content: 'Only alert on drops of 15% or more — smaller moves are noise.',
    status: 'active',
    confidence: 0.88,
    sourceType: 'conversation',
    sourceConversationId: 'conv-9f3a21',
    useCount: 9,
    lastUsedAt: '2026-09-26T20:00:00Z',
    createdAt: '2026-08-21T08:37:00Z',
    validFrom: '2026-08-21T08:37:00Z',
    validTo: null,
  },
  {
    id: 'mem-005',
    botId: null,
    kind: 'episodic_summary',
    content: 'Declined two bundle suggestions this month — prefers single-item orders.',
    status: 'active',
    confidence: 0.71,
    sourceType: 'extraction',
    sourceConversationId: null,
    useCount: 2,
    lastUsedAt: '2026-09-22T21:15:00Z',
    createdAt: '2026-09-22T21:15:00Z',
    validFrom: '2026-09-22T21:15:00Z',
    validTo: null,
  },
];
