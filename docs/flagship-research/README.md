# ThryftVerse Flagship Upgrade — Research Programme

> **Mission:** Diagnose why ThryftVerse still renders and behaves like a 6/10 product from 2020 — "underdeveloped, low-quality AI-slop in so many places" — and produce a department-by-department, micro-and-macro upgrade plan that lifts every surface to 2026 flagship quality, benchmarked against Instagram, Pinterest, eBay and Snapchat as of **August 2026**.

This folder is the **research and prescription layer**. It is not the implementation. Each document covers one department of the product, cross-compares it against the relevant 2026 competitor benchmark, names the specific psychology and design principles that make the competitor feel premium, audits the current ThryftVerse implementation, and lists every micro and macro change required to reach flagship.

---

## How to read this folder

| File | Department | Primary benchmark |
|------|------------|-------------------|
| `00_2026_LANDSCAPE_BENCHMARK.md` | Macro cross-app synthesis, the "6/10 from 2020" root-cause, the flagship scorecard | Instagram · Pinterest · eBay · Snapchat (all) |
| `01_DESIGN_SYSTEM_TOKENS.md` | Theme, tokens, typography, motion, radii, iconography, flagship primitives | All four |
| `02_DISCOVERY_FEED.md` | Home, Browse, Galleria, Pulse feed, discovery scenes | Instagram · Pinterest |
| `03_PRODUCT_DETAIL_COMMERCE.md` | Item/Asset detail, checkout, commerce components | eBay · Pinterest |
| `04_SEARCH_VISUAL.md` | Search, global search, visual search, conversational search, saved searches | Pinterest · Instagram |
| `05_PROFILE_CREATOR_IDENTITY.md` | User/My profile, edit profile, profile components, identity | Instagram · Snapchat |
| `06_CHAT_MESSAGING.md` | Chat, group chat, inbox, message requests, chat media | Snapchat · Instagram |
| `07_CREATOR_STUDIO_TOOLS.md` | Creator suite, look, poster, outfit, moodboard, camera, capture | Snapchat · Instagram |
| `08_AUCTIONS_TRADING.md` | Auctions, trade hub, co-ownership, syndicate | eBay |
| `09_WALLET_PAYMENTS.md` | Wallet, payments, withdraw, earnings, balance | Fintech + eBay payouts |
| `10_SETTINGS_ACCOUNT.md` | Settings, account, security, privacy, data, accessibility | iOS/Android system patterns |
| `11_NAVIGATION_IA.md` | App navigator, tab navigator, linking, information architecture | Instagram · Pinterest |
| `12_ONBOARDING_AUTH.md` | Onboarding, auth landing, login, signup, age verification | Instagram · Snapchat |
| `13_NOTIFICATIONS_INBOX.md` | Notifications, inbox, notification preferences | Instagram · Snapchat |
| `14_SELL_LISTING_FLOW.md` | Sell, create camera, listing, bulk listing, listing preview/success | eBay · Instagram |
| `15_SKELETONS_STATE_COVERAGE.md` | Skeletons, empty, error, loading, partial, offline states | All four |
| `16_AI_FEATURES_ANTIPATTERNS.md` | The "AI-slop" diagnosis — AI agents, bots, AI listings, conversational search | All four + 2026 AI UX |
| `17_LIVE_SHOPPING_STREAMING.md` | Live shopping, live streaming (seller + viewer), real-time commerce video | TikTok Shop Live · Instagram Live · eBay Live |
| `18_ORDERS_POST_PURCHASE.md` | Orders, order detail, receipt, support, resolution centre, reviews, returns | eBay |
| `19_SUPPORT_HELP_TRUST.md` | Help & support, support tickets, report, buyer protection, verification | eBay · 2026 trust patterns |
| `20_CORE_UI_PRIMITIVES_SHEETS.md` | Core UI primitives — buttons, inputs, chips, sheets, modals, toasts | iOS/Android native + all four |
| `21_CLOSET_PERSONALISATION.md` | Closet, personalisation, style quiz, saved items, taste profile | Pinterest · 2026 personalisation |
| `22_2026_WEB_RESEARCH_COMPENDIUM.md` | Consolidated 2026 web research evidence — 99 URLs across all departments | All four + 2026 design trends |

