# Phase 3 → Phase 4 Delta

## What Phase 3 changed (do not undo)

### Agent Capability Broker (P0)
- `platform/agents/capabilityBroker.ts` — 407 lines, 32 typed capabilities, 4 tiers
- `__tests__/agentCapabilityBroker.test.ts` — 25 tests, all passing
- Transaction bypass protection: `canAgentBypassCanonicalUI()` always returns false
- Integrates with `agentActivityLedger.ts` for audit trail

### Poster Frame-Native Composer (P1)
- `creator/poster/PosterComposerScreen.tsx` — 1268 lines, dedicated frame-first UX
- `creator/poster/PosterComposerParts.tsx` — 256 lines, extracted sub-components
- Does NOT import from CreatorStudioShell
- Frame navigation via horizontal swipe
- Advanced controls behind More menu

### Agent Draft vs Sent (P1)
- `hooks/chat/types.ts` — added 'draft' to Message status union
- `hooks/chat/useConversationMessages.ts` — agent messages get status: "draft"
- `components/chat/MessageBubble.tsx` — draft rendering with dashed border + Send button
- `screens/ChatScreen.tsx` — wired confirmAgentDraft

### Anti-AI Residue Cleanup (P2)
- 55 comments cleaned across 18 files
- Zero code logic changes
- Patterns removed: Instagram/Snapchat/TikTok pattern, flagship 2026, premium glassmorphism, Psychology

### Production Residue CI Gate (P2)
- `scripts/check-production-residue.mjs` — 471 lines
- 6 ERROR patterns, 5 WARNING patterns
- Added as `check:residue` npm script
- Current: 0 errors, 35 warnings (non-blocking)

## What was already fixed before Phase 3

### Profile TPP Bug
- `openProfile()` resolver normalizes self → MyProfile
- `UserProfileScreen` hardcodes `isSelfProfile={false}`
- Defensive redirect in useEffect

### Auction Filter
- Single `AuctionBrowseState` with one scope rail
- Server-driven facets with fallback

### Co-Own Asset Detail
- 3 cognitive layers: Asset → Market & position → Due diligence
- "Market open" instead of "Continuous · Open"
- Shared cached asset query

### Wallet
- Dedicated AddMoney, Withdraw, Earnings, Activity flows
- Refresh based on actual request completion

### Agent Platform
- Demo mode gated behind `__DEV__`
- No AsyncStorage for secrets
- Real connection probe
- Dynamic model discovery
- Pause all agents
- Activity ledger

### Creator
- Poster: one page per asset (frame model)
- Look: dedicated collage-native workspace
- Camera: clean recordAsync lifecycle, normalized zoom, truthful tap-focus

### Chat
- Controller hooks wired (useConversationMessages, useConversationComposer)
- No permanent agent chip strips
- Quick replies and agent suggestions don't stack

## What still needs work (Phase 4)

See `00_PHASE4_AUDIT_AND_INDEX.md` for the full work package list.
