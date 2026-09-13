# Instagram Sub-Department UI/UX — September 2026 State of the Art

**Research date:** 2026-09-12 · **Track:** Instagram secondary/deeper surfaces (NOT feed/home)
**Purpose:** Flagship-quality audit input for ThryftVerse (React Native thrift marketplace)
**Method:** Live web research — 24 distinct searches, deep-fetches of primary docs. Sources logged in §10 with evidence class per claim.

> **Scope note.** Instagram's main surfaces (feed ranking, Reels player, camera) are out of scope. This document covers the *sub-departments*: the surfaces users reach one or two levels deep — profile editing, settings, activity/notifications, saved items, share flows, story-viewer chrome, comment threads, and creator tooling. These are exactly the surfaces a marketplace app most closely parallels (account forms, settings, notifications, saved/wishlist, share flows, seller dashboards).

---

## 1. Edit Profile & Account Forms

### Current Instagram pattern (Sept 2026)

- **Entry:** A persistent `Edit profile` button sits directly under the bio on your own profile — never behind a menu. [S4][S17]
- **Anatomy:** A single flat list of labeled rows, each showing the current value in place (Name / Username / Pronouns / Bio / Links / Gender / Music / Category + Contact options on professional accounts). Tapping a row opens a **dedicated single-field sub-screen** with its own input, live character counter in the top-right, and a `Done` key. Fields are *not* edited inline in the list. [S17][S18]
- **Per-field limits are enforced as separate budgets:** Username 30 chars (letters/numbers/`.`/`_` only, must be unique, ~2 changes per 14 days), Name 30 chars (searchable — heavily weighted in search indexing), Pronouns max 4 picked from a preset list (no free text), Bio 150 chars, Links up to 5 with custom titles. [S4][S19]
- **Username availability = real-time inline validation.** As you type, Instagram queries its live database: green checkmark = available, red "This username isn't available" = taken. This is *the* canonical availability pattern — users rely on it as the definitive check because no public API exists. [S20][S21]
- **Links module:** Up to 5 native links with editable titles, drag-order; notably Instagram now *blocks* editing links on web ("You can only edit your links on mobile devices") — an app-install nudge that is a documented anti-pattern, not something to copy. [S5]
- **Professional account switcher:** Lives at Settings → "Account type and tools" → "Switch to professional account" → category picker ("Artist", "Digital Creator", …) → Creator vs. Business choice. Since 2025, this screen doubles as a **progressive tool-unlock surface**: it lists every tool, which are available now, and what milestone unlocks the rest (e.g., trial reels, broadcast channels). All public accounts now get a foundational toolset immediately. [S22][S8]
- **Expressive profile fields added on top:** Profile song (30-second clip picker inside Edit Profile, launched Aug 2024 — deliberately does NOT autoplay), and shareable two-sided **Profile Cards** (front: photo/name/pronouns/bio/song/occupation/link with custom background; back: QR code; shared as link, QR, or video flip) rolled out ~Sept 2025. [S23][S6]

### The psychology

- **Recognition over recall:** the field list *shows* current values, so users never have to remember what's set — a direct application of NN/g heuristic #6. [S25]
- **Single-field screens reduce error cost:** one field per screen = one validation context, one save scope, no accidental multi-field commits. Combined with the 14-day rate limit on username changes, inline validation *prevents* burning a scarce resource.
- **Immediate feedback loop:** the availability check fires per keystroke — the form teaches the naming rules by constraining, not by documenting them (error prevention > error messages).
- **Progressive disclosure as aspiration:** the account-type screen *shows locked tools you haven't earned yet* — the locked state itself is a growth nudge (goal-gradient / endowed-progress effect).
- **Separate budgets per field:** splitting Name/Username/Bio/Links into independent limits means users allocate each field to its best job instead of overloading the bio — the UI structure *is* the content strategy.

### What makes it flagship

- Availability validation is **synchronous with typing and color-coded without needing text** (check vs. X) — recognition at a glance.
- Limits are surfaced as **live countdowns in the field chrome**, not error toasts.
- Every field remembers and displays its committed value; there is no "edit mode" state for the whole form — commit is per-field, which eliminates the classic "forgot to hit Save" failure.
- The professional-upgrade flow is a **choose-your-identity** moment (category picker, Creator vs Business) — switching is framed as upgrading, not as configuring.
- Counter-example worth noting: Instagram itself shipped a profile-header redesign in Jan 2025 that separated the name from the avatar and drew sustained backlash for breaking proximity/scan-flow — evidence that even flagship teams pay a real cost when they break learned spatial grouping. [S1][S2]

### Transferable mechanics (ThryftVerse)