---

## Flagship infrastructure & cross-cutting research (Phase 3)

The reports below cover the "missing flagship features" — infrastructure and cross-cutting concerns that a 2026 flagship app must have but that span multiple departments. Each follows the same 10-section structure: 2026 competitor benchmark, psychology & principles, architectural issues, AI slop diagnosis, current ThryftVerse audit (file:line), micro improvements, macro improvements, flagship acceptance criteria, priority & sequencing, token-level spec.

| File | Department | Primary benchmark |
|------|------------|-------------------|
| `23_ACCESSIBILITY_INCLUSIVE_DESIGN.md` | Accessibility, inclusive design, VoiceOver/TalkBack, dynamic type, colour contrast, reduced motion, cognitive accessibility | Apple HIG · Material Design · WCAG 2.2 |
| `24_PERFORMANCE_PERCEIVED_SPEED.md` | Performance, perceived speed, TTI, slow/frozen frames, OTA updates, bundle size, image loading | Instagram · Pinterest · eBay |
| `25_OFFLINE_NETWORK_RESILIENCE.md` | Offline-first, network resilience, optimistic updates, conflict resolution, cache strategy, retry/backoff | Instagram · eBay · fintech apps |
| `26_INTERNATIONALIZATION_LOCALIZATION.md` | i18n, l10n, RTL, currency, date/time formatting, translation management, OTA translations | Instagram · eBay · Snapchat |
| `27_PUSH_NOTIFICATIONS_DEEP_LINKING.md` | Push notifications, permission UX, channels, rich media, action buttons, grouping, deep linking, universal links | Instagram · Snapchat · eBay · Pinterest |
| `28_SECURITY_PRIVACY_UX.md` | Biometric auth, 2FA/TOTP, Passkeys, session management, GDPR/CCPA, data deletion, KYC, privacy manifest, ATT | Apple · Google · eBay · Instagram · fintech |
| `29_CONTENT_MODERATION_SAFETY.md` | Report flows, block/mute/restrict, prohibited items, counterfeit detection, appeal flows, trust & safety center, moderation pipeline | eBay · Instagram · Snapchat · Reddit |
| `30_GROWTH_RETENTION_MECHANICS.md` | Streaks, badges, referrals, viral loops, share-to-story, re-engagement, gamification, loyalty programs, Hook Model | Duolingo · eBay · Pinterest · Temu |
| `31_EMAIL_TRANSACTIONAL_COMMUNICATIONS.md` | Transactional emails, templates, SMS/OTP, email design, deliverability, preference centers, re-engagement emails, multi-channel orchestration | eBay · Stripe · Pinterest · Resend |
| `32_ANALYTICS_EXPERIMENTATION.md` | Event tracking, A/B testing, feature flags, crash reporting, funnels, retention cohorts, session replay, privacy-first analytics | Netflix · Pinterest · Spotify · PostHog · Sentry |

---

## Department-level upgrade research (Phase 4)

The reports below cover additional product departments that were identified as missing after the first three phases. Each follows the same 8-section structure: 2026 competitor benchmark, psychology & principles, current ThryftVerse audit (file:line), micro improvements, macro improvements, flagship acceptance criteria, priority & sequencing, token-level spec.

