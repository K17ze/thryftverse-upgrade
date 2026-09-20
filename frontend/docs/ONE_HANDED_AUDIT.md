# One-Handed Reachability Audit (R114)

Per-flow audit of primary-action placement against the thumb zone on a
~6.1" phone held right-handed (bottom-centre arc, roughly the lower 60% of
the viewport up to the horizontal centre). Destructive and secondary
actions are intentionally excluded — reach optimization serves *primary*
actions only; destructive actions benefit from distance.

**Reading the table.** Placement cites the real container, not intent.
✅ = primary action in the bottom thumb arc. ⚠️ = reachable but not ideal.
❌ = primary action above the fold/top-anchored.

## Commerce flows

| Surface | Primary action | Placement | Verdict | Notes |
|---|---|---|---|---|
| Item detail (PDP) | Buy / Offer / Bid | `CommerceActionDock` — sticky bottom dock, safe-area padded | ✅ | Tier-adaptive CTAs stay in the dock; blocked-seller state renders a truthful dock, not a top banner |
| Cart | Checkout | Sticky footer | ✅ | |
| Checkout | Pay / Place order | Sticky footer (`paddingBottom: 300 + insets.bottom` content clearance) | ✅ | Footer hides when 1ZE selected — one-tap path is itself the thumb-zone affordance |
| Sell / listing composer | Publish | Bottom-anchored single-action dock (`DockConstants.singleActionHeight`) | ✅ | |
| Order detail | Track / contact seller | Scroll content; secondary actions | ✅ | Primary consumption is reading, not acting — no dock needed |
| Co-Own asset detail | Trade / place order | Bottom action area | ✅ | Step-up auth (biometric) on commit is modal — centre-screen by convention |

## Communication flows

| Surface | Primary action | Placement | Verdict | Notes |
|---|---|---|---|---|
| Chat conversation | Send message | `ChatComposer` pinned bottom, keyboard-avoiding | ✅ | Attach/voice controls inside the composer row — same arc |
| Live viewer | Bid / Buy + chat | `LiveLotDock` commerce dock + `LiveChatComposer` — both bottom-pinned on the stage | ✅ | The dock is the dominant commerce object; composer sits above it in the same arc |
| Live host console | Moderation actions | Long-press viewer rows → bottom action sheet | ✅ | Action sheet = bottom-sheet grammar; destructive kick separated from mute |

## Discovery flows

| Surface | Primary action | Placement | Verdict | Notes |
|---|---|---|---|---|
| Unified discovery | Browse feed / open listing | Masonry grid fills viewport; tiles span full reach area | ✅ | Search bar lives in the header — correct: discovery is scroll-first, search is pull-forward intent |
| Search | Type query | Header-anchored input with `autoFocus` (keyboard already raised → input reachable by thumb over keyboard) | ⚠️ | Standard search-tab grammar (Instagram/Depop); the autofocus means the thumb's first move is onto the keyboard, not the top field. Acceptable — flagged for measurement, not redesign |
| Visual search | Frame → confirm crop | Capture button bottom-centre; crop confirm in sheet | ✅ | Post-capture refinement is a modal bottom flow |

## Creation flows

| Surface | Primary action | Placement | Verdict | Notes |
|---|---|---|---|---|
| Moodboard editor | Arrange tiles | Full-canvas drag surface | ✅ | Undo/redo are edge toolbar controls — secondary by design |
| Camera / poster capture | Shutter | Bottom-centre | ✅ | Camera convention |

## Known exceptions (deliberate)

- **Back/close controls** sit top-left/top-right everywhere — OS convention; reaching back is a navigation act, not a flow action.
- **Search inputs** are header-anchored across the app (discovery, saved search, boards). Mitigations: autofocus raises the keyboard into the thumb zone; results occupy the reachable area. A bottom-anchored search field experiment is a candidate for the gestures review, not a defect.
- **Settings rows** are list-anchored (top-down) — settings are read-and-tap surfaces, not action flows.

## Method + honest limits

This audit is static: it reads component placement, not device telemetry.
Remaining for real evidence: (a) heat-map or reachability annotation on the
device-matrix screenshot sweeps, (b) a physical-device left/right-hand pass
on the five ✅-claimed primary flows. Until then the table documents
*placement intent verified in code*, not measured ergonomics.
