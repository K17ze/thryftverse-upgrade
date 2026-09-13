# Snapchat Sub-Department UI/UX — September 2026 State
### Flagship audit research · Track: sub-department surfaces (camera excluded)
**Research date:** 2026-09-12 · **App version context:** 14.19.x–14.21.x (Aug–Sep 2026 releases) · **Total distinct sources:** 52 (URLs listed per-section; evidence class tagged)

---

## 0. Navigation context — where every sub-department lives (Sept 2026)

Snap's 2024 "Simple Snapchat" test (3 tabs: Chat+Stories / Camera / For You) was **abandoned in April 2025** after power users revolted — the same failure mode as the 2018 redesign. Snap instead ships a **"refined five-tab" layout**: **Snap Map · Chat (with Friend Stories embedded at the top of the chat feed) · Camera · Stories · Spotlight**, with Spotlight now seated directly to the right of the camera.

- Key quote (Q1 2025 investor letter, via TechCrunch/The Verge): *"Our most engaged Snapchatters consistently demonstrated a preference for a five-tab layout, favoring the familiarity of tile-based content discovery and a dedicated Map tab."* The winning move they kept: **Friend Stories inside the Chat feed** — it "boosted daily content viewership… particularly among more casual users."
- Lesson for ThryftVerse: **do not bury social/relational surfaces to simplify chrome.** Users navigate to relationships, not to abstraction layers.
- Sources: https://techcrunch.com/2025/04/29/snapchat-abandons-plans-for-a-simplified-version-of-its-app/ (PRIMARY DOC-ish, TechCrunch, 2025-04-29, SECONDARY ANALYSIS); https://www.theverge.com/news/658306/snapchat-simple-redesign-losing-north-american-users (The Verge, 2025, SECONDARY); https://newsroom.snap.com/sps-2024-simple-snapchat (Snap Newsroom, 2024-09-17, PRIMARY DOC); https://www.creativebloq.com/web-design/ux-ui/snapchats-redesign-fail-shows-users-dont-always-want-minimalist-ui (Creative Bloq + Reddit quotes, 2025, SECONDARY + COMMUNITY REPORT).

---

## 1. Chat list & chat screen

### Current Snapchat pattern (Sept 2026) — component anatomy