| File | Department | Primary benchmark |
|------|------------|-------------------|
| `33_VIDEO_PLAYER_REELS.md` | Video playback, full-screen vertical video (reels), video scrubbing, PiP, shoppable video, video compression | Instagram Reels · TikTok · Whatmore SDK · eBay Live |
| `34_STORIES_EPHEMERAL_CONTENT.md` | Story viewer, story creation, story stickers, 24h ephemeral content, story views tracking | Instagram Stories · Snapchat · Pinterest Story Pins |
| `35_COMMENTS_REACTIONS.md` | Comment threads, nested replies, emoji reactions, comment sorting, comment moderation, reaction picker | Instagram · Reddit · social.plus · Snapchat |
| `36_SOCIAL_GRAPH_FOLLOW.md` | Follow/unfollow, followers/following lists, mutual follows, follow recommendations, social graph traversal | Instagram · Snapchat · Pinterest |
| `37_RECOMMENDATION_ENGINE_PERSONALIZED_FEED.md` | "For You" feed, recommended items, ML-powered suggestions, behavioral data pipeline, taste profile, related products | Pinterest · Instagram · TikTok · eBay |
| `38_WISHLIST_SAVES_COLLECTIONS.md` | Save for later, wishlist, price-drop alerts, saved collections, saved searches, favorites | Pinterest · eBay · Instagram |
| `39_TABLET_IPAD_ADAPTIVE_LAYOUT.md` | Tablet layout, iPad adaptation, SplitView, list-detail patterns, NavigationRail, adaptive breakpoints, orientation handling | Apple HIG (iPad) · Material 3 Expressive · Instagram · eBay |
| `40_AUDIO_VOICE_FEATURES.md` | Voice messages, audio recording, audio playback, voice search, voice notes, waveform display, audio in stories | Snapchat · WhatsApp · Instagram · Telegram |
| `41_IMAGE_PICKER_GALLERY.md` | Image picker, multi-select gallery, camera roll, image editing, crop/rotate/filter, camera capture, media browser | Instagram · Snapchat · iOS Photos · Android Google Photos |
| `42_CART_MULTI_ITEM_CHECKOUT.md` | Shopping cart, multi-item checkout, bundle checkout, cart abandonment, bundle discounts | eBay · Shopify · Amazon · Instagram Shopping |

---

## Component-level upgrade research (Phase 2)

The department reports above diagnose whole product surfaces. The component-level reports below go deeper: each one takes a single primitive family and prescribes the exact token-level micro-spec needed to lift it to 2026 flagship quality, following the `Design.md` micro-spec format.

