# Master Department-by-Department Implementation Checklist

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

# Master implementation checklist

## Global — P0
- [ ] Remove `GlobalSearchScreen` production sample editorial constants.
- [ ] Remove empty-URI editorial rendering.
- [ ] Remove competitor-branded sample content.
- [ ] Audit `sparkles`/wand/orb/AI gradient usage.
- [ ] Relabel listing autofill as neutral suggestions.
- [ ] Move Agent/API settings out of ordinary Settings.
- [ ] Create typography v2 contract.
- [ ] Create surface/radius rules.
- [ ] Create screenshot baseline.
- [ ] Create release-mode performance baseline.

## Home / Discovery
- [ ] Canonical feed-unit contract.
- [ ] One masonry implementation strategy.
- [ ] Product tile metadata budget.
- [ ] Video visibility playback.
- [ ] fallback art made neutral.
- [ ] back-scroll restoration QA.
- [ ] skeleton aspect parity.

## Search
- [ ] real recent/saved/trending inputs.
- [ ] no fake editorial.
- [ ] query suggestions.
- [ ] result filters.
- [ ] no-result refinement.
- [ ] visual search region refinement.
- [ ] server-driven editorial schema.

## PDP
- [ ] media/identity/value/action above fold.
- [ ] custom video controls.
- [ ] media poster metadata.
- [ ] condition evidence jump.
- [ ] seller trust compaction.
- [ ] tail rail budget.
- [ ] all transaction state screenshots.

## Sell
- [ ] media-first flow.
- [ ] cover/reorder.
- [ ] per-media upload state.
- [ ] progressive fields.
- [ ] neutral suggestions.
- [ ] listing-format disclosure.
- [ ] proceeds estimate.
- [ ] contextual authenticity prompts.
- [ ] review/publish.
- [ ] partial failure recovery.

## Poster Camera
- [ ] Quick Capture mode.
- [ ] simplified chrome.
- [ ] gallery uses canonical picker.
- [ ] image + video.
- [ ] ordered multi-select.
- [ ] safe-zone layout.
- [ ] hardware/permission failure.
- [ ] capture telemetry.

## Poster Media Picker
- [ ] split module.
- [ ] real album model.
- [ ] remove square-photo Selfies inference.
- [ ] remove duplicated recents rail.
- [ ] remove breathing animation.
- [ ] preview/reorder.
- [ ] limited-permission state.
- [ ] video preflight.

## Poster Studio
- [ ] primary tool set.
- [ ] secondary tool drawer.
- [ ] safe zones.
- [ ] gesture arbitration.
- [ ] undo/redo.
- [ ] keyboard QA.
- [ ] product-tag flow.
- [ ] document integrity tests.

## Poster Viewer
- [ ] evaluate cube transition.
- [ ] first-frame/loading threshold.
- [ ] background pause.
- [ ] reply keyboard.
- [ ] reduced motion.
- [ ] accessibility navigation.
- [ ] composition WYSIWYG test.

## Profile
- [ ] identity-first hero.
- [ ] trust compaction.
- [ ] stats optical alignment.
- [ ] self/public action variants.
- [ ] tab hierarchy.
- [ ] portfolio entry hierarchy.
- [ ] exact skeleton.

## Closet / Saved
- [ ] media mosaics.
- [ ] recent save.
- [ ] collection create.
- [ ] selection/reorder.
- [ ] privacy indicator if supported.

## Settings
- [ ] flat sections.
- [ ] account identity entry.
- [ ] new taxonomy.
- [ ] Advanced/Developer isolation.
- [ ] settings search deep-link.
- [ ] notification permission state.
- [ ] accessibility setting.

## Inbox
- [ ] segment reduction.
- [ ] request entry.
- [ ] commerce thumbnail grammar.
- [ ] unread state.
- [ ] swipe actions.
- [ ] seller mode linkage.

## Chat
- [ ] listing header.
- [ ] transaction event cards.
- [ ] attachment progress.
- [ ] retry.
- [ ] grouped time.
- [ ] keyboard.
- [ ] thread accessibility.

## Auctions
- [ ] presentation-state view model.
- [ ] lifecycle screenshots.
- [ ] live card hierarchy.
- [ ] bid sheet summary.
- [ ] result continuation.
- [ ] server time resume.
- [ ] urgency motion restraint.

## Checkout
- [ ] flat hierarchy.
- [ ] exact total.
- [ ] address/shipping/payment rows.
- [ ] canonical payment state.
- [ ] SCA resume.
- [ ] pending receipt.
- [ ] duplicate transaction guard visual QA.

## Wallet / Orders
- [ ] load/withdraw receipt.
- [ ] balance clarity.
- [ ] transaction history.
- [ ] order status timeline.
- [ ] tracking/support.
- [ ] no raw backend IDs.

## Seller Hub
- [ ] needs-attention hero.
- [ ] three-metric max snapshot.
- [ ] inventory status compact row.
- [ ] remove 8 KPI cards.
- [ ] remove 9 action-card stack.
- [ ] unified seller inbox.
- [ ] create once, not duplicated.
- [ ] inventory bulk flow.

## Co-Own
- [ ] truthful metric audit.
- [ ] positions rail.
- [ ] numeric typography.
- [ ] instrument density.
- [ ] asset detail hierarchy.
- [ ] ticket summary.
- [ ] confirmation receipt.
- [ ] portfolio density.
- [ ] disclosures.

## Accessibility
- [ ] 44/48 target audit.
- [ ] 200% text.
- [ ] reduced motion.
- [ ] transparency/contrast.
- [ ] VoiceOver/TalkBack.
- [ ] keyboard/web.
- [ ] state not color-only.

## Performance
- [ ] release-mode list profile.
- [ ] `getItemType` audit.
- [ ] nested `key` audit.
- [ ] memoized FlashList props.
- [ ] image resolution policy.
- [ ] video poster/prefetch.
- [ ] memory after long feed.
- [ ] memory after Poster sessions.
- [ ] web fallback policy.
