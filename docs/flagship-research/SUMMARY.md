# ThryftVerse Flagship Upgrade — Master Synthesis

> **Status:** Research complete. 23 department reports + 41 component-level reports + 10 flagship infrastructure reports + this synthesis written 2026-08-18.
> **Total research output:** 84 report files, ~2.8 MB, ~260,000 words of benchmarked, codebase-audited, psychology-grounded upgrade prescription.

This file is the executive index. It distills the findings of all 17 department reports into one actionable picture: where ThryftVerse stands today, the single root cause, the highest-leverage fixes, and the order in which to execute them.

---

## 1. The verdict — why ThryftVerse still feels 6/10 from 2020

Across all 17 department audits, one root cause repeats: **the app is assembled, not authored.** Screens are built by stacking reusable parts — grey cards inside grey cards, chrome-heavy controls, decorative subtitles, fabricated states — instead of being composed as one deliberate product surface. The 2020-era tells are consistent everywhere:

| Tell | Where it appears | Report |
|------|------------------|--------|
| Card-on-card composition | PaymentsScreen, SavedAddresses, MyListings, UserProfile trust stack, AuthLanding glass card | 03, 05, 09, 12, 14 |
| Chrome-heavy controls (44pt grey circles) | Throughout — bordered Close/Back/overflow buttons | 01, 11, 12 |
| Generic grey placeholders | HomeScreen, discovery modules | 02, 15 |
| Missing motion language | App-wide — 137 raw radius literals, dual Duration scales, no motion tokens consumed | 01, 11 |
| Missing state coverage | 57 screens use raw ActivityIndicator; FlagshipState on only 18/165 screens; zero designed partial states | 15 |
| Fabricated / "Coming soon" UI | ConversationalSearch "Full AI coming soon", LiveShopping, SuccessScreen hardcoded timeline, Personalisation "Saved" badge, AddBankAccount local save | 12, 15, 16 |
| AI-slop | 33 files with DEMO_MODE flags; filename-regex "AI" listings; keyword-matching "AI search"; fake before/after photo enhancement; demo-mode agent activity | 16 |
| Inconsistent radii/strokes | 137 raw `borderRadius:` literals; off-scale values (31, 29, 27, 18, 10, 7, 5); dual Duration scales; borderSubtle mismatch | 01 |
| Dead controls | ListingPreview "Edit" = back; UserProfile Collections/Drops tabs backed by idleQuery; 5 unused notification row presenters; dead SellerHub rows | 05, 13, 14 |
| No media art direction | Discovery feed, profile grid, PDP gallery | 02, 03, 05 |
| Flat information hierarchy | Settings, seller hub, wallet sub-balances (8 rows) | 09, 10, 14 |

**Today's scorecard (from `00_2026_LANDSCAPE_BENCHMARK.md`):** average **5.0/10**, weakest axes (Motion language, State coverage, Media art direction, Native interaction) at **4/10**. Target: **8.6/10** average.

---

## 2. The 23 department reports at a glance