| File | Component family | Primary benchmark |
|------|------------------|-------------------|
| `COMPONENT_BUTTONS_ACTIONS.md` | Buttons, action bars, sticky footers, hold-to-submit, press feedback, haptics | Instagram · Pinterest · eBay |
| `COMPONENT_CARDS_SURFACES.md` | Cards, surfaces, elevation, radius, card-on-card, surface budget | Pinterest · Instagram · eBay |
| `COMPONENT_ICONS_CHIPS_BADGES.md` | Icons, chips, badges, tags, status pills, icon grammar | All four |
| `COMPONENT_INPUTS_FORMS.md` | Inputs, text fields, search bars, select rows, segment controls, form composition | Instagram · Snapchat |
| `COMPONENT_SHEETS_OVERLAYS.md` | Sheets, modals, bottom sheets, overlays, toasts, popovers | iOS/Android native |
| `COMPONENT_LAYOUTS_SPACING.md` | Layouts, spacing rhythm, rails, grid, safe-area, first-viewport composition | Instagram · Pinterest |
| `COMPONENT_MEDIA_TREATMENT.md` | Media rendering, art direction, focal points, progressive loading, blurhash, skeletons | Pinterest · Instagram |
| `COMPONENT_MOTION_HAPTICS.md` | Motion language, animation tokens, spring physics, haptic contracts, reduced-motion | All four |
| `COMPONENT_NAVIGATION_CHROME.md` | Headers, tab bars, back/close buttons, transparent-over-media headers, gesture nav | Instagram · Snapchat |
| `COMPONENT_COLOR_TYPOGRAPHY.md` | Color system, semantic colors, dark mode parity, type scale, type roles, text budget | All four |
| `COMPONENT_LISTS_SCROLLING.md` | FlatList, SectionList, masonry, carousels, horizontal rails, infinite scroll, scroll-to-top, list states | Instagram · Pinterest · eBay |
| `COMPONENT_AVATARS_IDENTITY.md` | Avatars, profile images, verified badges, online indicators, story rings, creator cards, social proof, follow buttons | Instagram · Snapchat · Pinterest |
| `COMPONENT_SKELETONS_STATES.md` | Loading skeletons, empty states, error states, partial states, offline states, retry patterns, state transitions | All four |
| `COMPONENT_TOASTS_SNACKBARS.md` | Toasts, snackbars, inline banners, success/error feedback, undo bars, push notification previews | iOS/Android native + all four |
| `COMPONENT_PULL_REFRESH_GESTURES.md` | Pull-to-refresh, swipe actions, long-press, drag-to-dismiss, pinch-to-zoom, swipe-to-navigate, haptic gesture feedback | All four |
| `COMPONENT_TABS_SEGMENTED.md` | Tab rails, segmented controls, scrollable tabs, tab indicators, underline vs pill semantics | Instagram · Pinterest · eBay |
| `COMPONENT_PROGRESS_INDICATORS.md` | Progress bars, circular progress, step indicators, upload progress, indeterminate spinners, ActivityIndicator replacement | Instagram · Snapchat · eBay |
| `COMPONENT_SLIDERS_RANGE.md` | Sliders, range pickers, scrubbers, seek bars, dual-thumb range sliders, Gesture.Pan migration | eBay · Pinterest |
| `COMPONENT_DATE_TIME_PICKERS.md` | Date pickers, time pickers, calendars, date range pickers, timezone handling, auction scheduling | eBay · Instagram |
| `COMPONENT_SELECTION_MULTISELECT.md` | Checkboxes, radio buttons, multi-select lists, selection mode, bulk action bars, select-all | eBay · Instagram |
| `COMPONENT_RATINGS_REVIEWS.md` | Star ratings, half-stars, review cards, rating distribution histograms, review filtering/sorting, category breakdown | eBay · Pinterest |
| `COMPONENT_SHARING_SOCIAL.md` | Share sheets, share-to-story, shareable card images, copy link, deep links, viral loop architecture | Instagram · Snapchat · eBay |
| `COMPONENT_CHARTS_DATAVIZ.md` | Line charts, bar charts, donut charts, sparklines, metric cards, analytics dashboards, tooltips | eBay · Instagram |
| `COMPONENT_MAPS_LOCATION.md` | Map views, address autocomplete, geolocation, saved addresses, address validation, location-based features | eBay · Instagram |
| `COMPONENT_RICH_TEXT.md` | Rich text rendering, markdown, mention parsing, hashtag parsing, inline link detection, attributed text | Instagram · Snapchat · eBay |
| `COMPONENT_COUNTERS_STEPPERS.md` | Quantity steppers, count badges, character counters, bounds enforcement, long-press fast-change | eBay · Instagram |
| `COMPONENT_DIVIDERS_SEPARATORS.md` | Section dividers, hairline separators, inset dividers, label dividers, stroke grammar for separators | Instagram · eBay |
| `COMPONENT_CONTEXT_MENUS_POPOVERS.md` | Long-press context menus, popover menus, overflow menus, dropdown menus, anchored popovers | Instagram · Snapchat · eBay |
| `COMPONENT_SEARCH_FILTER_UI.md` | Search bars, filter panels, filter sheets, sort controls, active filter chips, saved searches (component-level) | Instagram · Pinterest · eBay |
| `COMPONENT_KEYBOARD_INPUT_ACCESSORIES.md` | Keyboard avoiding views, input accessory bars, keyboard toolbars, return key behavior, scroll-to-focus | Instagram · Snapchat · eBay |
| `COMPONENT_TOOLTIPS_COACHMARKS.md` | Tooltips, coach marks, spotlights, feature discovery, onboarding walkthroughs, show-once tracking | Instagram · Snapchat · eBay |
| `COMPONENT_VIDEO_PLAYER.md` | Video playback controls, scrub bar, PiP, fullscreen, autoplay, muted/unmuted toggle, double-tap to like, product tag overlays | Instagram Reels · TikTok · expo-video |
| `COMPONENT_STORY_VIEWER.md` | Story viewer, progress segments, tap navigation, press-to-pause, story rings, story bar, story reply bar | Instagram Stories · Snapchat |
| `COMPONENT_COMMENTS_THREAD.md` | Comment list, threaded replies, comment input, comment likes, comment sorting, comment reporting, mentions/hashtags | Instagram · Reddit |
| `COMPONENT_REACTION_PICKER.md` | Emoji reaction bars, reaction picker popover, reaction counts, reacted-by-me state, expanded reaction set | Instagram · Facebook · social.plus |
| `COMPONENT_FOLLOW_BUTTON.md` | Follow/unfollow toggle, button states (primary/compact/inline), optimistic update, mutual follows badge, suggested users rail | Instagram · Snapchat · Pinterest |
| `COMPONENT_SAVE_WISHLIST_BUTTON.md` | Bookmark save button, save-to-collection picker, saved state animation, price-drop alert enrollment, back-in-stock enrollment | Instagram · eBay · Pinterest |
| `COMPONENT_IMAGE_PICKER.md` | Photo grid, multi-select, camera integration, thumbnail preview strip, drag-to-reorder, inline editing (crop/rotate/filter) | Instagram · iOS PHPicker · Snapchat |
| `COMPONENT_AUDIO_PLAYER_RECORDER.md` | Voice message recording (hold-to-record), voice message playback (waveform, speed), transcription, hands-free mode, audio compression | WhatsApp · Snapchat · Telegram |
| `COMPONENT_EMPTY_STATE_ILLUSTRATIONS.md` | Empty states for feed, search, cart, closet, messages, notifications, orders, collections, errors-with-recovery | Instagram · Pinterest · eBay |
| `COMPONENT_FULL_SCREEN_ERROR_STATES.md` | Full-screen error states for network failure, server error, permission denied, not found, offline mode, error recovery actions | Instagram · Linear · iOS/Android native |