**Chat list (left tab):**
- Rows ordered by a recency/relationship algorithm — **not alphabetical, not purely chronological** (a known usability complaint since 2018; see UX case studies).
- Each row: friend Bitmoji (with **green Activity Indicator dot** if the friend is active and mutual-opted-in), display name, and a **status glyph** instead of a text preview of the last action state.
- **Icon grammar (the core system):** filled colored arrows/squares = sent/received unopened; hollow icons = opened; double arrows = screenshot; circular arrow = replayed. Color encodes *type*, not app theme: red = snap w/o audio, purple = snap w/ audio, blue = chat, grey = pending.
- **Friend Emojis + Snapstreak adornments** sit beside names: 🔥 + day count for streaks, ⌛ hourglass when a streak is within hours of dying, 💛/❤️/💕 hearts for best-friend tiers, 😬 grimace for shared #1, 😎 sunglasses for shared close friend.
- **Friend Stories now appear at the top of the Chat feed** (kept from Simple Snapchat after the revert) — story rings on avatars in the message surface.
- **Peek a Peek (Snapchat+):** an 👀 emoji appears next to a conversation *while* someone half-swipe-previews it — Snapchat monetized detection of its own long-standing "half swipe" workaround. If you're inside the chat while they peek, their Bitmoji slides in at the edge of the screen.
- **Bitmoji presence:** when a friend is *in the conversation with you*, their Bitmoji peeks over the input bar; a "typing…" indicator fires only on actual keyboard activity (no online/offline label — presence is deliberately fuzzy).
- Long-press a row → context menu: **Manage Friendship, Chat & Notification Settings, Story Settings, Pin Conversation (#1 BFF, Snapchat+), block/remove/report.**

**Chat screen:**
- **Ephemeral by default, graduated retention:** chats auto-delete after all participants view (or 24h/7d/"Never" per conversation — "Infinite Retention Mode" shipped from testing in 2025–26, opt-in **per conversation** with in-chat notices when either side changes it). Snaps can be set to "Keep Snaps in Chat" only if chat retention ≥ 24h.
- **Save-in-chat:** tap any message to save it — saved messages get a **grey background visible to both parties** (no stealth saving; saving is a mutual, legible act).
- **Long-press message menu:** Chat Reply (quoted/threaded), Snap Reply (quoted chat becomes a sticker on a snap), Bitmoji Reactions (7 Bitmoji emotions) + **any-emoji reactions** (2024), Edit (5-min window, first shipped to Snapchat+), Delete (deletion leaves a visible tombstone in-chat), Save, Copy, Report.
- **Chat Effects:** drag the send arrows up/down to scale message text size.
- **Per-conversation theming:** Chat Wallpapers (preset library, camera roll, saved-in-chat media, or **generative AI prompts** — wallpaper is *shared*: both sides see it, so it's a joint canvas, not a private skin), Custom Chat Colors (name color), custom per-friend notification sounds/ringtones.
- **Polls** via emoji poll stickers in chats/stories — votes are **non-anonymous by design** ("see how friends voted… to ensure responses stay thoughtful and kind").
- **Snapchat Plans (launched 2026-09-10, two days ago):** create real-world events inside chat — title, date/time, up to 200 invitees, dynamic Bitmoji cover art, invite cards delivered as 1:1 chats, RSVP Going/Maybe/Can't Go inline, "My Plans" section on profile + "Our Plans" on Friendship Profiles, 1-hour reminder.

### The psychology
- **Delete-by-default mimics talk.** Snap's own framing: messages vanish "the way conversations happen in the moment" — reducing self-consciousness and enabling low-stakes, mundane, authentic exchange (Bayer et al.; Ramirez et al. ACM study). Permanence is opt-in and *mutual* (saved = grey, retention = in-chat notice), so ephemerality is a negotiated contract between two people, not a unilateral policy.
- **Loss aversion + reciprocity = Snapstreaks.** The streak is "a counter with a deadline wrapped in an emoji" — the witness is a *real named person*, which is why it outperforms Duolingo-style fictional guilt. The ⌛ hourglass is a countdown-to-loss trigger; academic work shows teens send deliberately contentless "streak snaps" (mass snaps, black screens, "gm/gn") purely to service the ritual — the metric *became* the relationship maintenance.
- **Ambient intimacy via presence signals.** Bitmoji peeking, green dot, typing indicator, Peek-a-Peek — none say "online"; each says "this specific person is near *you* right now." Presence is scoped to the dyad, which keeps it intimate rather than surveillance-flavored.
- **Legibility of social state.** Every interaction leaves a tiny glyph trail (sent→delivered→opened→replayed→screenshotted). Screenshot *notification* is the enforcement mechanism that makes ephemerality socially safe: "selective saving with notification" preserves the feel of ephemerality while allowing capture.

### What makes it flagship
- One icon grammar carries ~20 states with zero text; color is semantic (content type), shape is temporal (filled→hollow→double-arrow lifecycle).
- Privacy mechanics are **two-way and visible**: saving shows grey to both; deleting shows a tombstone; retention changes post an in-chat notice; screenshotting pings the sender. Nothing about message state is private to one side.
- Per-relationship customization (wallpaper shared between the two of you, per-friend notification sounds, #1 BFF pin that's invisible to them) treats each conversation as a *room two people decorate*, not a uniform pipe.
- Presence is opt-in and fuzzy by default (Activity Indicator toggle; "recently active" not "online at 14:32:07").

### Transferable mechanics for ThryftVerse
- **Status glyph lifecycle on the message list** — sent/delivered/read as compact icon states rather than text.
- **Per-conversation retention & shared save state** — e.g., offer/negotiation messages in a buyer↔seller thread can be "kept" with a visible marker both sides see (trust + auditability in one move).
- **Shared conversation theming / deal room feel** — the thread between buyer and seller about a specific item gets the item's imagery as ambient context (wallpaper analogue), making each negotiation feel like a distinct space.
- **Inline structured objects in chat** — Snapchat Plans → ThryftVerse: offers, counter-offers, meetup/pickup scheduling, bundle proposals as first-class message cards with inline actions (Accept/Counter), not links to elsewhere.
- **Poll-with-visible-votes mechanic** — group/wardrobe votes ("which of these two jackets?") where transparency is a kindness feature.
- **Streak analogue (careful):** reciprocal action counters (e.g., "you've traded with @sam 12 times") are safer than daily-deadline streaks — see acceptance criteria note on ethical streak design.
- **Presence done respectfully:** "seller typically replies within ~2h" or a soft "active now" dot, never an exact last-seen timestamp.

### Measurable acceptance criteria
- Chat list row communicates: avatar + presence + last-action state + relationship badge in ≤ 64pt height, no text preview required for state.
- Every state-changing action in chat (save, delete, retention change, screenshot-equivalent export) produces a visible in-thread marker legible to both parties.
- Per-conversation settings reachable in ≤ 2 gestures from the thread (long-press or header).
- Structured commerce objects (offer/counter/pickup plan) render inline in-thread with ≤ 1 tap to act.
- Typing indicator debounced: appears only on keyboard activity, clears ≤ 5s after stop.

**Sources:** https://help.snapchat.com/hc/en-gb/articles/7012315702548 (PRIMARY DOC); https://help.snapchat.com/hc/en-us/articles/7012334940948 (PRIMARY DOC — retention rules); https://newsroom.snap.com/infinite-retention-mode (PRIMARY DOC); https://help.snapchat.com/hc/en-us/articles/7012392635156 (PRIMARY — save/delete); https://help.snapchat.com/hc/en-us/articles/7012377741332 (PRIMARY — Save in Chat); https://help.snapchat.com/hc/en-us/articles/7012338497172 (PRIMARY — Snap Reply/Chat Reply); https://newsroom.snap.com/new-messaging-tools (PRIMARY — replies/reactions/polls); https://newsroom.snap.com/new-features-may-2024 (PRIMARY — editable chats, emoji reactions); https://help.snapchat.com/hc/en-us/articles/17791249939220 (PRIMARY — Chat Effects); https://help.snapchat.com/hc/en-us/articles/20537378916756 (PRIMARY — Peek a Peek); https://www.thefocus.news/lifestyle/can-someone-see-if-you-half-swipe-on-snapchat/ (SECONDARY); https://help.snapchat.com/hc/en-us/articles/11482821685012 + /14876924527636 (PRIMARY — wallpapers incl. generative AI); https://tinygrab.com/does-snapchat-say-typing-when-you-open-the-chat/ (SECONDARY — typing semantics); https://help.snapchat.com/hc/en-us/articles/17980426873492 (PRIMARY — Activity Indicator); https://newsroom.snap.com/making-plans-irl + https://techcrunch.com/2026/09/10/snapchat-takes-aim-at-partiful-with-new-event-planning-features/ (PRIMARY + SECONDARY — Plans, 2026-09-10); https://dl.acm.org/doi/10.1145/2818048.2819948 (SECONDARY ANALYSIS — ephemerality study); https://dontsnooze.io/blog/snapchat-streak-teardown/ (SECONDARY — streak teardown, Aug 2026); https://pdfs.semanticscholar.org/3e81/efd53b15e4b01ef47585ad3fe9b4a00813a2.pdf (SECONDARY — streak metagaming paper).

---

## 2. Stories surfaces

### Current Snapchat pattern (Sept 2026) — component anatomy
- **Three story classes with distinct audience contracts:** *My Story · Friends* (default: friends only), *My Story · Public* (friends + followers + anyone — requires Public Profile), and up to **20 Private/Shared Stories** per user.
- **Shared Story roles:** Owner (rename, add/remove/ban members, delete story, appoint up to 5 Moderators) → Moderator (membership + content curation) → Member (add/remove own snaps). Creator can save the whole story; if the creator deletes it, everything goes.
- **Auto-expiry:** story snaps live 24h; a Shared Story *dies entirely* if no one adds within 24h — content responsibility is communal.
- **Viewer chrome:** tap-through progression; **swipe up on your own story → Insights & Replies** (viewer list up to 200 named viewers + count beyond, screenshot double-arrow icon per viewer, reply list). Screenshot marks exist only while the story is live — data dies with the story.
- **Story replies:** on by default for public stories; replies land in a Story Management screen + notifications; toggle "Show Story Replies" off globally; per-reply X to block/report sender.
- **Per-friend story privacy:** Settings → My Privacy & Data → View My Story → *Custom* to exclude specific friends (privacy captured **per snap at post time** — changing the setting later doesn't retro-hide already-posted snaps); per-friend **Mute Story** (moves them out of the top of the feed silently; the muted person is never told).
- **Snapchat+ story layer:** Custom Story Expiration (1h→1 week), Story Boost (1/week private-story reach extension), Story Rewatch Indicator (count, not names), Story Timestamps, Priority Story Replies, Story View Notifications (notify on a *specific friend's first view*, with a "Make it Private" toggle that hides their name in the notification).

### The psychology
- **24h default converts posting from publishing to broadcasting mood** — the cost of a mediocre post is zero, so frequency beats polish.
- **Audience contracts are pre-commitment:** choosing Friends vs Public vs a named Private Story is choosing a *social room*; Custom-blocking a friend is face-saving because it's silent.
- **Viewers' list = soft reciprocity ledger:** seeing *who* watched (and who screenshotted) gives the poster social feedback without a like economy.
- **Shared Stories distribute the labor of keeping a space alive** — the 24h-or-die rule makes contribution a group obligation.

### What makes it flagship
- Privacy set **at post-time per content item**, with explicit non-retroactivity documented — consent travels with the object, not the account.
- Screenshot/viewer telemetry is **deliberately ephemeral too** (gone at expiry) — even analytics obey the app's physics.
- Role hierarchy (Owner/Moderator/Member) gives community surfaces governance without a settings screen.

### Transferable mechanics for ThryftVerse
- **Expiring showcase surfaces** — "24h drop stories" per shop/closet: new listings shown as a tappable story rail on the storefront; urgency is honest because the story actually expires.
- **Audience tiers for sellers:** Friends/Public/Private-circle listings (early access drops for repeat buyers = Private Story analogue).
- **Swipe-up analytics on ephemeral content:** seller sees viewers + "saved/screenshotted" intent signals while the drop is live.
- **Collaborative collections with roles:** community-curated collections (Owner/Mod/Member) — e.g., neighborhood thrift circles each adding finds to a shared 24h/7d board.

### Measurable acceptance criteria
- Expiring content shows time-to-expiry in the viewer chrome (ring or countdown), never silently.
- Per-item audience selection is captured at publish and non-retroactive by default.
- Viewer telemetry scoped to content lifetime; deleted/expired content carries no lingering analytics surface.
- Collaborative surface roles: ≥ 2 tiers (owner/member) with member self-removal always possible.

**Sources:** https://help.snapchat.com/hc/en-us/articles/7012312875412 (PRIMARY — Shared Stories); /7012343640084 (PRIMARY — create private/shared, 20-cap); /7012352413588 (PRIMARY — roles); /7012279488532 (PRIMARY — per-snap privacy capture); /7012321733012 (PRIMARY — insights & replies); /7012301241108 + /7012278160532 (PRIMARY — replies controls); /7012323873940 (PRIMARY — mute); https://help.snapchat.com/hc/en-us/articles/26058714433428 (PRIMARY — Story View Notifications); https://www.ranktracker.com/blog/how-to-see-who-screenshotted-your-snapchat-story/ + https://designbeep.com/2026/05/09/... (SECONDARY — screenshot UX detail); https://snapchatplanet.com/what-is-snapchat-plus/ (SECONDARY — Plus story features).

---

## 3. Memories

### Current Snapchat pattern (Sept 2026) — component anatomy
- **Swipe up from camera** → Memories: tabbed grid (Snaps / Stories / Camera Roll / **My Eyes Only** / AI Snaps), smart search (categories + free text + **opt-in face grouping** with user-applied labels, deletable on opt-out), select-mode bulk actions.
- **Flashback Memories:** auto-compiled Featured Stories from same-date-prior-year snaps; generative-AI personalized titles and multi-chapter labeling; they expire; **never pulls from My Eyes Only**. Annual Recap is separate.
- **Edit/send flows:** any memory re-enters the creative pipeline (edit → send to chat → post to story → export to camera roll); "create a Story from Memories"; camera-roll import.
- **My Eyes Only:** separate tab behind a **4-digit passcode or alphanumeric passphrase**; contents are encrypted such that *Snap itself cannot recover them*; forgotten passcode → reset requires account password + **destroys the vault contents** (destruction is the feature, disclosed in two acknowledgement steps); only photo snaps + <10s videos qualify; can be made the default save destination.
- **Export:** Memories-only export via accounts.snapchat.com → My Data → date-ranged zip with index.html browser UI.

### The psychology
- **A private layer inside an ephemeral app fixes the core tension**: users *expect* deletion yet *experience* loss (media/meaning/context loss documented in HCI research). Memories = sanctioned persistence; MEO = persistence with a threat model (device theft, snooping, even Snap).
- **Face groups + Flashbacks convert an archive into nostalgia delivery** — the app resurfaces your own past on anniversaries, manufacturing emotional re-engagement without social obligations.
- **Destructive reset is trust-marketing:** "we cannot recover it" is repeated because irrecoverability *is* the privacy guarantee.

### What makes it flagship
- Biometric-adjacent feature (face grouping) is **strictly opt-in, labeled, deletable** — a model for sensitive AI features.
- MEO communicates a real cryptographic posture through UI copy, not jargon: "not even us."
- Archive items flow back into composition in one gesture — the archive is a workshop, not a museum.

### Transferable mechanics for ThryftVerse
- **"Vault" pattern for sensitive marketplace data:** private notes on items, saved searches, drafts, or purchase history behind a biometric/PIN gate with honest copy about recoverability.
- **Resurfacing engine:** "Listed 1 year ago — still in your closet?" or "You loved this seller's drop" anniversary cards — nostalgia → re-listing/re-purchase funnel.
- **Bulk select → export (data portability):** order history / listing archive export builds trust and is cheap to build.
- **Smart search over visual inventory** (categories + labels) for closets with 100+ items.

### Measurable acceptance criteria
- Private vault: PIN/biometric gate, zero-recovery copy, destructive-reset requires re-auth + explicit destruction acknowledgement.
- Every archived item can re-enter an active flow (re-list, share, export) in ≤ 3 taps.
- Search over personal inventory returns results in < 300ms perceived; face/category clustering strictly opt-in.
- Full data export request → delivered artifact within a stated SLA.

**Sources:** https://help.snapchat.com/hc/en-us/articles/7012317537556 (PRIMARY — MEO); /7012359362196 (PRIMARY — destructive reset); https://values.snap.com/privacy/privacy-by-product/memories (PRIMARY — "not even us"); /7012305371156 (PRIMARY — export); /7012412254356 (PRIMARY — search); /7012400472084 (PRIMARY — Flashbacks, AI titles/chapters, MEO exclusion); /47615847736724 (PRIMARY — face groups, biometric disclosure); /18494402767252 (PRIMARY — AI Snaps); https://doi.org/10.1145/2998181.2998266 (SECONDARY — loss workarounds).

---

## 4. Profile & friendship surfaces

### Current Snapchat pattern (Sept 2026) — component anatomy
- **Friendship Profile = the per-dyad dossier:** saved-in-chat media and messages shared between the two of you, shared **Charms** at the bottom (auto-awarded relationship mementos — "It's a Sign" same-star-sign, Super BFF 2-month, Mutual Besties, birthstones, Bitmoji/birthday charms; tappable for explanations; **group charms visible to all members**), voice/video call + snap/chat actions, three-dot menu → report/block/remove/manage notifications. **Screenshotting a Friendship Profile may notify the friend.**
- **Astrological Profiles:** opt-in birth date/time/place → 10-planet personality read; **Astrological Compatibility** on the Friendship Profile (requires *both* opted in) renders a 5-axis story: Attraction, Intensity, Tension, Support, Harmony + summary — sendable to the friend, postable, saveable.
- **Display Name vs Username:** Display Name is free-form (≤30 chars, emoji/special chars, no phone number), changeable anytime — but **existing friends keep seeing the name they saw when they added you** (a per-relationship snapshot of identity!). Username changeable **once/year** with zero loss (streaks, score, memories, friends preserved); the yearly scarcity makes it a deliberate act.
- **Friend Emojis & Solar System:** algorithm-assigned relationship emojis (💛→❤️→💕 escalation ladder, 😬 awkward-shared-#1, 😎 mutual-close-friend, 😏 they-like-you-more) — users can remap which emoji maps to which tier in settings. Snapchat+ adds **Friend Solar System** (your top-8 friends as planets Mercury→Neptune on their Friendship Profile badge; ranking is *your view of them*, off-by-default for new subscribers, toggleable) and **#1 BFF pin** (private, no notification to them) + Extended BFF list.
- **Per-friend privacy/actions:** Mute Story, Mute Chats/Calls (all silent — target never notified), Manage Friendship → block (kills snaps/chats/stories/charms/map/search/Quick Add visibility; no notification) vs remove (still sees public content), per-conversation notification settings, Activity Indicator global toggle.

### The psychology
- **The Friendship Profile makes the relationship an object you can visit.** Snapchat's insight: people don't have "contacts," they have *relationships with artifacts* — saved moments, charms, compatibility, a rank in each other's orbit.
- **Asymmetric visibility is load-bearing:** #1 BFF pin and Solar System show *your* view of them, not theirs — private ranking avoids reciprocal-status pressure; mutes and blocks are silent to spare confrontation.
- **Display-name snapshotting** is quietly profound: your name to each friend is what it was *when the relationship formed* — identity is per-relationship, not global. This is the deepest transferable idea on this whole list.
- **Charms gamify longevity without deadlines** — awarded for sustained mutual behavior (unlike streaks' loss-aversion loop, charms celebrate rather than threaten).

### What makes it flagship
- A **per-relationship privacy & identity graph**: visibility, muting, display name, story access, location sharing, retention — all settable per dyad, mostly silently.
- Gamified relationship artifacts that can't be bought or gamed on demand — earned states only.
- Compatibility story converts a settings-field (birthday) into a *shareable social object*.

### Transferable mechanics for ThryftVerse
- **Buyer↔seller relationship profiles:** shared order history, saved chat media, "relationship stats" (trades, total saved vs. list price, repeat-buyer tenure), trust artifacts — makes repeat commerce feel like a relationship, not a ledger.
- **Earned badges-as-charms:** "Bundle Buddy" (5+ bundles together), "Fast Shipper to You" — two-party earned charms celebrating the *dyad*, not global reputation scores (which invite gaming).
- **Silent per-relationship controls:** mute a seller's drops, hide a buyer's lowball offers, snooze a chat — all without notification.
- **Per-relationship display context:** shop-name snapshots, private notes/nicknames per counterparty ("Dana — sells vintage denim").
- **Deliberate-identity mechanics:** yearly-changeable handle, anytime-changeable display name; scarcity communicates seriousness.

### Measurable acceptance criteria
- A per-counterparty "relationship profile" exists containing shared history + artifacts + controls in one scroll.
- ≥ 3 silent per-relationship controls (mute drops / mute chat / hide) that never notify the other party.
- ≥ 3 earned dyad badges with documented award logic; none purchasable.
- Identity model separates immutable handle (rate-limited changes) from flexible display name; per-relationship private nickname supported.

**Sources:** https://help.snapchat.com/hc/en-us/articles/7012313823508 (PRIMARY — Charms); /7012371641364 (PRIMARY — Friendship Profile, screenshot notice); /7012367514644 (PRIMARY — astro compatibility, 5 axes); https://newsroom.snap.com/snapchat-astrology (PRIMARY); https://help.snapchat.com/hc/en-gb/articles/7012316571540 (PRIMARY — display name, friend-snapshot behavior); https://newsroom.snap.com/username-change (PRIMARY — yearly username); /8098318922516 (PRIMARY — Solar System, off-by-default); https://www.digitaltrends.com/mobile/snapchat-planets-order-meaning-explained/ (SECONDARY, Jun 2026); https://snapplanets.info/snapchat-friend-emojis/ (SECONDARY — emoji semantics); https://help.snapchat.com/hc/en-us/articles/7012401093396 (PRIMARY — block scope); /7012323873940 + /7012355955988 (PRIMARY — mute/notifications); https://www.makeuseof.com/what-are-snapchat-charms/ (SECONDARY — charm catalog).

---

## 5. Snap Map sub-surfaces

### Current Snapchat pattern (Sept 2026) — component anatomy
- **Opt-in, default-off:** you appear on friends' maps only after mutual friendship + first map open + OS location permission + an explicit share choice. No app-open for 24h → you vanish from the map until you open again (unless indefinite live-share is on).
- **Ghost Mode with a timer:** 3h / 24h / "Until Turned Off" — hiding is *temporal*, and your Bitmoji holds a blue ghost sign so it's a legible state, not an absence. Location still goes to Snap (disclosed).
- **Granularity ladder:** My Friends (all, incl. future adds — with periodic "still want this?" check-ins) → *My Friends, Except…* (denylist) → *Only These Friends* (allowlist; selected friends **not notified**). Live location is a *separate* per-friend layer with its own off-switch.
- **"Only while using" vs "Always":** foreground-only location expires after 24h; background live-share is framed for trusted circle ("traveling home safely").
- **Caveats are surfaced in-product:** "Snaps submitted to Snap Map appear regardless of location setting" warnings sit inside the settings articles.
- **2026 additions:** **Now Playing** (July 2026 — share real-time Spotify listening on the map; per-audience controls; auto-pauses after 24h app inactivity; pause options 3h/24h/indefinite — same temporal grammar as Ghost Mode), **Map Reactions** (wave/heart at friends' locations — ambient ping without opening chat).

### The psychology
- **Ambient awareness without check-ins:** seeing a friend's Bitmoji somewhere is intimacy-by-proximity; location becomes a social *presence layer*, and Map Reactions let you acknowledge without obligating a reply.
- **Temporal privacy (3h/24h/off) matches how people actually feel** — privacy needs are situational, not permanent; a timer converts "turn off and forget" into "borrow privacy."
- **Auto-invisibility after inactivity** is consent decay: stale sharing silently revokes itself.

### Transferable mechanics for ThryftVerse
- **Local pickup/meetup layer:** share approximate location or "available for pickup today" state with a timer (3h window during a flea market run), auto-expiring.
- **Granularity ladder for commerce presence:** share activity radius with Everyone / Followers / Only these buyers — denylist+allowlist, selections never notify.
- **Consent decay:** any location/availability sharing silently expires after inactivity; periodic re-confirm check-ins for "share with all."
- **Ambient pings** ("waved at your shop") as zero-commitment engagement.

### Measurable acceptance criteria
- Location/availability sharing is default-off, requires explicit opt-in, and shows current sharing state as a persistent visible affordance.
- ≥ 3 granularity tiers incl. allowlist and denylist modes; selections generate zero notifications.
- Timed privacy modes (pause for 3h/24h/indefinitely); any background sharing has a separate toggle and periodic re-confirmation.

**Sources:** https://values.snap.com/privacy/privacy-by-product/snap-map?lang=en-US (PRIMARY); https://help.snapchat.com/hc/en-us/articles/7012322854932 (PRIMARY — Ghost Mode timers); /7012277077140 + /7012270909972 (PRIMARY — granularity ladder, no-notify); /24547077410580 (PRIMARY — only-while-using vs always); https://techcrunch.com/2026/07/27/snapchat-now-lets-you-share-what-youre-listening-to-in-real-time/ (SECONDARY — Now Playing, 2026-07-27); https://newsroom.snap.com/new-features-may-2024 (PRIMARY — Map Reactions).

---

## 6. Settings & account

### Current Snapchat pattern (Sept 2026) — component anatomy
- **IA:** Settings reachable only via Profile ⚙️; sections roughly: My Account (Name, Username, Birthday, contact info) / **App & Privacy → My Privacy & Data** (Contact Me, View My Story incl. per-friend Custom, See My Location, Find Friends visibility, Activity Indicator) / My App (Selfie, Lifestyle & Interests, appearance, notification prefs) / Manage My Account (Ads topic toggles) / support/legal. Per-surface settings also live **contextually** (chat settings inside the thread, map settings on the map).
- **Account flows:** sign-up = name → birthday → suggested username (editable, yearly-change warning at creation: "choose wisely") → password → phone *or* email verify → contacts/Bitmoji/permissions with skippable steps. Onboarding teardowns flag: permission-request pile-up, generated-username friction, OTP wait anxiety — real weaknesses.
- **Privacy controls are scattered-but-contextual:** strongest controls live where the data is (map gear on the map, retention inside the thread, story audience on the story) with a central "My Privacy & Data" hub as backstop.
- **Streaks/rewards surfaces:** streak state lives *in the chat list row* (🔥/⌛), Snapscore on profile; Snapchat+ adds Instant Streaks, Streak Reminders, **Streak Restore** (one free restore; the restore button overload is a documented heuristic complaint — "too many Restore buttons, unclear CTAs").

### Psychology & weaknesses
- **Settings are Snapchat's weakest surface:** STRAP privacy-usability studies give Snapchat the *highest* severity ratings among major social apps (worst on consent revocation); UX case studies show users can't find or parse settings ("additional services" confusion); no settings search was a long-standing gap. **Lesson: even flagship apps fail settings IA — an opportunity to leapfrog.**
- The **hybrid pattern** (central hub + in-context controls) is still the right model — ThryftVerse should copy the *model* and beat the execution (add settings search, plain-language labels, "what others see" previews).

### Transferable mechanics
- Central privacy hub with per-capability rows ("Who can contact me," "Who can see my shop activity") + **in-context duplicates** of the same control where the data lives.
- Settings **search + plain-language + preview of effect** (show what a blocked user sees) — directly fixes documented Snapchat weaknesses.
- Onboarding: defer permissions to first-use context (Snapchat's upfront pile-up is the anti-pattern), suggested handles with clear change-policy copy upfront.

### Measurable acceptance criteria
- Every privacy control exists in ≤ 2 places: central hub + context surface, same source of truth.
- Settings search covers 100% of toggles; each toggle shows a one-line effect statement.
- Sign-up: ≤ 5 required steps; no permission asked before its feature is first invoked; handle-change policy disclosed at creation.

**Sources:** https://help.snapchat.com/hc/en-us/articles/7012343074580 (PRIMARY — privacy settings map); https://uxdesign.cc/snapchat-a-ux-case-study-8b8a520df7d1 (SECONDARY — settings IA failure study); https://thesai.org/Downloads/Volume12No8/Paper_29-... (SECONDARY — STRAP severity scores); https://medium.com/@anshichaurasia04/... (SECONDARY — no-chat-lock/no-settings-search findings); https://assets.nextleap.app/submissions/SnapchatTeardown-...pdf (SECONDARY — onboarding teardown); https://pageflows.com/post/ios/onboarding/snapchat/ (DIRECT OBSERVATION — recorded flow); https://help.snapchat.com/hc/en-us/articles/7012333136788 (PRIMARY — account creation); https://www.linkedin.com/posts/bhavesh-aggarwal... (COMMUNITY/SECONDARY — restore-button heuristic critique).

---

## 7. Spotlight / Discover sub-surfaces

### Current pattern
- **Unified ranking doc for Discover + Spotlight:** personalization via explicit signals (subscribe, share, favorite = positive; skip, report, hide = negative; watch-time/completion weighted) — Snap *publishes* this ranking logic to users, unusual transparency.
- **Controls:** long-press tile → "Hide this Content" + Un-Hide management screen (View Hidden Stories); Subscribe from search/long-press; **Lifestyle & Interests** toggles (user-editable inferred interest categories for ads+content); ad-topic suppression (political/alcohol/gambling).
- **Limits disclosed:** "Not all Stories content can be hidden, and you can't completely disable a topic, theme, or the Discover section" — honest about control ceilings.
- Discover's editorial tiles remain a documented weak spot (users can't sort/filter by topic; low discoverability of unsubscribe — 2019 study: only ~14% knew how to remove channels).

### Transferable mechanics
- **Published, user-editable interest graph:** "Your thrift taste profile" — editable category toggles (denim, vintage tees, sneakers) that visibly shape the feed; hide/unhide feed items with a management screen.
- **Hide-as-signal:** long-press → "Show less like this" feeding ranking, with an audit screen.
- **Honest control ceilings:** disclose what can't be disabled.

### Acceptance criteria
- Long-press on any feed card → hide/show-less in ≤ 1 tap; hidden-items management screen exists.
- Interest toggles visibly alter feed within 1 session; ranking signals documented in-product.

**Sources:** https://help.snapchat.com/hc/en-us/articles/8961631424020 + /8961653169940 (PRIMARY — ranking transparency); /7012313073556 (PRIMARY — hide/unhide + limits); /17338132910484 (PRIMARY — personalization); https://help.snapchat.com/hc/en-gb/articles/7012345515796 (PRIMARY — lifestyle categories, ad topics); https://jbarn11.medium.com/snapchat-redesign-2019-ux-case-study... (SECONDARY — Discover control discoverability).

---

## 8. Snapchat+ (paid surfaces)

### Current pattern (Sept 2026)
- **Presentation:** banner card at top of Profile → Snapchat+ membership page = **feature management surface** where every perk is a toggleable card (Solar System ships *off by default*; Story Timestamps, Extended BFF List, Peek a Peek all user-toggled). Features are framed as "exclusive, experimental, and pre-release" — the lab is part of the pitch.
- **40+ features** clustered: personalization (app icons, themes, chat wallpapers/colors, notification sounds), social insight (Solar System, #1 BFF, Peek a Peek, Post View Emoji, Story View Notifications, rewatch counts), streaks (Instant, Reminders, **Restore**), AI (generative wallpapers, profile backgrounds, captions).
- **Plans:** monthly/yearly; **Platinum** (removes Sponsored Snaps + Story/Lens ads), **Family Plan**, **Lens+**; purchase completes in App Store/Play; billing managed in store.
- **Gifting:** 3/6/12-month non-recurring gift subs (friends only, recipient must not be subscribed; gift stacks after existing sub ends) + emailed **gift cards** redeemable on snapchat.com/plus.
- **Design trick of note:** several perks are *detectors of covert behavior* (Peek a Peek reveals half-swipers; rewatch counts; first-view notifications) — Snapchat+ sells **surveillance asymmetry between friends**, which is why it's social-glue revenue, not utility revenue.

### Transferable mechanics
- **A "pro" tier sold as per-feature toggle cards on a membership page** (users compose their own premium), including experimental flags framed as early access.
- **Ad-free tier** analogue: "ThryftVerse+ removes promoted listings."
- **Relationship-insight perks done ethically:** see when a buyer re-views your listing, "someone has this in their cart" signals — monetizable attention telemetry (with per-user "Make it Private" controls, like Story View Notifications).
- **Gift subscriptions** between users — for a marketplace, giftable "seller boost" or shipping credit.
- **Experimental-toggle page** as a retention surface in itself.

### Acceptance criteria
- Membership page lists every perk as an individual card with on/off state where applicable; ≥ 1 perk ships default-off.
- Gifting supports fixed-duration non-recurring gifts with clear stacking rules.
- Any "who viewed/peeked" insight ships with a privacy toggle for the *observer* side.

**Sources:** https://www.snapchat.com/plus (PRIMARY — marketing surface); https://help.snapchat.com/hc/en-gb/articles/7121577610900 (PRIMARY); /45845487406740 (PRIMARY — Platinum/Family/Lens+); /11483124963860 (PRIMARY — gifting); https://www.snap.com/terms/gifting-terms + /gift-card (PRIMARY — legal mechanics); /18530032263828 + /25552272331796 (PRIMARY — toggle-off-by-default patterns); https://snaporbitlab.com/snapchat-plus-features/ + https://storytellershats.com/what-is-snapchat-plus/ (SECONDARY — 2026 feature lists).

---

## 9. Ranked top-10 Snapchat sub-department patterns a marketplace app most likely lacks
*(weighted toward messaging/chat + per-relationship privacy, per brief)*

| # | Pattern | Why a marketplace probably lacks it | Priority |
|---|---------|-------------------------------------|----------|
| 1 | **Two-way legible message states** — save shows grey to both parties; delete leaves a tombstone; retention changes post in-chat notices; screenshot-equivalents notify | Marketplaces treat chat as a log one side reads, not a shared contract both parties see change | 🔴 Critical — trust primitive for negotiation |
| 2 | **Per-relationship privacy graph** — mute chats/calls/story, block vs remove, per-dyad retention, per-friend story exclusion — all silent, all granular | Most marketplaces have only global block/report; nothing between "full contact" and "nuclear option" | 🔴 Critical |
| 3 | **Per-dyad relationship profile** — shared saved media, earned charms/badges, stats, controls in one scroll | Buyer↔seller history is scattered across orders/messages; the *relationship* isn't an object | 🔴 Critical — repeat-commerce flywheel |
| 4 | **Ephemeral-by-default with graduated, negotiated persistence** — content expires; keeping it is explicit and mutual | Marketplace chats persist forever or not at all; no shared "keep this offer" ritual | 🟠 High |
| 5 | **Structured social objects inside chat** — Plans (RSVP cards), polls with visible votes, quoted Snap-Reply | Marketplace chat = text + maybe a listing link; offers/pickup scheduling aren't first-class | 🟠 High |
| 6 | **Presence signals scoped to the dyad** — Bitmoji peeking, fuzzy "recently active" green dot, typing-on-keyboard-only, peek-detection | "Last seen" timestamps or nothing; no ambient intimacy between buyer/seller | 🟠 High |
| 7 | **Temporal privacy controls** — Ghost-Mode timers (3h/24h/indefinite), auto-expiring sharing, consent decay after inactivity | Location/availability/visibility toggles are binary and permanent — the failure mode Snapchat solved | 🟠 High |
| 8 | **Relationship artifacts earned not bought** — charms, 💛→❤️→💕 escalation, shared-#1 emojis, Solar System ranks | Reputation = global star ratings (gameable); nothing celebrates the specific two-party bond | 🟡 Medium-high |
| 9 | **Per-relationship identity** — display-name snapshotting, private nicknames, shared chat wallpaper as joint canvas | One global profile renders identically to everyone; no "this is my denim guy" context | 🟡 Medium-high |
| 10 | **Membership-as-toggles + giftable subs** — per-perk cards, default-off sensitive perks, 3/6/12-mo non-recurring gifts | Marketplace subs (if any) are monolithic paywalls, not a composable lab | 🟡 Medium |

---

## Methodology note
Sources: 52 distinct URLs across Snapchat Help Center (help.snapchat.com — PRIMARY DOC), Snap Newsroom + values.snap.com + snap.com/terms (PRIMARY), TechCrunch/The Verge/Engadget (SECONDARY ANALYSIS, dated), Page Flows/Mobbin (DIRECT OBSERVATION recordings), ACM/journal papers (SECONDARY ANALYSIS), UX case studies on Medium/uxdesign.cc (SECONDARY), Reddit-sourced reporting (COMMUNITY REPORT), SEO explainer sites (SECONDARY, lowest confidence — cross-checked against Help Center where possible). INFERENCE items are flagged inline. No camera-screen research performed per scope. Report generated 2026-09-12; app state as of v14.19–14.21.