| # | Department | Today | Target | Highest-leverage finding |
|---|------------|-------|--------|--------------------------|
| 00 | Landscape benchmark | 5.0 avg | 8.6 avg | Root cause = "assembled not authored"; 14-axis scorecard; 6-phase roadmap |
| 01 | Design system & tokens | 5 | 9 | 137 raw radius literals; dual Duration scales; 9+ primitives bypass icon registry |
| 02 | Discovery & feed | 4 | 9 | Generic grey placeholders; weak media art direction; dead modules |
| 03 | Product detail & commerce | 5 | 9 | Weak gallery; missing trust signals; chrome-heavy action clusters |
| 04 | Search & visual search | 5 | 9 | AI-slop conversational responses; missing visual search; dead filters |
| 05 | Profile & creator identity | 5 | 9 | Dead Collections/Drops tabs; fabricated collection-follow; avatar size inversion |
| 06 | Chat & messaging | 5 | 9 | AI-slop bot replies; missing presence/typing; card-on-card inbox rows |
| 07 | Creator studio & tools | 5 | 9 | AI-slop generated looks/posters; weak capture flow; dead editing tools |
| 08 | Auctions & trading | 5 | 9 | Client-side countdown; fabricated bid history; dead TradeHub; no anti-snipe |
| 09 | Wallet & payments | 5 | 9 | Fabricated bank persistence; auto-fill full-balance withdraw default; 8-row sub-balance overload |
| 10 | Settings & account | 5 | 9 | Dead rows; fabricated verification; card-on-card; weak destructive separation |
| 11 | Navigation & IA | 4 | 9 | 150-route flat monolith; label-less tab bar; ScreenHeader used by 0 screens; 59 inline back buttons |
| 12 | Onboarding & auth | 5 | 9 | Weak value-prop slides; fabricated success timeline; iOS exitApp no-op; card-on-card glass |
| 13 | Notifications & inbox | 5 | 9 | Demo-mode in-app notifications; 5 unused row presenters; 4 stacked unread signals |
| 14 | Sell & listing flow | 5 | 9 | Filename-regex "AI" listings; fabricated "60% more likely to sell"; CreateCamera is a 44-line redirect shim |
| 15 | Skeletons & state coverage | 4 | 9 | 57 screens raw ActivityIndicator; FlagshipState on 18/165; zero partial states; 2 live "Coming soon" |
| 16 | AI features & antipatterns | 3 | 9 | 33 DEMO_MODE files; fake photo enhancement; keyword matching as "AI search"; §11 violation |
| 17 | Live shopping & streaming | 3 | 9 | Real-time API exists but 3 screens use fabricated viewer counts/chat; "video coming soon" banner; dead search |
| 18 | Orders & post-purchase | 6 | 9 | Most mature surface; dead issue-category selector; hardcoded 24h dispatch; no returns flow; flat resolution centre |
| 19 | Support, help & trust | 4 | 9 | 3 different fabricated response times; report black box; local-only ticket status; card-on-card |
| 20 | Core UI primitives & sheets | 4 | 9 | 3 duplicate button systems; 3 duplicate input systems; 0 screens use sheets barrel; 119 files roll own chips |
| 21 | Closet & personalisation | 4 | 9 | Fabricated style results; dead personalisation; weak closet hierarchy; missing taste profile |
| 22 | 2026 web research compendium | — | — | 99 URLs across all departments; consolidated evidence file |

---

## 2b. Component-level upgrade reports (Phase 2)

These 41 reports go deeper than the department reports — each takes a single primitive family and prescribes the exact token-level micro-spec needed to reach 2026 flagship quality, following the `Design.md` micro-spec format.

