# Exact Code Evidence & Change Map

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Audited baseline

`feat/product-detail-contract-media-device-closure` @ `315a0760267354be46fec8a5f83ad8746badd392`

| File | Fresh evidence | Required Phase 3 change | Priority |
|---|---|---|---|
| `frontend/src/screens/AIAgentIntegrationScreen.tsx` | demo-mode provider screen; format validation described as saved connection | rebuild as Connections + real adapter probe | P0 |
| `frontend/src/services/aiProviderApi.ts` | SecureStore else AsyncStorage secret fallback; hardcoded model catalogue | secure vault only; dynamic discovery | P0 |
| `frontend/src/services/chatAgentsApi.ts` | `CHAT_AGENTS_DEMO_MODE`; deterministic template replies; in-memory deployments | remove/gate production dependency; real AgentSession service | P0 |
| `frontend/src/screens/BotDirectoryScreen.tsx` | catalogue of specialist bots | rebuild as Agents Home | P1 |
| `frontend/src/screens/BotBuilderScreen.tsx` | `ChatAgentConfig` imported from `mockData`; pseudo model choices; two permissions | AgentDefinition builder using Connections/Capabilities | P0 |
| `frontend/src/screens/SettingsScreen.tsx` | agent/provider routes still Advanced & developer | real consumer Agents & connections; developer diagnostics remain advanced | P1 |
| `frontend/src/screens/UserProfileScreen.tsx` | public route computes `isSelfProfile`; owner store substitution | public-only route; self normalization | P0 |
| `frontend/src/components/profile/ProfileHero.tsx` | self branch exposes Edit Profile | split owner/public action composition | P0 |
| all `UserProfile` call sites | direct navigation possible | canonical `openProfile()` helper | P0 |
| `frontend/src/creator/CreatorContext.tsx` | Poster/Look model is now correct; some ad-hoc Date/Random IDs | retain split; canonical IDs; seed guard | P1 |
| `frontend/src/creator/CreatorStudioShell.tsx` | giant shared shell owns both creator products and all UI machinery | split PosterComposer / LookComposer | P1 |
| `frontend/src/creator/CreatorAssetPicker.tsx` | huge generic picker mode union | contextual/lazy specialized drawers | P1 |
| `frontend/src/screens/AssetDetailScreen.tsx` | improved layered PDP but market vocabulary still early | collectible-first top; market microstructure deeper | P1 |
| `frontend/src/screens/AssetDueDiligenceScreen.tsx` | correct separation, repeated settings-like section language | evidence-report art direction + shared query | P1 |
| `frontend/src/screens/ChatScreen.tsx` | very broad controller; demo-agent concepts embedded | human-first UI + real Agent Session + decomposition | P1 |
| `frontend/src/screens/WalletScreen.tsx` | Home + seller earnings + Add/Buy/Redeem/Withdraw/History/Activity inline | task-first Home + dedicated flows | P1 |
| `frontend/src/components/commerce/CommerceMediaStage.tsx` | latest HEAD fixed viewability callback identity | preserve invariant with regression test | P0 regression |
| production comments | repeated reference/spec/premium language | cleanup intent comments + residue scan | P2 |

## New Agent architecture

```text
frontend/src/platform/agents/
  domain/
    AgentDefinition.ts
    AgentSession.ts
    AgentCapability.ts
    AgentEvent.ts
  runtime/
    AgentRuntimeAdapter.ts
    RuntimeRegistry.ts
    DirectProviderAdapter.ts
    ClaudeManagedAgentAdapter.ts
    AppleFoundationModelAdapter.native.ts
    AndroidAdkAdapter.native.ts
    RemoteHostAdapter.ts
    CodexRemoteHostAdapter.ts
    HermesRemoteHostAdapter.ts
  security/
    AgentSecretVault.ts
    AgentApprovalPolicy.ts
  tools/
    AgentCapabilityBroker.ts
    ThryftverseToolRegistry.ts
  services/
    AgentSessionService.ts
    AgentActivityService.ts
```

## New Profile architecture

```text
frontend/src/navigation/openProfile.ts
frontend/src/components/profile/ProfileIdentityHero.tsx
frontend/src/components/profile/PublicProfileActions.tsx
frontend/src/components/profile/OwnerProfileActions.tsx
```

## New Creator architecture

```text
frontend/src/creator/poster/PosterComposerScreen.tsx
frontend/src/creator/poster/PosterFrameNavigator.tsx
frontend/src/creator/poster/PosterContextToolbar.tsx

frontend/src/creator/look/LookComposerScreen.tsx
frontend/src/creator/look/LookObjectToolbar.tsx
frontend/src/creator/look/LookAddDrawer.tsx
```

## Wallet decomposition

```text
frontend/src/screens/wallet/WalletHomeScreen.tsx
frontend/src/screens/wallet/AddMoneyScreen.tsx
frontend/src/screens/wallet/ConvertScreen.tsx
frontend/src/screens/wallet/WithdrawScreen.tsx
frontend/src/screens/wallet/EarningsScreen.tsx
frontend/src/screens/wallet/WalletActivityScreen.tsx
```

## Required deletion/gating

After migration:
- no production route exposes Bot* terminology;
- deterministic chat-agent mock generation is test/dev only or gone;
- provider secrets never use AsyncStorage;
- BotBuilder no longer imports mockData;
- public UserProfile has no owner/edit branch;
- one generic CreatorStudioShell is no longer the top-level product UI for both Poster and Look;
- WalletHome contains no full conversion forms inline.