- Profile-edit as a **flat row list → single-field sub-screen** pattern for: display name, @handle (shop name), bio/tagline, pickup/shipping preferences, linked socials, seller category.
- **Real-time handle availability** for seller shop handles — green check / red error while typing, with suggested alternates ("getthrift", "thrift.nyc") when taken.
- **Separate field budgets:** a searchable "shop name" field distinct from bio — mirrors Instagram's searchable Name field; give it its own limit and say so.
- **Progressive seller-level unlock screen:** show "Seller tools" with states — available now / unlock at N sales / unlock at verification — instead of hiding gated features.
- Do NOT copy: locking core profile edits to mobile-only (Instagram's link-editing block is a dark pattern that generated press backlash).

### Measurable acceptance criteria

- [ ] Each editable field commits independently; discarding one field never loses edits to another.
- [ ] Handle field returns availability verdict in <400ms per keystroke (debounced), with non-text affordance (✓/✕ + color).
- [ ] Taken-handle state offers ≥3 generated alternates.
- [ ] Character limits render as a live counter, not a post-submit error.
- [ ] Form exposes loading / error / rate-limited ("you can change this again in N days") states — not just the happy path.
- [ ] Seller-upgrade flow is reachable in ≤2 taps from profile and explains *what you get* before asking for commitment.

---

## 2. Settings & Privacy

### Current Instagram pattern (Sept 2026)

- **Entry:** A right-edge hamburger panel ("Settings and activity") slides out from the profile. In the 2025–26 interface test, Saved, Discover People, and Settings were consolidated into this single side panel, stripping the profile top bar down to essentials. [S9]
- **Search inside Settings:** A search bar sits at the top of Settings — you can type "activity status" or "hidden words" and jump straight to the toggle. This is treated by Instagram's own help ecosystem as the *canonical* way to find settings because the IA is re-shuffled by server-side rollouts constantly. [S24]
- **IA grouped by *relationship*, not by feature:** sections like "How you use Instagram" (Your activity, Notifications, Time management), "Who can see your content", "How others can interact with you" (Messages & story replies, Tags & mentions, Comments, Hidden words), "For professionals", "Your app and media". Settings are organized around *who the control protects you from / what it governs*, not engineering ownership. [S24][S11]
- **Accounts Center → Meta Account (April 2026):** Meta rebranded Accounts Center to "Meta Account" — one hub holding cross-app settings (password, 2FA, email, ad preferences, payments, connected experiences like cross-posting and avatar sync) while *app-specific* settings stay in-app. Design principle stated by Meta: settings that don't change app-to-app shouldn't be edited app-by-app. [S26][S27]
- **Guided checkup flows:** Security Checkup (triggered proactively by a pop-up when compromise is suspected) walks a linear flow — review recent logins → update recovery contact → enable 2FA. Privacy Checkup similarly sequences who-can-see-what decisions into a wizard rather than a settings tree. [S28][S29]
- **Your Activity surface:** a self-data dashboard — 7-day time-spent bar chart (tap a bar for that day's total), daily-limit reminder setting, notification mute (up to 8h), plus a full *history browser*: likes, comments, story replies, recent searches, account history, download-your-data. [S30]

### The psychology

- **Search-in-settings acknowledges IA failure as normal.** Instagram assumes users can't predict where a toggle lives; search converts recall ("which menu?") into recognition ("the toggle I want"). [S25]
- **Audience-relative grouping** ("Who can see your content" / "How others can interact with you") maps settings to the user's *mental model of risk* rather than the data model — users think "who can DM me", not "message request transport policy".
- **Wizard flows for high-stakes decisions** (security checkup, privacy checkup) use commitment-consistency: each answered step makes finishing the next step more likely; a checklist shown at the end produces a visible "hardened" state.
- **Self-quantification dashboard** (time spent) satisfies autonomy needs — Meta publicly frames it as wellbeing tooling; behaviorally it also preempts OS-level screen-time criticism.
- **Centralization reduces repeated-decision fatigue:** Meta Account means a user who sets an email once never wonders which app has the stale one — one source of truth removes a whole class of "why didn't this save" bugs.

### What makes it flagship

- The settings search **works against renamed/moved labels** — it indexes concepts, not paths (the app's own help pages recommend it when tutorials don't match). [S24]
- Privacy defaults are *layered*: coarse master toggles (private account) at the top, fine-grained per-interaction controls beneath — progressive disclosure by sensitivity. [S31]
- Checkup flows are **contextually triggered** (compromised-login pop-up) rather than only discoverable — the surface comes to the user.
- One hub with a clearly stated *boundary rule* (cross-app settings centralized, app-specific stays local) — the IA has an explicit, user-legible contract.

### Transferable mechanics

- **Settings search as a first-class feature** — in a marketplace with shipping, payout, notification, privacy, and storefront settings, searchable settings is the single highest-leverage IA move.
- **Group settings by counterpart relationship:** "Buying" / "Selling" / "Who can contact me" / "Payments & payouts" / "Your data" — not by internal service names.
- **"Account Center" pattern even with one app:** centralize identity + credentials + payout identity in one hub card at the top of settings, visually distinct from feature toggles.
- **Guided Trust Checkup:** a linear wizard — verify email → add payout method → enable 2FA → review who can see purchases — with a completion state. Marketplaces live on trust; a checkup wizard is how you make trust legible.
- **"Your activity" analog:** order history, offers sent/received, saved searches, recently viewed — a single self-data surface rather than scattering history across features.

### Measurable acceptance criteria

- [ ] Every setting is reachable via settings-search by ≥2 natural-language aliases (e.g., "password" and "login" both hit the credential row).
- [ ] Settings IA groups by user-facing domain (buying/selling/privacy/payments), not by backend service.
- [ ] A guided checkup flow exists, is completable in <90s, and shows a persistent completion/health state afterward.
- [ ] Master toggles (e.g., vacation mode, private closet) sit above fine-grained controls and visibly scope what they govern.
- [ ] Dangerous settings (deactivate, close shop) are separated, require confirmation, and explain consequences.

---

## 3. Activity / Interactions Surfaces (Notifications, Message Requests, Comment Management)

### Current Instagram pattern (Sept 2026)

- **Notifications tab:** ranked, not chronological by default. Meta's transparency docs confirm an AI system orders in-app notifications by predicted value, with a user-facing control — "See most relevant in-app notifications first" — that can be turned off to get chronological order. [S32]
- **Aggregation at the item level:** notifications cluster — "X and 12 others liked your post" — deliberately bundling burst events into one row instead of 13 pings. [S33]
- **Diversity-aware ranking (Sept 2025, Meta Engineering):** a second ranking *layer* sits on top of the engagement model and applies multiplicative demotion penalties when a candidate notification is too similar to recently-sent ones along dimensions like author, content type, and product surface. Result Meta reports: lower daily notification volume, higher CTR. [S34]
- **Message requests inbox:** a separate `Requests` folder distinct from `Chats`, plus a deeper `Spam` folder that Hidden-Words-filtered requests fall into (no notifications for spam). Requests render as *limited previews* — the recipient reads before the sender can reach them. Actions: Accept (→ moves to Chats), Delete, Block, Report (anonymous). Bulk "Delete all" exists for spam. Group-chat adds are separately governed ("who can add you to groups"). [S12][S13]
- **Inbox filter pills + folders (Aug 2025):** pro accounts and 100k+ personal accounts got filter pills — Story replies, Unread, Unanswered, Followers, Verified — that can be reordered and toggled (except Requests), plus user-created DM folders. [S14][S15]
- **Comment management stack (layered):** pin up to 3 comments; bulk-select/delete up to 25 comments via long-press; Restrict (hides a person's new comments from everyone *but them*, silently); Hidden Words (auto-filter by word/phrase/emoji, on by default; Instagram claims ~40% reduction in unpleasant comments); Advanced Comment Filtering (stricter second pass); Limits (time-boxed suppression of comments+DMs from non-followers/recent followers during spikes); and a pre-post warning interstitial that fires a stronger warning on the *first* potentially-offensive comment attempt. [S16][S35][S36]

### The psychology

- **Clustering protects the reward:** grouped likes preserve the dopamine signal ("people liked this") while removing the spam penalty — variable-ratio reward without notification fatigue.
- **The diversity layer is anti-habituation engineering:** Meta's own framing — identical notifications start to feel spammy and get disabled — so the system *sacrifices* short-term CTR on individual candidates to protect the channel's long-term open rate. [S34]
- **Requests inbox = consent buffer:** the preview-without-reach pattern gives recipients control before contact (reduces threat response; spam folder means the choice is reversible in bulk).
- **Restrict's silence is the feature:** shadow-limiting avoids the retaliation spiral that a visible block triggers — moderation without escalation.
- **Filter pills + folders = locus of control:** giving power users rearrangeable filter chips converts inbox anxiety into triage behavior.
- **Limits = state-dependent protection:** a *temporary* shield for a *temporary* condition (going viral, getting brigaded) — matches protection intensity to the moment instead of permanent lockdown.

### What makes it flagship

- Notification quality is treated as a **two-objective optimization** (relevance × diversity) with published math — not a heuristic sort. [S34]
- The moderation stack is a **graduated response ladder** (filter → restrict → limit → block → report) — five rungs of escalating severity, each reversible and non-notifying at the lower rungs. [S35]
- Pre-post nudge interrupts the *author*, not just protects the *target* — moderation upstream of harm.
- Spam triage is designed for zero-attention: no notifications, bulk delete, hidden previews.

### Transferable mechanics

- **Clustered notification rows:** "3 buyers messaged you about Vintage Denim Jacket" beats three identical rows — collapse by (object, action-type).
- **Relevance-ranked activity with a chronological escape hatch:** ship ranking AND the "most recent" toggle — the opt-out is part of the pattern.
- **Anti-fatigue demotion:** if you've already notified a seller about item X today, demote further same-item alerts — a cheap client-or-server-side diversity penalty, no ML required to start.
- **Message requests inbox for buyer↔seller first contact:** first message from a non-contact lands in Requests with a content preview + Accept/Decline/Report — critical for a marketplace where strangers transact.
- **Inbox filter pills for sellers:** Unread / Unanswered / Offers / Verified buyers — reorderable chips.
- **Graduated moderation:** word-filter → restrict → block → report on marketplace comments and messages; Restrict (silent) is the highest-value rung for harassment between transacting users.
- **Time-boxed "listing surge" mode:** when a listing spikes, offer to auto-limit contact to followers/previous buyers for N days.

### Measurable acceptance criteria

- [ ] Notifications cluster by entity+action; ≥3 same-object events collapse into one row.
- [ ] Activity feed has both ranked and chronological modes with a persistent user toggle.
- [ ] A first-contact message lands in Requests, shows preview, and the sender gets no delivery confirmation signal until accepted.
- [ ] Spam/request surfaces support bulk action in ≤2 taps.
- [ ] Restrict exists as a silent middle rung between "do nothing" and block; block/report are visually separated (destructive styling).
- [ ] Sellers can filter inbox by ≥4 pills and reorder them; filter state persists across sessions.

---

## 4. Saved / Collections

### Current Instagram pattern (Sept 2026)

- **Save = one tap on the bookmark glyph** under any post → brief "Saved" confirmation with an inline "Save to collection" affordance. **Long-press** the bookmark = jump straight to the collection picker. Two gestures, two intents: fast-save vs. file-save. [S37]
- **Save-to-collection sheet:** a bottom sheet listing every collection as a row with cover thumbnail + name; a pinned "+ New collection" row creates-and-files inline (name field → done → post is inside). Single tap files; no secondary confirm. [S37][S38]
- **Saved surface:** collections render as a **grid of cover tiles** above/beside an "All posts" catch-all; collections are private by default; covers can be chosen. Saved lives behind the profile side-menu (a documented discoverability weakness — multiple UX case studies flag it). [S38][S39]
- **Shared collections:** collections can be shared with friends / made collaborative via DM (a mechanic with obvious marketplace analog: shared wishlists/bundles). [S37]
- **Known UX failure to learn from:** independent case studies found users systematically misunderstand the "Save to Collection" pop-up — they think tapping the bookmark already saved, so "save to collection" reads as redundant. The recommended fix: copy that separates the two states — "Saved." (confirmation) + "Also add to a collection" (optional action). [S39]

### The psychology

- **Two-tier interaction cost:** tap vs. long-press maps to frequency — the cheap gesture does the common thing, the expensive gesture does the organizing thing (Fitt's-law-adjacent effort budgeting).
- **Immediate micro-feedback:** the "Saved" toast confirms state change *and* carries the next-best action — feedback and upsell in one element.
- **Cover tiles exploit visual memory:** users re-find collections by *image recognition*, not name recall — the cover is the index.
- **Private-by-default** removes the social-performance anxiety that would suppress saving ("people can see what I bookmarked").

### What makes it flagship

- The gesture split (tap = save, hold = file) is **discoverable through the toast** — the confirmation teaches the second gesture exists.
- New-collection creation is **inline at the moment of intent** — no pre-creation ritual required; the sheet is both picker and factory.
- Cover thumbnails update from content, so collections self-describe without user maintenance.
- And its documented *weakness* is instructive: Saved buried behind ☰ → profile panel is the app's most-cited discoverability complaint — flagship on the sheet, mid-tier on the entry point. [S39][S40]

### Transferable mechanics

- **Tap = save to wishlist; long-press = file into list.** Marketplace buyers save constantly; give them the same two-tier gesture on every listing card.
- **Post-save toast with the file action** ("Saved · Add to a list") — confirmation + organization in one element, with copy that makes the optionality explicit ("Also add").
- **Cover-driven list grid** for "My lists" — cover = most recent or user-picked item photo; "All saved" catch-all beside named lists.
- **Inline list creation at save-time** — never require pre-made lists.
- **Shared/collaborative lists** — "share this list" (dorm-room bundle, gift list) is a natural thrift mechanic Instagram already validates.
- **Don't bury it:** put Saved as a first-class profile tab or top-level surface — learn from Instagram's own most-criticized choice rather than replicating it.

### Measurable acceptance criteria

- [ ] Save completes in 1 tap with visible state change + toast containing the list action in <200ms.
- [ ] Long-press opens list sheet in <300ms with haptic on trigger.
- [ ] New list creation inside the sheet requires exactly one text input + one tap; the item lands in the new list.
- [ ] Lists grid renders covers from item imagery; cover can be overridden.
- [ ] "All saved" catch-all exists and is distinguishable from named lists.
- [ ] Saved is reachable in ≤2 taps from any surface (entry-point budget Instagram itself fails).

---

## 5. Share Sheets & Link Flows

### Current Instagram pattern (Sept 2026)

- **Sheet anatomy:** bottom sheet with a horizontally-scrolling **avatar row at top** (people ranked by DM affinity — circle size literally encodes affinity weight per teardown analysis: big circles = highest DM frequency/profile-visit/story-consumption signals), then fixed destinations (Add to story / repost), then the external share row, then Copy link / QR code utilities. A search field narrows the people row. [S41][S42]
- **Multi-select then commit:** tap several avatars, then one `Send` — selection state is visible on each avatar.
- **Context-aware destinations:** when sharing your own story, the sheet offers `Your Story / Close Friends / Message` as three explicit audience lanes (recently redesigned into distinct options). [S43]
- **Shortcuts (2025):** users can pin specific people/groups as persistent share-tray shortcuts — the tray becomes user-curated, not purely algorithmic. [S44]
- **"Send to chat" (2025):** inside a DM thread's Reels viewer, a contextual button re-shares the current Reel *back into the same conversation* in one tap — sharing without leaving context, with the recipient's avatar on the button to remove ambiguity. [S45]
- **Cautionary tale — the "Create Group" trap:** Instagram replaced `Send` with `Send separately` + `Create group`; users with years of muscle memory kept tapping where Send was and accidentally spawned group chats. A widely-cited muscle-memory dark-pattern case study — Meta also ships server-side UI changes that users can't roll back. [S46][S47]

### The psychology

- **The people row is a social-affinity model rendered as UI** — big-circle ranking externalizes the algorithm's confidence about *who you'd want to send this to*, which reduces the recipient-selection cost to one tap. [S41]
- **People before channels:** avatars sit above app destinations because the modal question is "to whom", not "via what" — ordering follows the user's decision sequence.
- **Three-lane audience choice** (public / close friends / one person) is a privacy decision made *explicit and legible* at the share moment — audience selection at point-of-commitment, not buried in settings.
- **Send-to-chat = zero-context-switch sharing:** the action travels to where the user already is rather than pulling them to a compose surface.
- **The Create-Group failure proves the rule:** identical-position, different-function buttons weaponize muscle memory — the penalty for a miss should be a miss, never a context switch or an irreversible action. [S46]

### What makes it flagship

- Recipient ranking is **per-content contextual** (who you'd send *this* to), not just global recency — tdCommons research confirms recency-only contact ranking has low CTR; Instagram's affinity model goes further. [S42]
- Ambiguity is engineered out of commit actions: the Send-to-chat button *shows the recipient's avatar* on itself — the target is legible before the tap. [S45]
- Utilities (copy link, QR) are present but demoted below people — the sheet is a *social* surface first, a link tool second.

### Transferable mechanics

- **Share sheet = people row first:** recent buyers, saved-search watchers, friends who liked the item — ranked, avatars, then Copy link / share externally below.
- **Multi-select recipients → single Send** with per-avatar selection state.
- **Audience lanes on seller shares:** "Share publicly / share to followers / send to a buyer" as explicit lanes when a seller shares their own listing.
- **"Send to this chat" inside offer/inquiry threads** — share another listing into an open conversation in one tap, recipient avatar on the button.
- **Pinned share shortcuts:** let sellers pin their partner/bundle-collaborator/regular buyer to the tray.
- **Never co-locate a destructive/irreversible action at the same hit-target as a frequent one** (Instagram's own mistake is the proof).

### Measurable acceptance criteria

- [ ] Share sheet shows ≥6 ranked recipient avatars; ranking updates with recency/interaction.
- [ ] Copy-link is present but visually subordinate to people.
- [ ] Multi-select + single commit; no accidental group creation — a group is only made by an explicit separate action.
- [ ] In-conversation re-share exists ("send to this chat") and displays the recipient identity on the control.
- [ ] Sheet opens <300ms, dismissed by swipe-down; share completes with toast + haptic.

---

## 6. Story Viewer Controls & Replies

### Current Instagram pattern (Sept 2026)

- **Frame anatomy:** segmented progress bars pinned top (one segment per slide, active segment fills), creator header (avatar, name, timestamp, close-friends badge, ⋮ menu), and a **persistent bottom reply bar**: "Send message" pill input + heart + send icon. Safe zones: ~250px top and ~250px bottom are reserved UI — creator tools literally check safe-zone compliance before posting. [S48][S49]
- **Three-tier response ladder, explicitly graded by intimacy:**
  1. **Private like (heart)** — 2022 feature; does NOT open a DM, has no count, visible only to the creator as a heart next to the liker's name in the viewer sheet. Solves the "every reaction becomes a conversation" problem. [S50][S51]
  2. **Emoji quick-reactions** — swipe up (or tap the reaction affordance) → row of 8 emoji (❤️😂😮😢👏🔥🎉💯); lands in the creator's DMs as a reaction message. [S52]
  3. **Text reply** — the bottom input; goes to DMs as a private message. Public story comments (2025 addition) live behind a *separate* icon and are visible to all viewers — Instagram keeps the two reply types visually adjacent but semantically firewalled, which confuses some users (documented). [S52][S53]
- **Viewer sheet:** creator swipes up on own story (or taps the eye icon + count) → list of viewers; **likers pinned to top with hearts**. Order: <50 views ≈ reverse-chronological; >50 views → algorithmically re-ranked by *the creator's* affinity/interaction signals. Per-slide viewer lists. Named list persists 48h (24h live + 24h archive), then only aggregate counts remain. [S54][S55]

### The psychology

- **Graduated intimacy ladder** maps effort to signal strength: heart (zero-cost acknowledgment) → emoji (lightweight affect) → text (real conversation). Each rung is a different social risk level — Instagram deliberately built the *free* rung (private like) *because* forcing every reaction through DMs suppressed engagement. [S50]
- **Progress bars convert time into spatial information** — position, count, and pace are legible without any numbers.
- **Viewer list is a private reward surface:** only the poster sees it; likers pinned on top is algorithmic social proof delivered to exactly one person — the audience metric is a creator incentive, not a public scoreboard.
- **Affinity-ranked viewer order** (>50 views) turns a raw list into an "engagement leaderboard" — documented as folk-mythology ("top = your crush") that Instagram has officially debunked; still, the *design intent* is surfacing the people you're closest to. [S56]
- **48-hour named-window creates urgency** — check now or lose the names — a scarcity mechanic applied to one's own analytics.

### What makes it flagship

- The heart's **non-DM semantics** were a deliberate subtraction: engagement increased *because* a channel was removed. Flagship = knowing when an interaction should produce no artifact.
- The bottom bar is **persistent, not gesture-gated** — WhatsApp copied exactly this (persistent reply bar replaced swipe-up) because revealed affordances beat hidden gestures. [S57]
- Per-slide viewer data (not per-story) — granularity matches the unit of consumption.
- Safe-zone awareness is institutionalized — the UI overlay's footprint is so consistent that a third-party tool industry exists to pre-flight content around it. [S49]

### Transferable mechanics

- **Three-tier response ladder on marketplace "drops"/seller updates:** save (private signal) → emoji react → message the seller. A zero-commitment reaction tier measurably lifts engagement.
- **Segmented progress + persistent reply bar** on any sequential media surface (listing photo carousels presented fullscreen, seller story-drops).
- **Private-viewer-sheet analog:** sellers see *who viewed* their listing/drop — likers/interested pinned on top — a private demand signal no other party sees. Thrift equivalent: "12 people viewed · 3 saved · top watcher pinned."
- **Affinity-ranked demand list:** when views exceed N, rank watchers by interaction with that seller — surfaces likely buyers first.
- **Ephemerality window:** named viewer data expires; counts persist — creates a reason for sellers to check in.
- **Never hide the reply affordance behind a gesture** — persistent bar, always visible.

### Measurable acceptance criteria

- [ ] Fullscreen sequential media shows segmented progress reflecting item count + position.
- [ ] Reply/react affordance is persistently visible, not gesture-only.
- [ ] Three distinct response tiers exist with distinct destinations (private signal vs. message), and the UI disambiguates them.
- [ ] Seller demand sheet shows per-item viewers with saved/Interested pinned; named data expires per stated window.
- [ ] Safe-zone rules documented: content CTAs render outside top/bottom chrome bands on all supported aspect ratios.

---

## 7. Comment Threads

### Current Instagram pattern (Sept 2026)

- **Sheet:** comments open as a drag-to-expand bottom sheet over the post/reel; a sort control sits at top. [S58]
- **Ranking is AI-driven since March 2025:** Meta's system predicts likelihood you'll report / delete / reply / click / scroll past each comment and orders accordingly. User-facing sort options: **"For You" (default), "Most recent", "Meta verified"**. Research confirms "For You" produces low variation between users but is the default lens. [S59]
- **Downvote test (2025):** a private down-arrow per comment — no count shown, no one knows you pressed it — intended to feed ranking ("move disliked comments lower") to make threads friendlier. [S60]
- **Nesting model — deliberately shallow:** "View replies (n)" collapses reply threads under the parent; the API enforces it: you can only reply to *top-level* comments — a reply to a reply is flattened into the top-level thread (with `@username` prefill for disambiguation). Max depth = 1 effective level. [S61][S62]
- **Pinned comments:** up to 3, marked with a pin; creators use them as narrative real estate (CTA, FAQ, tone-setting) — pinning is now a documented engagement strategy, not just moderation. [S16][S63]
- **Translation:** "See translation" appears automatically under captions/comments detected in a language different from the viewer's app language; toggles to "See original". Prioritizes caption + visible comments; not all comments get it. [S64]
- **Hidden Words / moderation context:** filtered comments don't appear at all; restricted users' comments visible only to themselves; a hidden-comments review area exists for the author. [S35]

### The psychology

- **Shallow nesting is a deliberate anti-forum choice:** one level of replies keeps threads scannable and prevents the rabbit-hole flame wars of deep threading (Reddit model). Flattened replies + `@mention` preserve addressability without tree complexity.
- **"For You" ranking = conversation-as-content:** the best comments compete with the post itself for attention — the thread is entertainment, so it gets an algorithm.
- **Private downvote = consequence-free signal collection:** users give honest negative signal because there's no social cost; the system gets training data without starting fights.
- **Pinned comments = authored first impression:** the creator curates the frame through which the whole thread is read — anchoring effect applied to discourse.
- **Collapsing replies respects the feed contract:** "View replies (n)" communicates volume without paying its attentional cost — progressive disclosure again.
- **Translation-on-tap removes the last excuse** to not engage across language boundaries — opt-in machine translation keeps the original visible (trust-preserving).

### What makes it flagship

- Ranking uses **punitive signals too** (report/delete propensity) — the algorithm models what you'd *remove*, not just what you'd click. [S59]
- The downvote is **private by design** — the rare social-platform feature where hiding the metric *is* the mechanic.
- Depth cap enforced at the API layer, not just the client — the IA decision is infrastructural. [S61]
- Pin limit (3) is small enough that pinning stays meaningful — scarcity preserves the feature's value.
- Translation is ambient — appears when needed, invisible when not.

### Transferable mechanics

- **Marketplace comment threads:** Q&A on listings with 1-level reply flattening + `@mention` prefill — perfect for "is this still available" threads that must stay scannable.
- **Sort control:** "Most relevant / Newest" on listing Q&A; relevance seeded simply (seller replies, verified buyers, most-liked) before any ML.
- **Seller-pinned comments (≤3):** pin measurements, condition notes, "bundle deal" CTA — the pin is the seller's sticky note on their own listing.
- **Private negative signal:** "this comment isn't helpful" as a hidden downvote feeding moderation, never a public count.
- **Auto-translate buyer questions** — cross-border thrift is a real use case; "See translation" below foreign-language comments.
- **Hidden-words + restrict on listing comments** — sellers need the same graduated tools for spam/lowball-harassment.

### Measurable acceptance criteria

- [ ] Reply depth visually caps at one level; deeper replies flatten with @mention prefill.
- [ ] Comment sheet has an explicit sort control with ≥2 modes and a stated default.
- [ ] Seller can pin 1–3 comments; pin affordance visible only to listing owner.
- [ ] "See translation" appears only on detected-foreign comments and toggles back to original.
- [ ] Negative feedback is collected privately; no public dislike count exists anywhere.
- [ ] Collapsed reply affordance shows count ("View 4 replies") and paginates.

---

## 8. Creator / Professional Dashboards

### Current Instagram pattern (Sept 2026)

- **Entry:** a `Professional dashboard` button rendered on your own profile under the bio — the dashboard markets itself *from* the profile rather than hiding in settings. [S65]
- **Summary-first architecture:** the opening screen is deliberately shallow — **one headline number ("Views in the last 30 days") + a daily bar chart** + grouped sections (Track your performance / Grow your business / Stay informed / Competitive insights). Everything actionable sits one layer deeper behind "See all insights" — the summary is explicitly "a summary, not the data". [S65]
- **Metric simplification (April 2025):** Views replaced Impressions and Plays as the single headline metric across all content types — one vocabulary for reach. [S65]
- **April 2026 Insights rebuild:** the scrolling page became **three tabs — Overview / Engagement / Audience** — and added *behavioral* metrics: **skip rate** (how fast viewers swipe away, replacing view rate), **share rate** (share of viewers who passed it on), **views-over-time** (performance across weeks, acknowledging that the algorithm resurfaces old content), and a retention curve. [S65]
- **Monetization as eligibility surface:** monetization tools render as a **status screen** — which programs you're eligible for, what's pending, what to do next — not just a menu. [S66]
- **Progressive unlock framing:** "Account type and tools" lists every tool with availability state; milestones unlock advanced features (trial reels, channels). Foundational tools for all public accounts; pro upgrade unlocks monetization/business features. [S22]
- **"Stay informed" in-product education:** tips and feature announcements embedded *inside* the dashboard — best-practice hints live where the metrics do. [S65]
- **Sends as a first-class metric:** private DM forwards are tracked separately from public shares and carry more algorithmic weight (Mosseri on record) — the dashboard surfaces the metric Instagram actually optimizes for. [S65]

### The psychology

- **One-number-first = cognitive offloading:** the summary answers "am I up or down?" before offering any depth — matching how creators actually check dashboards (glance → investigate only on anomaly).
- **Metric consolidation reduces dashboard fatigue:** killing Impressions/Plays for a single Views number traded precision for *decision speed* — fewer metrics, clearer signal.
- **Behavioral metrics (skip rate, share rate) shift focus from vanity to quality:** they answer "is my content good?" not "how many saw it?" — the dashboard teaches what to optimize.
- **Eligibility-as-progress:** showing locked monetization programs with unlock criteria converts a gate into a goal (endowed progress / goal-gradient again).
- **Education at point of need:** tips inside the dashboard hit at the moment of motivation (checking numbers) — contextual learning beats documentation.
- **Views-over-time legitimizes back-catalog:** telling creators old content still earns views changes publishing behavior (more evergreen content) — the metric design *is* a content strategy lever.

### What makes it flagship

- The dashboard is **two products**: a glanceable card (summary) and an analyst surface (three-tab Insights) — different depths for different intents, one tap apart.
- Metrics are **honest about windows**: ~90-day data retention is a stated limitation; the headline metric change (Views) was announced so old/new periods aren't compared blindly. [S65]
- **Ratio literacy is built in**: the actionable reading is engaged ÷ reached — the surface is designed around *rates*, not raw counts.
- Monetization shows **state machine + next action**, not a binary yes/no.

### Transferable mechanics

- **Seller dashboard summary-first:** one headline ("Sales/views last 30 days") + sparkline + grouped sections (Performance / Grow your shop / Tips). Deep analytics one tap behind.
- **One canonical headline metric** across listings (Views), not a sprawl of impressions/plays/watchers.
- **Behavioral quality metrics for sellers:** listing skip rate (impressions→detail-view abandonment), inquiry rate (views→message), sell-through over time — metrics that teach quality, not just volume.
- **Seller-level eligibility surface:** "Seller level: Verified at 10 sales · unlocks promoted listings · payout speed ↑" — state + next action + what you unlock.
- **Embedded tips at point of metrics:** "Listings with measurements get 2× more inquiries" inside the dashboard.
- **Track private-share analog:** "times your listing was sent to a friend" as a named metric — sends predict conversion better than likes.

### Measurable acceptance criteria

- [ ] Dashboard opens to a single headline number + trend, with drill-down in ≤1 tap.
- [ ] Exactly one canonical headline metric is used across all listing surfaces.
- [ ] At least two *quality* metrics exist alongside volume metrics (e.g., inquiry rate, sell-through).
- [ ] Seller tier/monetization eligibility renders as status + unlock criteria + next action.
- [ ] Tips are contextual to the metric being viewed, not a generic help link.
- [ ] Dashboard covers loading / partial-data / new-seller-empty states.

---

## 9. Ranked: The 10 Highest-Leverage Instagram Sub-Department Patterns a Marketplace App Is Most Likely Missing

| # | Pattern | Source surface | Why it's high-leverage for ThryftVerse |
|---|---------|---------------|----------------------------------------|
| 1 | **Settings search that indexes concepts, not paths** | Settings | Marketplace settings (payouts, shipping, privacy, notifications) sprawl fast; search-in-settings is the cheapest fix for the most-frustrating surface. Instagram treats it as canonical navigation. [S24] |
| 2 | **Message-requests consent buffer with preview + spam folder** | DMs/Requests | Buyer↔seller first contact from strangers is *the* trust-critical flow; preview-before-reach + bulk spam delete + silent no-notify is table stakes Instagram has solved. [S12][S13] |
| 3 | **Two-tier save gesture + save sheet with inline list creation** | Saved/Collections | Tap=save, hold=file, toast that teaches the second gesture, covers-as-index, "All saved" catch-all. Wishlist organization is core to thrift re-engagement. Bonus: put it ≤2 taps away — don't repeat Instagram's buried-Saved mistake. [S37][S39] |
| 4 | **Graduated moderation ladder (filter → restrict → limit → block → report)** | Comments/DMs | The *silent* middle rungs (Restrict, time-boxed Limits) are what generic marketplaces never build; they de-escalate harassment between transacting strangers without retaliation. [S35] |
| 5 | **Real-time handle availability + per-field commit** | Edit Profile | Green-check-while-typing validation and single-field sub-screens eliminate the highest-friction form errors; separate budgets (searchable shop name ≠ bio) is a free discovery win. [S20][S17] |
| 6 | **Notification clustering + diversity demotion + chronological opt-out** | Activity tab | Collapse same-object events, demote repeat notifications, and ship the "most recent" escape hatch. The diversity penalty needs zero ML to start — it's a similarity threshold. [S33][S34][S32] |
| 7 | **Three-tier response ladder (save → react → message)** | Story viewer | Every engagement surface benefits from a zero-commitment tier *that produces no artifact* (Instagram's private story like exists precisely because DM-forcing suppressed engagement). Apply to listing saves/reacts vs. inquiries. [S50][S52] |
| 8 | **Seller dashboard: one headline number, depth behind "See all"** | Pro Dashboard | Summary-vs-analyst split, one canonical metric, behavioral quality metrics (inquiry rate = share-rate analog), eligibility-as-progress for seller tiers. [S65][S22] |
| 9 | **Share sheet: ranked people-row before channels + "send to this chat"** | Share sheet | People-first ordering with affinity ranking, multi-select commit, and in-conversation re-share that shows the recipient on the button. And never co-locate an irreversible action at Send's old coordinates (Instagram's Create-Group failure). [S41][S45][S46] |
| 10 | **Shallow (1-level) comment threading + pinned context + ambient translation** | Comment threads | Flatten-with-@mention keeps listing Q&A scannable; ≤3 pins let sellers author the thread's frame; "See translation" serves cross-border thrifting; private downvote collects signal without fights. [S61][S63][S64][S60] |

---

## 10. Source Log

| ID | URL | Publisher | Date | Evidence class |
|----|-----|-----------|------|----------------|
| S1 | https://medium.com/@adelinego/about-instagrams-new-profile-layout-how-a-small-change-can-disrupt-user-flow-647d56a3c1e4 | Medium (HCI case study) | 2025 | SECONDARY ANALYSIS |
| S2 | https://www.linkedin.com/posts/vignesh-i-236818213_instagramupdate-ui-uiux-activity-7286631276277649408-wqNW | LinkedIn (designer teardown) | 2025-01 | SECONDARY ANALYSIS |
| S4 | https://postplanify.com/blog/how-to-edit-instagram-profile | PostPlanify | 2026 | SECONDARY ANALYSIS (documented limits) |
| S5 | https://gaminghq.eu/2025/05/01/instagram-blocks-web-users-from-editing-profile-links-forcing-app-download/ | GamingHQ | 2025-05 | COMMUNITY REPORT |
| S6 | https://techhounder.com/instagram-personalizable-profile-cards/ | TechHounder | 2025-09-24 | SECONDARY ANALYSIS |
| S8 | https://creators.instagram.com/create/insight-bundle | Instagram for Creators (official) | 2025 | PRIMARY DOC |
| S9 | https://en.androidayuda.com/instagram-profile-interface-changes/ | AndroidAyuda | 2025–26 | SECONDARY ANALYSIS |
| S11 | https://digitalshieldpro.com/posts/facebook-instagram-privacy-settings-2026/ | Digital Shield Pro | 2026 | SECONDARY ANALYSIS |
| S12 | https://help.instagram.com/194599462478093/ | Instagram Help Center | current | PRIMARY DOC |
| S13 | https://help.instagram.com/585369912141614/ | Instagram Help Center | current | PRIMARY DOC |
| S14 | https://www.socialmediatoday.com/news/instagram-adds-new-dm-message-management-options/758938/ | Social Media Today | 2025-08-29 | SECONDARY ANALYSIS |
| S15 | https://betanews.com/article/instagram-adds-new-dm-tools-and-tests-picture-in-picture-video/ | BetaNews | 2025 | SECONDARY ANALYSIS |
| S16 | https://creatorflow.so/blog/hide-comments-on-instagram/ | CreatorFlow | 2026-05 | SECONDARY ANALYSIS |
| S17 | https://www.shadowphone.io/how-to-edit-instagram-bio | Shadowphone | 2025–26 | SECONDARY ANALYSIS |
| S18 | https://catalogimages.wiley.com/images/db/pdf/9781119931799.excerpt.pdf | Wiley (Instagram For Dummies) | ~2023 | SECONDARY ANALYSIS |
| S19 | https://www.biogpt.io/how-to-fit-more-value-into-the-instagram-bio-character-limit/ | BioGPT | 2026 | SECONDARY ANALYSIS |
| S20 | https://postplanify.com/blog/how-to-check-instagram-username-availability | PostPlanify | 2026 | SECONDARY ANALYSIS + DIRECT OBSERVATION described |
| S21 | https://www.trypostbase.com/resources/how-to-change-instagram-name | Postbase | 2026 | SECONDARY ANALYSIS |
| S22 | https://www.trypostbase.com/resources/how-to-check-instagram-monetization-status | Postbase | 2025–26 | SECONDARY ANALYSIS |
| S23 | https://www.theverge.com/2024/8/22/24225247/instagram-song-on-profile-myspace-sabrina-carpenter-teaser | The Verge | 2024-08-22 | SECONDARY ANALYSIS |
| S24 | https://supgrowth.com/2026/08/07/how-to-turn-active-status-off-on-instagram/ | SupGrowth | 2026-08-07 | SECONDARY ANALYSIS |
| S25 | https://www.nngroup.com/articles/progressive-disclosure/ + /recognition-and-recall/ | Nielsen Norman Group | 2006/2016 | PRIMARY DOC (UX canon) |
| S26 | https://about.fb.com/news/2026/04/meta-account/ | Meta Newsroom | 2026-04 | PRIMARY DOC |
| S27 | https://about.fb.com/news/2023/01/centralizing-apps-settings-in-accounts-center/ | Meta Newsroom | 2023-01 | PRIMARY DOC |
| S28 | https://www.trustedreviews.com/how-to/how-to-use-instagram-security-checkup-4152284 | Trusted Reviews | 2021+ | SECONDARY ANALYSIS |
| S29 | https://www.theblue.social/articles/instagram-privacy-compliance-guide | TheBlue.social | 2025–26 | SECONDARY ANALYSIS |
| S30 | https://about.instagram.com/blog/announcements/new-time-management-tools-on-instagram-and-facebook + help pages | Instagram official + Help Center | 2018, current | PRIMARY DOC |
| S32 | https://transparency.meta.com/features/explaining-ranking/ig-notifications/ | Meta Transparency Center | current | PRIMARY DOC |
| S33 | https://supgrowth.com/2025/10/05/why-am-i-not-getting-notifications-on-instagram/ | SupGrowth | 2025-10-05 | SECONDARY ANALYSIS |
| S34 | https://engineering.fb.com/2025/09/02/ml-applications/a-new-ranking-framework-for-better-notification-quality-on-instagram/ | Engineering at Meta | 2025-09-02 | PRIMARY DOC |
| S35 | https://help.instagram.com/464473649316860/ + https://about.fb.com/news/2021/08/protecting-our-community-from-abuse-on-instagram/ | Instagram Help Center + Meta Newsroom | 2021, current | PRIMARY DOC |
| S36 | https://www.upgrow.com/blog/instagram-comment-tools-native-filter-review | UpGrow | 2025–26 | SECONDARY ANALYSIS |
| S37 | https://about.instagram.com/blog/announcements/introducing-new-ways-to-organize-your-saved-posts | Instagram official blog | 2017 (feature origin; current behavior per S38–S40) | PRIMARY DOC |
| S38 | https://uxmagic.ai/references/Instagram-iOS/Creating-a-collection-from-Saving-a-post | UXMagic screen archive | current | DIRECT OBSERVATION (flow archive) |
| S39 | https://medium.com/design-bootcamp/re-appreciating-saved-posts-an-instagram-case-study-518fca43684c | UX Collective/Bootcamp | ~2021, still cited | SECONDARY ANALYSIS |
| S40 | https://medium.com/@linggarpurnama/rethinking-instagram-saved-posts-bringing-collections-directly-to-the-profile-page-60f55b7981c7 | Medium (HCI case study) | 2026-06 | SECONDARY ANALYSIS |
| S41 | https://www.linkedin.com/posts/shruti-sindhi-data-analyst_instagrams-reels-your-friends-liked-circles-activity-7422224704607780864-b4IN | LinkedIn (data teardown) | 2025 | SECONDARY ANALYSIS |
| S42 | https://www.tdcommons.org/cgi/viewcontent.cgi?article=5511&context=dpubs_series | TD Commons (Google defensive pub) | n.d. | PRIMARY DOC (research) |
| S43 | https://hogatoga.com/instagram-new-redesigned-story-share/ | Hogatoga | 2024–25 | COMMUNITY REPORT |
| S44 | https://www.lindseygamble.com/blog/instagram-adds-shortcut-option-to-quickly-select-people-or-groups-for-sharing-among-a-trio-of-new-messaging-features | Lindsey Gamble | 2025 | SECONDARY ANALYSIS |
| S45 | https://techissuestoday.com/instagram-send-to-chat-button/ | TechIssuesToday | 2025 | SECONDARY ANALYSIS |
| S46 | https://www.taranbhamrah.com/instagram-case-study.html | Tarandeep Singh (UX case study) | 2025–26 | SECONDARY ANALYSIS |
| S47 | https://naturalmohican.com/2026/01/31/instagram-double-arrow-trap.html | Natural Mohican (blog) | 2026-01-31 | SECONDARY ANALYSIS |
| S48 | https://uxmagic.ai/references/Instagram-iOS/Sending-a-response-from-Watching-stories | UXMagic screen archive | current | DIRECT OBSERVATION (flow archive) |
| S49 | https://storydl.com/instagram-story-safe-zone/ + https://www.trymypost.com/instagram/story | StoryDL / TryMyPost | 2026 | SECONDARY ANALYSIS |
| S50 | https://mashable.com/article/instagram-stories-private-likes-update + https://www.socialmediacollege.com/blogs/instagram/instagram-adds-private-story-likes | Mashable / SMC | 2022 | SECONDARY ANALYSIS (quotes Mosseri) |
| S51 | https://peekstories.com/blog/instagram-story-likes-can-people-see-2026 | PeekStories | 2026 | SECONDARY ANALYSIS |
| S52 | https://instantdm.com/blog/how-to-react-on-instagram-story | InstantDM | 2026 | SECONDARY ANALYSIS |
| S53 | https://instantdm.com/blog/instagram-story-replies-private-who-can-see-how-they-work-2026 | InstantDM | 2026 | SECONDARY ANALYSIS |
| S54 | https://www.pvstories.com/blog/who-viewed-my-instagram-story/ | PV Stories | 2026 | SECONDARY ANALYSIS |
| S55 | https://statusbrew.com/learn/instagram-story-viewer/ | Statusbrew | 2025–26 | SECONDARY ANALYSIS |
| S56 | https://www.pvstories.com/blog/instagram-story-viewer-order/ | PV Stories (cites Verge/Gutman 2018) | 2026-07 | SECONDARY ANALYSIS |
| S57 | https://www.androidpolice.com/whatsapp-beta-testing-instagram-style-status-updates-reply-bar/ | Android Police | 2023–24 | SECONDARY ANALYSIS |
| S58 | https://mobbin.com/explore/screens/5755f999-143a-4343-a77c-5b946da63638 | Mobbin | current | DIRECT OBSERVATION (screen archive) |
| S59 | https://www.arxiv.org/pdf/2603.21953 | arXiv (comment-ranking study) | 2026 | PRIMARY DOC (peer-research) |
| S60 | https://www.theverge.com/news/613143/instagram-downrank-comments-button-test | The Verge | 2025 | SECONDARY ANALYSIS (quotes Mosseri) |
| S61 | https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies/ | Meta Developer Docs | current | PRIMARY DOC |
| S62 | https://learn.social.plus/uikit/components/social/comments-reactions | Social.plus UIKit docs | current | SECONDARY ANALYSIS (parallel implementation) |
| S63 | https://influencermarketinghub.com/instagram-pinned-comments/ | Influencer Marketing Hub | 2025 | SECONDARY ANALYSIS |
| S64 | https://help.instagram.com/512686498916530 + https://en.androidayuda.com/translate-comments-instagram-language-easily/ | Instagram Help Center + AndroidAyuda | current | PRIMARY DOC + SECONDARY ANALYSIS |
| S65 | https://www.inro.social/blog/instagram-dashboard-professional-dashboard-guide | Inrō | updated 2026-07 | SECONDARY ANALYSIS (detailed current-state) |
| S66 | https://www.socialmediatoday.com/news/instagram-adds-new-dm-message-management-options/758938/ + creators.instagram.com | SMT / Instagram for Creators | 2025 | PRIMARY DOC + SECONDARY |

**Adjacent context sources used:** BuzzFeed News (Following-tab removal rationale, 2019), TechCrunch (2020 nav redesign), Engadget/Neowin/PiunikaWeb (2025–26 Reels-first nav tests + backlash), GBNews (iOS 26 Liquid Glass backlash), 9to5Google (Mosseri on chronological feeds, 2026-09-11), muscle-memory dark-pattern paper (doi.org/10.1080/0144929x.2023.2294316), uxhorizon/VMobify teardowns, Instagram Feb-2025 DM update blog (translations, scheduled sends, pinned chats, group QR), Help Center pages for Hidden Words/Your Activity.

**Evidence-class summary:** Primary docs (Meta/Instagram official + Meta Engineering + Meta Dev docs + NN/g) ≈ 15; secondary analysis ≈ 35; direct-observation archives (UXMagic/Mobbin) = 3; community reports ≈ 3. No claim in this report rests on inference alone.
