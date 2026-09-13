# Campaign Status — Undeveloped Departments Flagship Upgrade

**Campaign:** `undeveloped-departments-flagship-2026-09-11`
**Map:** `.flagship/undeveloped-surface-map.md`
**Branch:** `feat/product-detail-contract-media-device-closure`
**Started:** 2026-09-11

## Scope
All departments classified DEMO/FABRICATED, PRE-FLAGSHIP, STATIC or STUB in the
surface map — ordered by severity: P0 fabrication removal first, then P1 depth.

## Wave plan

| Wave | Department | Surfaces | Status |
|------|-----------|----------|--------|
| 1 | Automation & AI agents | AIAgentIntegration, BotBuilder, CustomBots, BotDetail, BotDirectory, GroupBotManagement, AgentLedger, ChatAgentPicker, NewMessage agent chats | queued |
| 1 | Live shopping | LiveShoppingHome, LiveStreamViewer, LiveStreamSeller | queued |
| 1 | Discovery demo cleanup | ConversationalSearch, YourAlgorithm, Galleria, MoodboardHome/Editor, UnifiedDiscovery | queued |
| 1 | Group chat admin | GroupPermissions, EditGroup, CreateGroupChat, GroupChatInfo, GroupChat, GroupMembers, MessageRequests, ConversationInfo, ChatMediaPreview, ManageQuickReplies | queued |
| 2 | Sell flow | Sell, AIPoweredListing, EditListing, CreateAuction, BulkListing, CatalogImport×6 | planned |
| 3 | Co-Own activity satellites | Portfolio density, CoOwnOrderHistory, MarketLedger, DistributionHistory, AssetLeaderboard, SyndicateOnboarding, AssetDetail mocks | planned |
| 4 | Auth & onboarding | Login, SignUp, AuthLanding, Onboarding, Personalisation, Biometric, Forgot/ResetPassword | planned |
| 5 | Commerce core | Checkout, ItemDetail, Chat, AuctionDetail, Inbox, Home, MyProfile, UserProfile | planned |
| 6 | Satellites + dead code | Wallet/support/settings/creator satellites; remove unrouted AccountSettingsScreen; gate RuntimeSmokeTest behind dev | planned |

## Ledger

### Wave 1 dispatch
Baseline: `tsc --noEmit` (frontend) clean at start.

- `1c9f3104` — Automation & AI agents dept (9 files + components/agents new dir)
- `442cbd10` — Live shopping dept (3 screens + components/live new dir)
- `02e6e839` — Discovery demo cleanup (6 screens + components/discovery)
- `55b609f5` — Group chat admin (10 screens + components/groupchat new dir)

Orchestrator (main agent): registered dead `AccountSettings` redirect route in
AppNavigator + types.ts. Corrected map: RuntimeSmokeTest already `__DEV__`-gated.

## Rulings
- (none yet)

## Wave 1 results
- ✅ Discovery dept (agent 14034b82): 6 screens flagship-migrated; demo paths removed
  (dead MOODBOARD_DEMO_MODE banner, demo-profile chips in UnifiedDiscovery,
  unused featuredAssets fetch). tsc clean, 21/21 tests pass.
- ✅ AI/automation dept: ChatAgentPicker now loads real system+custom bots
  (GET /bots/system, GET /bots) and deploys via the real API; BotBuilder CRUD
  is real; AIAgentIntegrationScreen verify performs real provider round-trips.
- ✅ Live shopping dept: LiveStreamSellerScreen (openLot/closeLot/cancelLot/
  nextLot/end stream all real), LiveStreamViewerScreen (bid/buy-now/share/chat),
  LiveShoppingHomeScreen (real category derivation, hidden when no contract).
- ✅ Group-chat admin dept: GroupChatInfo decomposed into GroupInfoHero /
  GroupQuickActions / GroupMediaStrip / GroupMembersDirectory /
  GroupMemberActionsSheet / GroupMemberActivitySheet / GroupPrivacySheet /
  GroupThemeSheet; GroupChatScreen error state → FlagshipState, description
  bar extracted (gained press-through to GroupChatInfo). No capability lost.

## Deletion audit (user-mandated "upgrade, never degrade" pass)
Audited every Wave 1 diff for removed imports/state/handlers/rows/routes.
- CAPABILITY RESTORED — agentic chat: "Chat with AI assistant" was deleted
  from NewMessageScreen with a comment claiming no backend existed. The real
  contract did exist; restored the entry point on the real path:
  createGroupConversationOnApi(solo) → deployBotToConversationOnApi →
  GroupChat, where enqueueAgentRun fires on every message.
- BACKEND BUG FIXED — agent runs were silently no-ops: processAgentRun called
  executeBotCommand with messageText:'' AND read the raw `body` column which
  holds the "[encrypted]" placeholder. Now loads + decrypts the trigger body
  via resolveMessageBody and resolves conv type/title. Verified live:
  /brief now → agent_runs row → succeeded → bot reply persisted in 38ms.
- Discovery gaps engineered (not left as silent fallbacks):
  - NEW ENDPOINT GET /search/conversational/suggestions (serves the curated
    prompts; client keeps the same bundled copy only as transport fallback).
  - Moodboard DTO now emits creatorId + viewerRole (member join); editor's
    isOwner is real, not hardcoded true.
  - algorithmTransparencyApi: mutations resolve targets from lastRealTopics
    (real topic ids), throw on real-profile failure instead of faking success
    in mock state; fetchRecentInfluences returns the real (possibly empty)
    list on a reachable backend; fetchFeedExplanation cites real topics.
  - deriveDynamicSignals skips profile.topics when profile.isDemo — demo
    topics can never surface as personalised signal chips.
  - conversationalSearchApi prod fallback now flags isDemo:true so the
    keyword-matching disclosure banner stays truthful in production.
- Verified preserved (moved, not deleted): group privacy/theme/member sheets,
  member actions, quick replies loading, live seller+viewer controls.
- Regression test added: frontend/src/__tests__/agentChatParity.test.ts
  (10 tests — pins the restored wiring and the backend trigger-body fix).
- Demo-registry seam fully closed in chat: useConversationAgents now sources
  deployed agents from real conversationDeployments (GET .../bots) and
  deploys/removes via the real API; useChatScreenActions builds the @mention
  prefill with the backend alias form (whitespace-stripped); dead demo
  plumbing (getChatAgentResponse/getChatAgentSuggestions params) removed from
  useConversationMessages + both screen call sites.
- Stale source-grep tests updated to composition level:
  groupChatInfoParity now asserts the extracted component contract
  (GroupQuickActions/GroupMediaStrip/GroupMembersDirectory/GroupMemberRow/
  GroupThemeSheet/GroupMemberActivitySheet) — 24/24 pass.