Each component document contains: (1) 2026 competitor benchmark, (2) psychology & principles, (3) current ThryftVerse audit with file:line defects, (4) micro improvements, (5) macro improvements, (6) flagship acceptance criteria, (7) priority & sequencing, (8) token-level spec table.

---

## Methodology (applied to every document)

Every department document follows the same structure so the programme is auditable end-to-end:

1. **2026 competitor benchmark** — what the relevant competitor(s) shipped as of August 2026, with the specific design moves that make them feel flagship. Sourced from live web research, not memory.
2. **Psychology & principles** — the perceptual, cognitive and behavioural principles behind the competitor's choices (visual hierarchy, gestalt, progressive disclosure, variable reward, social proof, friction tuning, etc.).
3. **Current ThryftVerse audit** — a direct read of the production TSX in this repo for that department, naming concrete defects: 2020-era patterns, AI-slop tells, card-on-card composition, chrome-heavy controls, missing states, fabricated UI, dead controls, token misuse.
4. **Micro improvements** — file-and-line-level changes (components, tokens, hooks, state coverage).
5. **Macro improvements** — structural/architectural moves (information architecture, primitive ownership, motion language, state machine, art direction).
6. **Flagship acceptance criteria** — the thumbnail test, squint test, surface/radius/stroke budget, state coverage, and the specific 2026 quality bar for that surface.
7. **Priority & sequencing** — what to fix first for maximum perceived-quality lift per unit of risk.

## Scoring framework

Each department is scored today and given a target, on the flagship scorecard from `00_2026_LANDSCAPE_BENCHMARK.md`:

```
Composition · Hierarchy · First-viewport usefulness · Spacing rhythm ·
Alignment · Typography · Media art direction · Action placement ·
Information density · Native interaction · State coverage · Motion language ·
Truthful UI · Light/dark parity
```

A flagship surface scores 9–10 on every axis. A 2020-era surface scores 5–7 on most and 2–4 on the axes that most visibly date it (motion, media art direction, state coverage, native interaction).

## Constraints inherited from AGENTS.md

- The native mobile app is the product. Every prescription must serve the rendered user experience.
- Fix at the source-of-truth layer; no child-layer compensation.
- Visible containment must have meaning; flat canvas + spacing + hairlines are the default.
- Surface budget, radius budget, stroke grammar, icon grammar, density target, text budget, media storytelling, no card-on-card, light/dark parity — all enforced.
- Truthful UI only: no "Coming soon", no fabricated success, no dead controls.
- LOC is not a metric; the goal is a richer, clearer, more coherent product.

---

*Generated 2026-08-18 by the ThryftVerse flagship research programme. Each department document is produced by a focused research pass: live 2026 web benchmark + production codebase audit + psychology + micro/macro prescription.*