| Component family | Today | Target | Highest-leverage finding |
|------------------|-------|--------|--------------------------|
| Buttons & actions | 4 | 9 | 3 duplicate button systems; 4,091 raw Pressable vs 2,429 AnimatedPressable; missing haptics; inconsistent press scale |
| Cards & surfaces | 4 | 9 | Card-on-card; inconsistent radii; shadow misuse; FlagshipProductCard vs FlagshipAssetCard overlap |
| Icons, chips & badges | 4 | 9 | 119 files roll own chips; 9+ primitives bypass icon registry; inconsistent optical sizing |
| Inputs & forms | 4 | 9 | 3 duplicate input systems; inconsistent min-heights (48/52/54); missing focus animations; different stroke grammars |
| Sheets & overlays | 4 | 9 | 0 screens use the sheets barrel; 50+ inline modal implementations; inconsistent dismiss gestures |
| Layouts & spacing | 5 | 9 | 252 hardcoded padding values; 30+ arithmetic drift expressions; inconsistent rails (12 vs 16px); weak first-viewport |
| Media treatment | 4 | 9 | Missing focal-point data; no dominantColor; grey placeholders; inconsistent contentFit; missing failure states |
| Motion & haptics | 4 | 9 | Dual Duration scales (0 consumers of Duration.); 193 hardcoded durations; 12 files bypass semantic haptic layer; no reduced-motion on 193 animations |
| Navigation chrome | 4 | 9 | ScreenHeader used by 0 screens; 322 inline back buttons; label-less tab bar; no transparent-over-media header |
| Color & typography | 5 | 9 | 1,001 hardcoded hex matches; 51 off-scale fontSize values; colors.ts vs ThemeContext.tsx divergence; Text.tsx defects (identical Title1/2/3) |
| Lists & scrolling | 4 | 9 | No canonical FlatList wrapper; inconsistent onEndReachedThreshold (0.25–0.5); missing ListEmptyComponent; useScrollToTop on only 5 screens; duplicated masonry in LooksTab |
| Avatars & identity | 4 | 9 | 10 independent avatar implementations; 16pt seller avatar (too small); dead story ring styles; 5 different verified badge forms; no online indicator; 7 different fallback strategies |
| Skeletons & states | 4 | 9 | 108 files with raw ActivityIndicator; FlagshipState on only 18/165 screens; 3 parallel state systems; no designed partial states; no offline states; "Coming soon" fake states |
| Toasts & snackbars | 4 | 9 | 2 parallel toast systems; 82 Alert.alert occurrences across 40+ screens; 15+ inline banner implementations; only 1 undo implementation; dual-timer race (3500 vs 3200ms); no haptic feedback on toasts |
| Pull-refresh & gestures | 4 | 9 | 68 files with refresh but inconsistent; only 6 with swipe actions; no swipe-to-navigate; no pinch-to-zoom on images; missing haptic feedback on gestures; no gesture discoverability system |
| Tabs & segmented navigation | 5 | 9 | 3 duplicate ProfileTabRail variants; OrdersTabRail no animation; 4 screens use textDecorationLine as indicator; no scrollable tab support; NativeSegmentedControl dead code |
| Progress & loading indicators | 4 | 9 | No generic ProgressBar/CircularProgress/StepIndicator; 18 inline implementations with inconsistent heights (1.5-4px); 11 of 16 bars static (31% animated); 244 raw ActivityIndicator usages; missing accessibility on most bars |
| Sliders & range controls | 5 | 9 | No range slider (dual-thumb); price range uses text inputs; no video seek bar; 5 components still use PanResponder (AGENTS.md §17 violation); inconsistent thumb sizes (16-28pt); 3 sliders missing haptic feedback |
| Date & time pickers | 2 | 9 | Zero dedicated date/time picker components; no @react-native-community/datetimepicker; auction end time limited to predefined chips (3h/6h/12h/24h/3d); no timezone handling; hardcoded 'en-GB' locale; quiet hours hour-only precision |
| Selection & multi-select | 4 | 9 | No shared Checkbox component; inconsistent checkbox styling (1pt vs 2pt borders, Radius.sm vs Radius.lg); no select-all on any screen; only 1 complete bulk action bar; BottomSheetPicker single-select only; SellScreen builds custom radios |
| Ratings & reviews UI | 6 | 9 | Well-built core (ReviewSummaryBlock + ProfileReviewRow + WriteReviewScreen); but no half-star support (Math.round); no review filtering/sorting; no category breakdown; no helpfulness voting; 8 inline rating displays with rounding precision loss |
| Sharing & social actions | 3 | 9 | No share-to-story; no shareable card images (all text-only); no universal links (shared links open browser); 18 screens call Share.share directly; no react-native-view-shot; no share analytics; viral loop completely broken |
| Charts & data visualization | 4 | 9 | SellerAnalyticsScreen has NO charts (only flat KPI rows); no sparklines in metric cards; no category breakdown; no interactive tooltips; no chart library installed; 3 inconsistent stat card approaches; CoOwnPriceChart/CoOwnCandleChart are sophisticated but isolated |
| Maps & location | 2 | 9 | No map view (react-native-maps not installed); no address autocomplete (manual text entry only); no geolocation; no address validation; no map preview on saved addresses; no local selling/pickup features |
| Rich text & content rendering | 2 | 9 | Zero rich text capabilities; all descriptions/bios/chat/comments are plain Text; no markdown; no mention parsing (@username not tappable); no hashtag parsing; no inline link detection; no rich text library installed; Creator mention/hashtag layers not reusable |
| Counters & steppers | 4 | 9 | No shared Stepper component (10+ inline implementations); inconsistent button styling and haptics; no long-press fast-change; AnimatedCounter exists but display-only; no shared CountBadge; bio character counter custom |
| Dividers & separators | 3 | 9 | No shared Divider component (~674 inline hairline implementations); inconsistent hairline colors; no label divider component; no inset divider pattern; over-division on some screens; one of the most duplicated patterns in the codebase |
| Context menus & popovers | 3 | 9 | No shared Popover/ContextMenu/OverflowMenu; all menus are bottom sheets (no anchored popovers); no context menus on listings/comments/reviews; long-press not discoverable (no overflow icon alternative); 241 inline onLongPress handlers |
| Search & filter UI components | 5 | 9 | AppSearchBar exists but inconsistent usage; no active filter chips; no shared FilterSheet (OrdersFilterSheet is screen-specific); no shared SortControl; no filter count badge; no recent searches; saved searches exist but no "save from results" UI |
| Keyboard & input accessories | 4 | 9 | No shared KeyboardAvoidingView wrapper; no input accessory bar (no "Done" button); no keyboard toolbar for chat; inconsistent returnKeyType; no scroll-to-focus on some forms; 133 inline KeyboardAvoidingView usages |
| Tooltips & coach marks | 2 | 9 | No Tooltip component; no CoachMark component; no onboarding walkthrough; no feature discovery system; no "show once" tracking; no first-time user education; 35 matches are mostly in comments/docs not actual components |
| Video player | 5 | 9 | Video.tsx compat shim is senior; useViewabilityPlayback is senior; but no scrubbable progress bar, no muted autoplay + unmute, no PiP, no double-tap to like on feed, no product tag overlays, no shared VideoPlayer component |
| Story viewer | 6 | 9 | PosterViewerScreen (907 lines) + PosterProgressSegments + PosterReactionReplyBar (600 lines) are substantial; but no story bar at top of feed, no story rings, no 24h ephemerality, no product stickers, no shared StoryViewer component |
| Comments thread | 5 | 9 | LookCommentsSheet (318 lines) + looksApi + postersApi exist; but no threaded replies, no comment sorting, no comment likes, no comments on listings, no shared CommentThread component |
| Reaction picker | 6 | 9 | EmojiReactionsBar (6 default + 18 extended emojis, reactedByMe state) exists; but no shared ReactionPicker component, no popover variant, no reactions on comments/listings, no animated pop-in |
| Follow button | 6 | 9 | FollowersScreen + FollowingScreen + profileApi are substantial; but no shared FollowButton component, no mutual follows badge, no suggested users rail, no follow from feed/stories, no optimistic update |
| Save/wishlist button | 5 | 9 | ClosetScreen (1122 lines) + Collection CRUD + useSavedSearchAlerts exist; but no SaveButton on feed/PDP, no collection picker on save, no price-drop/back-in-stock alert enrollment, no saved state animation |
| Image picker | 6 | 9 | CreatorAssetPicker (3821 lines) + CreatorCamera (1144 lines) + MediaBrowserSheet (815 lines) are substantial; but no shared ImagePicker, no inline editing, no thumbnail preview strip, no camera in sell flow, CreatorAssetPicker is a monolith |
| Audio player/recorder | 7 | 9 | VoiceMessagePlayer/Recorder/Bubble + VoiceoverRecorder (285 lines) + WaveformExtractor (429 lines) are senior; but no auto-transcription, no variable speed, no hands-free mode, no shared VoiceRecorder/VoicePlayer, no voice in comments |
| Empty state illustrations | 4 | 9 | EmptyState component exists and is used in BundleBagScreen; but no audit of all empty states, no contextual variants, no consistent illustration style, no CTA on all empty states |
| Full-screen error states | 3 | 9 | No shared FullScreenError component; no offline banner; no graceful degradation; no contextual error variants; no error logging; no retry on all error states |

---

## 2c. Flagship infrastructure & cross-cutting reports (Phase 3)

These 10 reports cover the "missing flagship features" — infrastructure and cross-cutting concerns that a 2026 flagship app must have but that span multiple departments. Each follows the 10-section structure: 2026 competitor benchmark, psychology & principles, architectural issues, AI slop diagnosis, current ThryftVerse audit (file:line), micro improvements, macro improvements, flagship acceptance criteria, priority & sequencing, token-level spec.

| # | Department | Today | Target | Highest-leverage finding |
|---|------------|-------|--------|--------------------------|
| 23 | Accessibility & inclusive design | 4 | 9 | VoiceOver/TalkBack gaps; dynamic type not consumed; 1,001 hardcoded hex (contrast risk); reduced-motion on 0 of 193 animations; no cognitive accessibility patterns |
| 24 | Performance & perceived speed | 5 | 9 | No TTI measurement; slow/frozen frame tracking exists in Sentry but not acted on; no bundle splitting; image loading lacks focal-point + dominantColor; OTA update channel exists but no staged rollout |
| 25 | Offline & network resilience | 4 | 9 | No optimistic updates; no conflict resolution; no offline queue for writes; retry/backoff missing on push + email; cache strategy is ad-hoc; no network state awareness |
| 26 | Internationalization & localization | 3 | 9 | 4 languages (EN/ES/FR/DE) with patch-based translations; no RTL; hardcoded 'en-GB' locale for currency/dates; no ICU pluralization; no OTA translation loading; no translation management system |
| 27 | Push notifications & deep linking | 4 | 9 | Single 'default' Android channel; no rich media (no iOS NSE); no action buttons; no grouped notifications; no retry/backoff on push delivery; manual Linking.getInitialURL instead of NavigationContainer linking prop; no apple-app-site-association / assetlinks.json; no soft-ask pre-prompt; no server-side quiet hours |
| 28 | Security & privacy UX | 6 | 9 | BiometricGate is well-built (truthful unavailable state); TOTP is RFC 6238 compliant; ActiveSessionsScreen exists; GDPR pipeline exists; but: privacy toggles are local-state-only (don't persist); no Passkeys; no breached-password check; biometric only on wallet (not account deletion, password change, 2FA disable); no new-login push; web biometric returns 'authenticated' (should be 'unavailable') |
| 29 | Content moderation & safety | 4 | 9 | chatSafetyWarnings.ts is genuinely senior (40+ regex patterns); ReportScreen has 5 categories (benchmark is 12+); no appeal flow; no community guidelines page; no mute/restrict (only block); no proactive listing moderation; no moderation queue; no tiered account state; no report status tracking |
| 30 | Growth & retention mechanics | 4 | 9 | InviteFriendsScreen exists with referral code + loyalty tier; OnboardingScreen is value-first; StyleQuizScreen exists but NOT in onboarding; ClosetScreen is substantial; but: referral deep link opens browser (no association files); no give-get structure in UI; no share-to-story; no re-engagement campaigns; no streak mechanic; no Top Seller perks; no day-1 push; no first-purchase incentive |
| 31 | Email & transactional communications | 4 | 9 | Resend integration is solid; EmailNotificationsScreen is a well-built 9-category preference center; auth emails (magic link + OTP) exist; but: only 2 email templates (magic link + OTP); inline HTML strings (no template system); no responsive design; no dark mode; no retry/backoff; no subdomain isolation; no SPF/DKIM/DMARC; no order/shipping/receipt emails; no re-engagement emails; no SMS OTP; no multi-channel orchestration |
| 32 | Analytics & experimentation | 5 | 9 | Sentry integration is genuinely senior (performance monitoring, OTA correlation, privacy filtering); telemetry.ts has PII scrubbing (20 fragments) + opt-out + standardized helpers; Prometheus metrics exist; but: maskAllText=false in replay (PII exposure); no session_id/user_id in events; no event batching; no feature flags; no A/B testing; no funnels; no retention cohorts; no north star metric; no business metrics in Prometheus |

---

## 2d. Department-level upgrade reports (Phase 4)

These 10 reports cover additional product departments identified as missing after the first three phases. Each follows the 8-section structure: 2026 competitor benchmark, psychology & principles, current ThryftVerse audit (file:line), micro improvements, macro improvements, flagship acceptance criteria, priority & sequencing, token-level spec.

| # | Department | Today | Target | Highest-leverage finding |
|---|------------|-------|--------|--------------------------|
| 33 | Video player & reels | 5 | 9 | expo-video integration is senior (Video.tsx compat shim + useViewabilityPlayback); but no reels feed, no scrubbable progress bar, no PiP, no shoppable video tags, no reels tab |
| 34 | Stories & ephemeral content | 6 | 9 | Poster system is substantial (PosterViewerScreen 907 lines, PosterStoryActivityScreen 779 lines, PosterProgressSegments, PosterReactionReplyBar 600 lines); but no story bar at top of feed, no story rings, no 24h ephemerality, no product stickers |
| 35 | Comments & reactions | 5 | 9 | LookCommentsSheet + EmojiReactionsBar (6 default + 18 extended) + PosterReactionReplyBar (600 lines) exist; but no threaded replies, no comment sorting, no comment likes, no comments on listings, no shared CommentThread component |
| 36 | Social graph & follow | 6 | 9 | FollowersScreen + FollowingScreen (366 lines each) + useFollowingFeed + profileApi (24 matches) are substantial; but no mutual follows display, no suggested users, no shared FollowButton, client-side following feed composition (N+1 API calls) |
| 37 | Recommendation engine & personalized feed | 7 | 9 | useForYouFeed is genuinely senior (decision_service source, reasonCodes, componentScores, explorationRate, coldStart flag); algorithmTransparencyApi exists; but no "More like this" on PDP, no recently viewed rail, style quiz not in onboarding |
| 38 | Wishlist, saves & collections | 6 | 9 | ClosetScreen (1122 lines) + full Collection CRUD + useSavedSearchAlerts + SavedSearchesScreen (400 lines) are substantial; but no price-drop alerts, no back-in-stock alerts, no one-tap save on feed/PDP, no shareable collections |
| 39 | Tablet/iPad adaptive layout | 3 | 9 | useBreakpoint hook is senior (Material 3 adaptive: compact/medium/expanded with 600/840dp thresholds); supportsTablet: true in app.json; but no NavigationRail, no Split View, no multi-column grids, no form sheets, useBreakpoint is under-consumed |
| 40 | Audio & voice features | 7 | 9 | Chat voice messages (VoiceMessagePlayer/Recorder/Bubble) + creator audio system (VoiceoverRecorder 285 lines, WaveformExtractor 429 lines, AudioMixer, VoiceoverRecorderSheet 816 lines) are genuinely senior; but no auto-transcription, no variable speed, no voice search, no voice in comments |
| 41 | Image picker & gallery | 6 | 9 | CreatorAssetPicker (3821 lines) + CreatorCamera (1144 lines) + MediaBrowserSheet (815 lines) + mediaTransforms (313 lines) are substantial; but no shared ImagePicker component, no inline editing, no thumbnail preview strip, no camera in sell flow, CreatorAssetPicker is a monolith |
| 42 | Cart & multi-item checkout | 5 | 9 | CheckoutScreen (550 lines) + BundleBagScreen with tier discounts (2/10%, 3/15%, 5+/20%) + BundleUpsellRow exist; but no universal multi-seller cart, no cart count badge, no "Add to cart" on PDP, no express checkout, no abandoned cart recovery |

---

## 3. The highest-leverage fixes (do these first)

These are the changes that produce the largest perceived-quality lift per unit of risk, ordered by leverage:

### Phase 1 — Shared primitives & truthfulness (foundation)
1. **Kill every "Coming soon" and fabricated state** (§11 violation). Files: `ConversationalSearchScreen:580`, `LiveShoppingHomeScreen:424`, `SuccessScreen:121-153`, `PersonalisationScreen:144,175-178`, `AgeVerificationScreen:118`. Either wire them or honestly disable them. *(reports 12, 15, 16)*
2. **Consolidate the design token system.** Eliminate the 137 raw `borderRadius:` literals; collapse dual `Duration` scales; fix `borderSubtle` mismatch; enforce `SemanticIcon`/`ICON_REGISTRY` across all primitives. *(report 01)*
3. **Adopt `FlagshipState` + geometry-matched skeletons on every screen.** Replace 57 raw `ActivityIndicator` usages. Design the partial state. *(report 15)*
4. **AI truthfulness pass.** Remove or honestly disable every DEMO_MODE AI feature. The fake photo enhancement, filename-regex listings, and keyword "AI search" are the most damaging AI-slop tells. *(report 16)*

### Phase 2 — Discovery & product detail (the money surfaces)
5. **Discovery feed art direction.** Replace grey placeholders with media-as-color; establish module rhythm; kill card-on-card. *(report 02)*
6. **PDP gallery + sticky footer + trust layer.** Weak gallery and missing trust signals are the biggest commerce gap. *(report 03)*
7. **Navigation IA restructure.** Group 150 routes into domain sub-stacks; formalise the tab bar; make `ScreenHeader` the single header primitive (currently 0 usages). *(report 11)*

### Phase 3 — Identity, creator, sell (the growth surfaces)
8. **Profile hierarchy + wire Collections tab.** Dead tabs + fabricated follow + avatar inversion. The Collections tab backend already exists. *(report 05)*
9. **Creator studio capture-first re-architecture.** Replace AI-slop look/poster generation with a real capture-first flow. *(report 07)*
10. **Sell flow: real capture + truthful AI assist.** CreateCameraScreen is a 44-line redirect shim; AI autofill is filename regex. *(report 14)*

### Phase 4 — Trust surfaces (wallet, settings, auctions, notifications)
11. **Wallet: one dominant balance, tappable transactions, real persistence.** *(report 09)*
12. **Settings: system-native grouped list, destructive action separation.** *(report 10)*
13. **Auctions: server-side countdown, real-time bid layer, anti-snipe.** *(report 08)*
14. **Notifications: kill demo mode, use the 5 unused row presenters, fix grouping.** *(report 13)*

### Phase 5 — Chat & onboarding (the intimacy surfaces)
15. **Chat: presence/typing, real bubbles, honest bot labeling.** *(report 06)*
16. **Onboarding: media-led value props, passkey auth, truthful timeline.** *(report 12)*

### Phase 6 — Polish & motion
17. **Motion language: consume `motionTokens` everywhere; haptics on key interactions; geometry-stable transitions.** *(reports 01, 11)*

### Phase 7 — Live, post-purchase, support & primitives (the completion surfaces)
18. **Live shopping: wire the 3 screens to the existing real-time API.** The API already exists (`connectToStream`, `subscribeToBids/Chat/ViewerCount`) but screens use `Math.random()` fabrications. *(report 17)*
19. **Core UI primitives: consolidate to one button, one input, one sheet, one chip.** 3 duplicate button systems, 3 duplicate input systems, 0 screens using the sheets barrel. *(report 20)*
20. **Orders: add returns flow + wire issue-category selector + server-derived dispatch countdown.** The most mature department but still missing returns. *(report 18)*
21. **Support: kill fabricated response times, wire ticket status to backend, make reports trackable.** *(report 19)*
22. **Closet & personalisation: build the taste profile, kill fabricated style results, wire recommendations truthfully.** *(report 21)*

### Phase 8 — Flagship infrastructure (the "missing features" that block production)

These are the cross-cutting infrastructure concerns that a 2026 flagship app must have. They are not surface-level polish — they are the prerequisites for App Store/Play Store approval, legal compliance, and user trust.

23. **Fix Sentry session replay text masking** (`maskAllText: false` → `true`) — PII exposure in error replays. *(report 32)*
24. **Host `apple-app-site-association` + `assetlinks.json`** — universal links and app links fail silently without them; also fix the referral viral loop. *(reports 27, 30)*
25. **Add NavigationContainer `linking` prop** — replace manual `Linking.getInitialURL` with React Navigation's built-in deep-link integration. *(report 27)*
26. **Wire privacy toggles to backend** — `DataPrivacyScreen` and `PrivacySettingsScreen` toggles are local-state-only (don't persist or control anything); this is a truthfulness defect. *(report 28)*
27. **Add retry/backoff to push + email delivery** — transient failures silently lose notifications and emails. *(reports 27, 31)*
28. **Add per-category Android notification channels** — single 'default' channel gives users no granular control. *(report 27)*
29. **Add soft-ask pre-prompt for push permissions** — preserves the one-shot iOS OS prompt for conceptually-consented users; directly lifts opt-in rate. *(report 27)*
30. **Expand report taxonomy to 12 categories + add appeal flow** — 5 categories is too coarse; no appeal flow is a procedural fairness gap. *(report 29)*
31. **Integrate style quiz into onboarding + add day-1 push** — the style quiz is the Hook Model investment moment; day-1 retention is the cliff (26% global average). *(report 30)*
32. **Adopt email template system (React Email) + add 14 missing templates** — inline HTML strings are unmaintainable; only 2 templates exist (magic link + OTP). *(report 31)*
33. **Integrate PostHog for feature flags + A/B testing** — without feature flags, every release is 100% rollout with no kill switch; without A/B testing, every ship is a bet. *(report 32)*
34. **Add session_id + user_id to telemetry events** — without session/user context, events can't be grouped into journeys or cohorts. *(report 32)*
35. **Add i18n foundation: react-i18next + react-native-localize + ICU pluralization** — 4 languages with patch-based translations, hardcoded 'en-GB' locale, no RTL. *(report 26)*
36. **Add offline write queue + optimistic updates** — no offline queue for writes; retry/backoff missing on network operations. *(report 25)*
37. **Add accessibility: VoiceOver labels, dynamic type consumption, reduced-motion on all 193 animations** — reduced-motion on 0 of 193 animations is a WCAG 2.2 violation. *(report 23)*
38. **Add biometric gating to all sensitive actions** — currently only wallet; missing account deletion, password change, 2FA disable, data export, session revocation. *(report 28)*
39. **Add proactive listing moderation pipeline** — 0% pre-publish block rate (eBay benchmark is 98.2%); no prohibited item detection. *(report 29)*
40. **Add tiered re-engagement pushes + emails** — 3/7/14/30/60/90-day pipeline with personalized content; without it, dormant users are permanently lost. *(reports 27, 30, 31)*

---

## 4. Cross-cutting principles extracted from the reports

These principles appear in every department report and form the flagship contract:

1. **Authored, not assembled.** Every screen is composed as one surface, not stacked from reusable cards.
2. **Flat canvas + spacing + hairlines are the default.** Visible containment only for selection, primary action, input boundary, status, media contrast, or unclear grouping.
3. **Truthful UI or remove.** No "Coming soon", no fabricated success, no demo-mode features exposed as live, no dead controls.
4. **Media is the primary color.** On discovery, profile, creator, and PDP surfaces, real media anchors the first viewport.
5. **State coverage is non-negotiable.** Every screen renders loading (geometry-matched skeleton), empty, error, partial, offline, and populated.
6. **One header primitive, one tab system, one icon grammar, one radius scale, one motion scale.** No inline duplicates.
7. **AI is a tool, not magic.** Every AI feature either does real AI or is honestly disabled. Label capability. Show confidence. Human-in-the-loop.
8. **Light/dark parity.** Geometry, hierarchy, and density identical across themes.

---

## 5. How to use this folder

- **Start with `00_2026_LANDSCAPE_BENCHMARK.md`** — it defines the 14-axis scorecard, the acceptance protocol, and the roadmap.
- **Read the department report for any surface you're about to touch** — each has file:line defects, micro/macro improvements, and acceptance criteria.
- **`16_AI_FEATURES_ANTIPATTERNS.md` is the dedicated response to the "AI-slop" complaint** — it names every fake AI feature and the truthful-AI contract.
- **`15_SKELETONS_STATE_COVERAGE.md` includes a per-screen state-coverage audit table** — use it as the checklist for the state-coverage pass.
- **`01_DESIGN_SYSTEM_TOKENS.md` is the foundation** — token consolidation unblocks every other department.

---

*Research programme complete. 17 department reports + 31 component-level reports + 10 flagship infrastructure reports + master benchmark + this synthesis. Next step: implementation, starting with Phase 1.*
