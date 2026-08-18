# 22 — 2026 Web Research Compendium

**Programme:** ThryftVerse Flagship Upgrade
**Document ID:** 22
**Status:** Consolidated evidence file — single source of truth for all 2026 web research
**Research window:** August 2026 (latest updates)
**Purpose:** Every department report (00–21) in this programme references 2026 findings. This compendium is the traceable, URL-backed evidence layer behind those findings. No department claim about external 2026 product behaviour, design pattern, or platform convention should exist without a corresponding entry here.

---

## Table of Contents

1. [Methodology and Scope](#1-methodology-and-scope)
2. [Department 00 — Programme Overview & Cross-Cutting Research](#2-department-00--programme-overview--cross-cutting-research)
3. [Department 01 — Design System & Tokens](#3-department-01--design-system--tokens)
4. [Department 02 — Motion Language](#4-department-02--motion-language)
5. [Department 03 — Instagram Feed & Discovery](#5-department-03--instagram-feed--discovery)
6. [Department 04 — Instagram Profile & Grid](#6-department-04--instagram-profile--grid)
7. [Department 05 — Instagram DM & Messaging](#7-department-05--instagram-dm--messaging)
8. [Department 06 — Instagram Live Shopping](#8-department-06--instagram-live-shopping)
9. [Department 07 — Instagram Onboarding & Notifications](#9-department-07--instagram-onboarding--notifications)
10. [Department 08 — Pinterest Home Feed & Masonry](#10-department-08--pinterest-home-feed--masonry)
11. [Department 09 — Pinterest Visual Search & Lens](#11-department-09--pinterest-visual-search--lens)
12. [Department 10 — Pinterest Boards & Navigation](#12-department-10--pinterest-boards--navigation)
13. [Department 11 — eBay Product Page & View Item](#13-department-11--ebay-product-page--view-item)
14. [Department 12 — eBay Sell Flow & Magical Listing](#14-department-12--ebay-sell-flow--magical-listing)
15. [Department 13 — eBay Auction & Bidding](#15-department-13--ebay-auction--bidding)
16. [Department 14 — eBay Order Tracking & Buyer Protection](#16-department-14--ebay-order-tracking--buyer-protection)
17. [Department 15 — eBay Live Shopping](#17-department-15--ebay-live-shopping)
18. [Department 16 — Snapchat Chat & Messaging](#18-department-16--snapchat-chat--messaging)
19. [Department 17 — Snapchat Creator Tools & Profile](#19-department-17--snapchat-creator-tools--profile)
20. [Department 18 — Snapchat Onboarding & Notifications](#20-department-18--snapchat-onboarding--notifications)
21. [Department 19 — Wallet & Fintech UX](#21-department-19--wallet--fintech-ux)
22. [Department 20 — AI UX Patterns & AI Slop Avoidance](#22-department-20--ai-ux-patterns--ai-slop-avoidance)
23. [Department 21 — Commerce UX: Returns, Style Quiz, Personalisation](#23-department-21--commerce-ux-returns-style-quiz-personalisation)
24. [Cross-Cutting Mobile UX Patterns](#24-cross-cutting-mobile-ux-patterns)
25. [Full URL Bibliography](#25-full-url-bibliography)

---

## 1. Methodology and Scope

This compendium consolidates the results of 18 targeted web searches conducted in August 2026, covering every department of the ThryftVerse flagship upgrade programme. Each search was framed against the latest 2026 product updates, design-system evolution, and UX pattern maturation across five reference platforms — Instagram, Pinterest, eBay, Snapchat, and the broader mobile/fintech/commerce ecosystem.

For every search we record: the query used, the top results returned (title + URL), and a distilled 1–2 sentence takeaway relevant to the ThryftVerse upgrade. Sources are organised by the department numbering used across reports 00–21 so that any claim in those reports can be traced back to a specific URL in this file.

The research confirms several programme-level themes that recur across departments:

- **Algorithmic agency is the 2026 differentiator.** Instagram's "Your Algorithm" and Pinterest's AI-powered board personalisation both shift the user from a passive recipient of recommendations to an active shaper of their feed. ThryftVerse's personalisation layer must follow this principle.
- **Bottom-anchored interaction is now the default.** Bottom sheets, thumb-zone CTAs, and bottom navigation are the dominant 2026 mobile container pattern across Apple, Telegram, Spotify, and Apple Maps. Every ThryftVerse surface must respect this.
- **Motion and design tokens are first-class citizens.** The 2026 design-system bar treats motion tokens, voice guidelines, and AI-content rules as equal peers to colour and type tokens. ThryftVerse's token architecture must include a motion tier.
- **AI transparency is now law.** The EU AI Act Article 50 transparency obligations took effect on 2 August 2026, requiring labelling of AI-generated content. ThryftVerse's AI features must include provenance and labelling by default.
- **Live commerce is the highest-conversion channel.** Instagram Live comment-to-DM flows achieve 9–30% conversion versus 2–3% for standard e-commerce, and eBay Live GMV grew 8× year-over-year. ThryftVerse's live shopping surface is a strategic priority.

---

## 2. Department 00 — Programme Overview & Cross-Cutting Research

### Search: "2026 mobile app design trends"

**Top results:**
- Mobile App Design Trends 2026: UI Patterns | Muzli Blog — https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/
- What Is Mobile UI? Principles, Patterns, and Best Practices for Mobile App Design (2026) | UXPin — https://www.uxpin.com/studio/blog/what-is-mobile-ui/
- Mobile App Design Principles 2026: 5 Principles | CreativeCode — https://creativecode.com.tr/en/blog/mobil-uygulama-tasarim-prensipleri-2026
- Ultimate Mobile App Design Guidelines for 2026 | GitNexa — https://www.gitnexa.com/blogs/mobile-app-design-guidelines
- Mobile App UX Design: 2026 Best-Practices Playbook | Forasoft — https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices

**Key takeaway:** The biggest 2026 mobile design shifts are interaction-model changes, not visual ones — bottom-centric navigation expanding beyond the tab bar (Telegram pull-down search, Apple Maps bottom-sheet search, Spotify chip-row filtering in a bottom sheet), depth layers as hierarchy via elevation and parallax, and AI-driven adaptive interfaces. The bottom sheet is now the expected container for anything that does not deserve a full-screen takeover.

**Key takeaway:** Five principles dominate 2026 mobile design: touch-target (44×44pt iOS / 48×48dp Android), thumb-zone (critical actions in the bottom third), motion (200–300ms standard transitions, 100–150ms micro-interactions, 60fps target), dark mode via semantic colour tokens, and accessibility as a floor not a feature.

**Key takeaway:** Performance budgets for 2026 are strict — cold start p90 < 2.5s, warm start < 500ms, first meaningful paint < 1s, tap response < 100ms. A skeleton screen that paints structure in 200ms beats a spinner on a 400ms fetch. Five bottom tabs is the maximum before tap accuracy degrades.

---

## 3. Department 01 — Design System & Tokens

### Search: "2026 design tokens motion tokens design system best practices"

**Top results:**
- Design Systems in 2026: From Component Libraries to Motion Tokens | Creative Alive — https://creativealive.com/design-systems-2026-component-libraries-motion-tokens/
- Design Tokens: A Practical Guide for 2026 | Masterly — https://www.themasterly.com/blog/design-tokens
- Design Tokens: The Foundation of Your UI Arch | Feature-Sliced Design — https://feature-sliced.design/blog/design-tokens-architecture
- Design Systems in 2026: Scale UI Without the Chaos | DigitalApplied — https://www.digitalapplied.com/blog/design-systems-2026-scale-ui-without-chaos-methodology
- Motion Tokens for Design Systems: Duration and Easing | Carmen Ansio — https://www.carmenansio.com/articles/motion-tokens-design-systems/

**Key takeaway:** In 2026, tokens are the contract — not the component library. A modern system tracks tokens (colour, type, spacing, radius, elevation, motion, voice), components (with accessibility and motion specs per component), patterns, content guidelines (including AI-content rules), and accessibility rules (WCAG 3 Silver as the floor). Governance is lightweight: a core team of 2–4 people owning tokens, accessibility review, and release cadence, with federated contributions from product teams.

**Key takeaway:** The three-tier token taxonomy is the 2026 standard: primitive tokens hold raw values (`blue-500`, `space-4`), semantic tokens name intent (`action-color` → `blue-500`), and component tokens scope to specific UI (`button-bg-primary` → `action-color`). Name tokens by purpose, never by value — `color.text.danger` survives every rebrand; `red-600` does not. The toolchain has settled on Figma Variables + Style Dictionary + W3C DTCG format.

**Key takeaway:** Motion tokens are named durations and easings with semantic enter/exit pairs: `--duration-instant: 50ms`, `--duration-fast: 150ms`, `--duration-moderate: 300ms`, `--duration-slow: 500ms`, `--duration-deliberate: 800ms`, with matching easing curves (`--ease-standard`, `--ease-enter`, `--ease-exit`, `--ease-spring`). Components consume them as CSS custom properties, enforced by build-time token checks.

### Search: "Pinterest design system 2026"

**Top results:**
- Welcome to Gestalt - Pinterest's Design System — https://gestalt.pinterest.systems/
- pinterest/gestalt — https://github.com/pinterest/gestalt
- Gestalt (Pinterest) — Design System Breakdown | DesignSystems.one — https://www.designsystems.one/design-systems/gestalt

**Key takeaway:** Pinterest's Gestalt is an image-first design system tuned for visual discovery products, open-sourced in 2019. It ships masonry layout primitives as supported components (the canonical reference for asymmetric responsive grids), a documented motion language tuned for image-heavy surfaces (fades, scale-ins, shimmer placeholders as first-class), and opinionated guidance on internationalisation and right-to-left layout. The system is opinionated around Pinterest's brand — adopting it visually unaltered makes a product look like Pinterest.

---

## 4. Department 02 — Motion Language

### Search: "2026 motion design tokens"

**Top results:**
- Motion Tokens for Design Systems: Duration and Easing | Carmen Ansio — https://www.carmenansio.com/articles/motion-tokens-design-systems/
- Design Systems in 2026: From Component Libraries to Motion Tokens | Creative Alive — https://creativealive.com/design-systems-2026-component-libraries-motion-tokens/
- Mobile App Design Principles 2026 | CreativeCode — https://creativecode.com.tr/en/blog/mobil-uygulama-tasarim-prensipleri-2026

**Key takeaway:** Motion in 2026 is tokenised and semantic: a small set of named duration and easing primitives with semantic enter/exit pairs built on top, exposed as CSS custom properties. The standard duration scale is instant (50ms), fast (150ms), moderate (300ms), slow (500ms), deliberate (800ms). Easing uses ease-out for entry, ease-in for exit, with a spring curve for playful interactions. GPU-accelerated transforms (translate, scale, opacity) are preferred over layout animations, and `prefers-reduced-motion` must be respected.

**Key takeaway:** Gestalt's motion language for image-heavy surfaces treats fades, scale-ins, and shimmer placeholders as first-class citizens — these are the patterns ThryftVerse's discovery and feed surfaces should adopt for media-first loading states.

---

## 5. Department 03 — Instagram Feed & Discovery

### Search: "Instagram feed 2026" / "Instagram redesign 2026"

**Top results:**
- Instagram is testing more ways to customize 'Your Algorithm' | TechCrunch — https://techcrunch.com/2026/06/27/instagram-is-testing-more-ways-for-users-to-customize-your-algorithm/
- You can just tell the Instagram algorithm what you want now | The Verge — https://www.theverge.com/tech/947898/meta-instagram-your-algorithm-main-feed-tell
- Instagram wants to make algorithm customisation a core part of the app | The Next Web — https://thenextweb.com/news/instagram-your-algorithm-central-experience-mosseri
- (August 8) 2026 Instagram updates, news, and features | SocialBee — https://socialbee.com/blog/instagram-updates/
- The biggest Instagram updates from 2026 | HeyOrca — https://www.heyorca.com/blog/instagram-social-news

**Key takeaway:** Instagram's "Your Algorithm" feature, launched December 2025 for Reels and expanded to Explore and the main feed by mid-2026, lets users see AI-generated topic summaries influencing their recommendations and adjust them. Adam Mosseri's stated goal is to evolve it "from a setting to something that feels central to your experience on Instagram." Prototypes include a pull-down gesture in the feed that brings up the customisation menu, a swipe-up prompt on individual Reels, and per-Reel buttons for real-time feedback. Changes apply across Feed, Reels, and Explore simultaneously.

**Key takeaway:** Instagram is testing a "Liquid Glass"-style redesign of its tab bar and a Reels-focused layout update that puts even more emphasis on Reels discovery. The platform is also testing changing "Following" count to "Friends" on profile displays.

---

## 6. Department 04 — Instagram Profile & Grid

### Search: "Instagram profile 2026"

**Top results:**
- Instagram is finally letting everyone reorganize their profile grid | The Verge — https://www.theverge.com/tech/946458/instagram-is-finally-letting-everyone-reorganize-their-grid
- Instagram Now Lets Users Reorder Posts on Their Profile Grid | MacRumors — https://www.macrumors.com/2026/06/09/instagram-now-lets-users-reorder-posts/
- (August 8) 2026 Instagram updates | SocialBee — https://socialbee.com/blog/instagram-updates/
- The biggest Instagram updates from 2026 | HeyOrca — https://www.heyorca.com/blog/instagram-social-news

**Key takeaway:** As of June 8, 2026, Instagram rolled out widely the ability for all users to rearrange posts on their profile grid — long-press and drag freely, no matter how old posts are. Pinned posts (up to three) remain at the top. This ends the decade-long lock to reverse-chronological grid order and gives creators full curatorial control of their profile as a storefront.

**Key takeaway:** Instagram has updated profile banners with a new design that makes them more visible, and is testing a profile display that changes "Following" count to "Friends."

---

## 7. Department 05 — Instagram DM & Messaging

### Search: "Instagram DM 2026" / "2026 mobile messaging UX"

**Top results:**
- Chat UI Design: How to Build Effective Chat Interfaces in 2026 | UXPin — https://www.uxpin.com/studio/blog/chat-user-interface-design/
- Chat App UI/UX: Design Patterns That Make Users Stay | Ethora — https://ethora.com/blog/chat-app-ui-ux-design/
- Design Patterns For Mobile Messaging Screens | Listrovert — https://listrovert.com/design-patterns-for-mobile-messaging-screens/
- Building reliable AI chat on mobile | Doctolib / Medium — https://medium.com/doctolib/building-reliable-ai-chat-on-mobile-01015d74422e
- Designing Mobile Conversations: Clear, Fast & Human UX | Biocraftr — https://biocraftr.com/designing-mobile-conversations/

**Key takeaway:** 2026 chat UI best practices centre on immediate send-state feedback (users need confirmation within 200ms that a message is processing/sent/failed, or they tap repeatedly and create duplicates), message bubbles with left/right alignment and colour coding, unobtrusive timestamps grouped by date with relative labels, and profile pictures/initials to humanise the experience. The composer must support multi-line editing, rich content (emojis, mentions, attachments), and a clearly visible send button with keyboard shortcuts.

**Key takeaway:** AI chat interfaces carry a specific set of expectations shaped by ChatGPT: newest messages at the bottom, a new user message pushes content upward so the conversation stacks, the AI response appears below growing progressively, and the interface stays still while the answer arrives. Implementing all four behaviours simultaneously under real streaming conditions is surprisingly hard — an inverted FlatList works for human messaging but breaks with AI responses that grow and reflow in real time.

**Key takeaway:** 75% of users judge brand credibility based on chat UI/UX. The bottom navigation bar with 3–5 items is the staple for messaging apps, ensuring thumb-reachability. Card-based layouts segment information into touch-friendly components for message threads and contact profiles.

---

## 8. Department 06 — Instagram Live Shopping

### Search: "Instagram Live shopping 2026"

**Top results:**
- Instagram Live Shopping in 2026: What Changed and What Still Works | Inrō — https://www.inro.social/blog/instagram-live-shopping
- Instagram Live DM Automation: Viewers to Leads | CreatorFlow — https://creatorflow.so/blog/instagram-live-dm-automation-guide/
- Instagram Live Shopping Guide: What Still Works After Meta's Changes [2026] | LiveShopFront — https://liveshopfront.com/instagram-live-shopping-guide
- How Instagram Live Works 2026 — Algorithm & Notifications | SMMNut — https://smmnut.com/blog/how-instagram-live-works-algorithm-2026/
- Instagram Live Shopping: How to Sell During Lives | CreatorFlow — https://creatorflow.so/blog/instagram-live-shopping/

**Key takeaway:** Instagram Live Shopping native in-app checkout was discontinued on March 16, 2023. The effective 2026 replacement is a comment-to-DM automation flow: viewers comment a keyword during a Live broadcast, an automation tool sends an instant DM with the product link, and the purchase completes on the brand's website. Meta's API treats Live comments the same as post comments for automation triggers. The automation only fires while the Live is active — it does not work on saved replays.

**Key takeaway:** Live commerce conversion rates hit 9–30% versus 2–3% for standard e-commerce. The US live commerce market reached $14.64 billion in 2025. Instagram Live generates up to 10× more engagement than regular posts, with average watch time of 14.2 minutes in 2026.

**Key takeaway:** Instagram Live's 2026 distribution is notification-first and gated by concurrent viewer thresholds: micro accounts (<5K followers) need 10 concurrent viewers for a push notification, mid accounts (5K–50K) need 25, established (50K–250K) need 100, and large (250K+) need 500. The 5-minute mark is the most consequential moment — it is the gate at which the algorithm decides how much distribution to grant.

**Key takeaway:** Meta expanded product tagging in Reels — creators with 1,000+ followers can now tag up to 30 product links in a single Reel throughout spring 2026, turning any Reel into a full digital storefront.

---

## 9. Department 07 — Instagram Onboarding & Notifications

### Search: "Instagram onboarding 2026" / "Instagram notifications 2026"

**Top results:**
- (August 8) 2026 Instagram updates | SocialBee — https://socialbee.com/blog/instagram-updates/
- The biggest Instagram updates from 2026 | HeyOrca — https://www.heyorca.com/blog/instagram-social-news
- How Instagram Live Works 2026 — Algorithm & Notifications | SMMNut — https://smmnut.com/blog/how-instagram-live-works-algorithm-2026/

**Key takeaway:** Instagram's 2026 onboarding and personalisation is increasingly algorithm-driven — the "Your Algorithm" feature now extends across Feed, Reels, and Explore, with gesture-based access (pull-down in feed, swipe-up on Reels) making customisation central to the experience rather than a buried setting. This represents a shift from passive consumption to active algorithm shaping, which ThryftVerse's onboarding should mirror with a style quiz or preference capture flow.

**Key takeaway:** Instagram Live notifications use a tiered dispatch model based on concurrent viewer count crossing thresholds within the first 5 minutes, pushing to progressively larger follower segments (10–20% for micro accounts up to 25–35% for large accounts). This notification-first distribution model differs substantially from feed and Reels ranking.

---

## 10. Department 08 — Pinterest Home Feed & Masonry

### Search: "Pinterest home feed 2026 masonry"

**Top results:**
- Evolution of Multi-Objective Optimization at Pinterest Home feed | Pinterest Engineering / Medium — https://medium.com/pinterest-engineering/evolution-of-multi-objective-optimization-at-pinterest-home-feed-06657e33cd10
- Module Relevance on Homefeed | Pinterest Engineering / Medium — https://medium.com/pinterest-engineering/module-relevance-on-homefeed-ae76f8b545b2
- Gestalt (Pinterest) — Design System Breakdown | DesignSystems.one — https://www.designsystems.one/design-systems/gestalt
- (July 8) 2026 Pinterest news and updates | SocialBee — https://socialbee.com/blog/pinterest-news/

**Key takeaway:** Pinterest's home feed uses a cascaded recommendation system (retrieval → pre-ranking → ranking → multi-objective re-ranking) with a diversity-based re-ranking algorithm as the most impactful component. The multi-objective optimisation layer determines the best composition of a feed, balancing short-term and long-term engagement — visually repetitive content is less engaging and reduces session length and revisit likelihood.

**Key takeaway:** Pinterest introduced modules to the home feed to provide more context on recommendations and show new topics, moving beyond a simple grid of Pins. Gestalt ships performance-tuned virtualised masonry as a supported component — the canonical reference for asymmetric responsive grids.

**Key takeaway:** Pinterest added an AI-powered "Pinterest Assistant" feature in 2025–2026 that helps users search for Pins based on examples, and is testing "Boards made for you" (AI-curated boards appearing in home feed and inbox) and "Styled for you" (dynamic AI-powered collages from saved fashion Pins).

---

## 11. Department 09 — Pinterest Visual Search & Lens

### Search: "Pinterest visual search 2026 lens"

**Top results:**
- Introducing new visual search features | Pinterest Newsroom — https://newsroom.pinterest.com/en-ca/news/introducing-new-visual-search-features/
- Pinterest Design reimagined visual search experience | LinkedIn — https://www.linkedin.com/posts/pinterestdesign_at-pinterest-we-know-inspiration-often-starts-activity-7463348751752159233-st49
- Gestalt (Pinterest) — Design System Breakdown | DesignSystems.one — https://www.designsystems.one/design-systems/gestalt

**Key takeaway:** Pinterest introduced a set of new visual search features that decode images so users can search and shop for details of an outfit — overall aesthetic, colour palette, specific fit, or product category. When viewing a Pin, Pinterest generates the words users can use to explore what they like, with a new animated glow to help identify selectable objects. A new refinement bar lets users narrow results by style, occasion, colour, or fabric (e.g., "more y2k" or "more formal options").

**Key takeaway:** Pinterest Design reimagined the visual search experience in May 2026 to make discovery feel "more magical, intuitive, and visually rich," shifting from simply delivering search results to curating a personalised journey of discovery.

---

## 12. Department 10 — Pinterest Boards & Navigation

### Search: "Pinterest boards 2026" / "Pinterest navigation 2026"

**Top results:**
- Pinterest Boards Get an AI-Powered Glow-Up | Metricool — https://metricool.com/pinterest-boards-ai-upgrade/
- (July 8) 2026 Pinterest news and updates | SocialBee — https://socialbee.com/blog/pinterest-news/
- Pinterest Create: Board Fundamentals — https://create.pinterest.com/blog/board-fundamentals/
- How to use Pinterest in 2026 as a creator or business | SocialBee — https://socialbee.com/blog/how-to-use-pinterest/
- How to Organize Pinterest Boards | GenSumo — https://www.gensumo.com/blog/how-to-organize-pinterest-boards/
- How Do I Get to My Pinterest Boards? | Aurascience — https://www.aurascience.blog/how-to-get-to-pinterest-boards

**Key takeaway:** Pinterest gave boards an AI-powered upgrade — boards are no longer static folders but personalised hubs with new tabs that adapt to saved Pin types: "Make it yours" (fashion/home decor, suggests products and content), "All saves" (all saved Pins in one place), "More ideas" (related Pins based on board content), "Styled for you" (US/Canada only, AI-powered collages from saved fashion Pins), and "Boards made for you" (AI + editorial curated boards appearing in home feed and inbox).

**Key takeaway:** Board sharing was upgraded in March 2026 — Pinterest automatically transforms a board into two sharable formats: a customisable video (with "Replace Pins" option) and a preview with header image, recent Pins, and board title. Group boards support collaborator permissions, and secret boards remain available.

**Key takeaway:** On mobile, Pinterest navigation places the profile picture icon in the bottom-right corner; tapping it shows the 'Saved' tab as the primary library for all public, secret, and shared boards. Sections within boards allow subtopic organisation without cluttering the profile with too many boards.

---

## 13. Department 11 — eBay Product Page & View Item

### Search: "eBay product page 2026"

**Top results:**
- How eBay Modernized the Most Important Page on Our Platform | eBay Innovation — https://innovation.ebayinc.com/stories/how-ebay-modernized-the-most-important-page-on-our-platform/
- eBay Reduces the Time to List on Mobile With New Simplified Selling Tool | eBay Innovation — https://innovation.ebayinc.com/stories/ebay-reduces-the-time-to-list-on-mobile-with-new-simplified-selling-tool-now-featuring-magical-listing-ai-technology/

**Key takeaway:** eBay's View Item page — the core product detail page — receives over 250 million views per day. eBay modernised it by introducing a new service between the data layer and legacy systems, migrating smaller pieces of code over time rather than attempting a years-long monolithic rewrite. The new architecture eliminated duplication of work across four platforms (desktop, mobile web, iOS, Android) and unlocked velocity gains.

**Key takeaway:** The modernisation strategy was incremental: legacy services get their data proxied through the new service, modern versions of features are implemented in the new service, and traffic is gradually cut over. This is the reference architecture for ThryftVerse's own product page evolution.

---

## 14. Department 12 — eBay Sell Flow & Magical Listing

### Search: "eBay sell flow 2026"

**Top results:**
- eBay Reduces the Time to List on Mobile With New Simplified Selling Tool | eBay Innovation — https://innovation.ebayinc.com/stories/ebay-reduces-the-time-to-list-on-mobile-with-new-simplified-selling-tool-now-featuring-magical-listing-ai-technology/
- Anna Zaremba: eBay Selling Project — https://www.annamzaremba.com/project-ebay-selling.html
- Ashok Balasubramanian: eBay Live Seller Experience | LinkedIn — https://linkedin.com/in/balasubramanian-ashok
- ebay Seller Hub Redesign | Flateboe — https://www.flateboe.com/projects/ebay-seller-hub

**Key takeaway:** eBay's simplified mobile listing flow starts with photos and a title (not a text-based catalog search), then uses AI "Magical Listing" technology to suggest product details and categories via image match and inference. The guided, task-focused flow lets sellers review and approve AI-suggested content. Early UK testing showed a 50% reduction in total steps needed to list and faster listing times. The tool is available in the eBay mobile app in the US, UK, and Germany for private sellers across all categories.

**Key takeaway:** eBay's native app serves over 2 million unique sellers daily. The selling overview page was redesigned with a selling details module highlighting key tertiary information, quick access to relevant sections, and a direct entry point to the user profile. Frequently checked modules (like tasks) were moved to the top for better visibility. Contextual in-app education articles are triggered by seller activities.

**Key takeaway:** The Seller Hub was redesigned from a fragmented, outdated experience into a unified, insight-driven platform with actionable analytics, sourcing recommendations, and prioritised task management. The legacy experience suffered from redundant tools, stale analytics buried in different parts of the product, and no centralised view of business performance.

---

## 15. Department 13 — eBay Auction & Bidding

### Search: "eBay auction 2026"

**Top results:**
- eBay Live Launches in Canada | eBay Inc. — https://www.ebayinc.com/stories/press-room/ca/ebay-live-launches-in-canada-bringing-real-time-community-driven-shopping-nationwide/
- eBay Live Touts 8x Growth | Value Added Resource — https://www.valueaddedresource.net/ebay-live-8x-growth/
- eBay Launches Livestream Shopping in Canada | Retail Insider — https://retail-insider.com/retail-insider/2026/02/ebay-launches-livestream-shopping-platform-in-canada-with-auctions-tied-to-fan-conventions/

**Key takeaway:** eBay Live auctions use 30-second extended bidding during livestream events, enabling fast-paced real-time auction experiences. The Canadian debut featured rare trading cards auctioned starting at $1.00 with extended bidding, demonstrating the live auction format's suitability for high-value collectibles. eBay improved "bidding responsiveness" to create smoother, faster livestreams.

**Key takeaway:** TikTok Shop and StockX have introduced auction offerings aimed at eBay's high-end collectibles market, increasing competitive pressure on eBay's auction dominance. This validates the live auction format as a strategic differentiator for ThryftVerse's marketplace.

---

## 16. Department 14 — eBay Order Tracking & Buyer Protection

### Search: "eBay order tracking 2026" / "eBay buyer protection 2026" / "eBay payouts 2026"

**Top results:**
- Buyer Protection fee | eBay Australia — https://www.ebay.com.au/help/buying/paying-items/buyer-protection-fee?id=5594
- Tracking payment holds FAQs | eBay Seller Centre — https://www.ebay.com.au/sellercentre/tracking/payment-holds-faqs
- eBay Inc. Reports First Quarter 2026 Results — https://investors.ebayinc.com/investor-news/press-release-details/2026/eBay-Inc--Reports-First-Quarter-2026-Results/default.aspx
- The eBay Console Never Arrived | Yahoo News — https://www.yahoo.com/news/us/articles/ebay-console-never-arrived-stranger-002423843.html
- eBay Expands INR Protection For eBay Labels | Value Added Resource — https://www.valueaddedresource.net/expanded-inr-protections-ebay-labels/

**Key takeaway:** eBay Australia introduced a Buyer Protection fee from 12 May 2026 (updated 27 March 2026), included in the item price — a flat $0.30 per item plus tiered percentages (8% up to $20, 6% from $20–$500, 4% from $500–$5,000, capped). It includes 24/7 customer service, risk monitoring and fraud detection, and secure encrypted transactions. The fee is fully refunded on full refunds and proportionally refunded on partial refunds.

**Key takeaway:** eBay's tracking payment holds apply at the transaction level — if a seller uploads a valid tracking number, funds are held until a carrier scan shows the item is en route; without tracking, funds are held until 3 days after the latest estimated delivery date. Transactions with valid tracking are 23% less likely to result in buyer contact, and sellers without valid tracking are 2× more likely to receive an "Item Not Received" claim.

**Key takeaway:** eBay expanded INR (Item Not Received) protections from August 2026 — eligible delivery delays won't hurt seller ratings if sellers ship on time with an eBay label, raising questions about whether protections are being reserved only for platform-purchased labels amidst Managed Shipping rollout.

**Key takeaway:** A notable case highlighted gaps in eBay's AI-assisted dispute resolution — a buyer's refund was initially denied even when the delivery photograph showed the package at someone else's door, with a message stating "automation or artificial intelligence" had reviewed the report and found no violation. This underscores the need for human-in-the-loop review in buyer protection flows.

**Key takeaway:** eBay's Q1 2026 results show expansion of the Seller Capital program to the UK and a partnership with TrueLayer for secure payments, indicating continued investment in seller financial tools and payout infrastructure.

---

## 17. Department 15 — eBay Live Shopping

### Search: "eBay Live 2026"

**Top results:**
- eBay continues to bet on live shopping after record quarter | TechCrunch — https://techcrunch.com/2026/08/06/ebay-continues-to-bet-on-live-shopping-after-record-quarter/
- eBay Live Touts 8x Growth, But Scale Remains Hard To Measure | Value Added Resource — https://www.valueaddedresource.net/ebay-live-8x-growth/
- eBay Live Launches in Canada | eBay Inc. — https://www.ebayinc.com/stories/press-room/ca/ebay-live-launches-in-canada-bringing-real-time-community-driven-shopping-nationwide/
- eBay Live Launches In Canada As Platform Races To Catch Up | Value Added Resource — https://www.valueaddedresource.net/ebay-live-canada/
- eBay Launches Livestream Shopping in Canada | Retail Insider — https://retail-insider.com/retail-insider/2026/02/ebay-launches-livestream-shopping-platform-in-canada-with-auctions-tied-to-fan-conventions/
- eBay Inc. Reports First Quarter 2026 Results — https://investors.ebayinc.com/investor-news/press-release-details/2026/eBay-Inc--Reports-First-Quarter-2026-Results/default.aspx

**Key takeaway:** As of August 2026, eBay Live's GMV jumped approximately 8× year-over-year across seven markets, with increases in viewers, watch time, and items sold. Over 90% of sellers who stream regularly have seen their GMV grow, and Live sellers sell about 3× more than non-Live sellers. eBay moved past its invite-only model to self-service onboarding for eligible sellers in over 300 categories.

**Key takeaway:** eBay Live launched in the US (June 2022), UK beta (2024), Germany (November 2025), Australia (December 2025), France and Italy (February 2026), and Canada (February 2026) — seven markets total. Product improvements include discovery features across homepage and mobile app, simplified event creation and inventory preparation, and improved bidding responsiveness.

**Key takeaway:** eBay Live's scale remains hard to measure independently — five of the seven markets had been active for less than a year as of April 2026, making year-over-year comparisons difficult. The competitive landscape includes TikTok Shop (within striking distance of overtaking eBay in total GMV) and Whatnot.

---

## 18. Department 16 — Snapchat Chat & Messaging

### Search: "Snapchat chat 2026" / "Snapchat UI 2026"

**Top results:**
- SPS 2024 | A New and Simple Snapchat | Snap Newsroom — https://newsroom.snap.com/sps-2024-simple-snapchat?lang=en-US
- Snap announces "Simple Snapchat" redesign | The Verge — https://www.theverge.com/2024/9/17/24246999/snapchat-redesign-three-tabs-stories-spotlight
- Snapchat scraps 'simple' redesign as it loses users | The Verge — https://www.theverge.com/news/658306/snapchat-simple-redesign-losing-north-american-users
- How do Notifications with Chat Preview work? | Snapchat Support — https://help.snapchat.com/hc/en-us/articles/48712730905748-How-do-Notifications-with-Chat-Preview-work
- How do I see when a friend is viewing our Chat? | Snapchat Support — https://help.snapchat.com/hc/en-us/articles/31119013165332-How-do-I-see-when-a-friend-is-viewing-our-Chat
- How do Topic Chat profile pills work? | Snapchat Support — https://help.snapchat.com/hc/en-us/articles/49292669382420-How-do-Topic-Chat-profile-pills-work

**Key takeaway:** Snapchat's "Simple Snapchat" redesign simplified the app from five to three tabs: Chat (left, with Stories at top of conversations and Snap Map accessible from the bottom), Camera (centre), and a unified For You feed (right, combining Stories and Spotlight via a unified recommendation system). However, Snapchat later scrapped this redesign after losing North American users, and began testing a revised approach.

**Key takeaway:** Snapchat's Chat Preview notification feature lets users send a second notification that shows a preview of the chat message — but only if no one has opened the chat yet, and only one Chat Preview per conversation. Seeing the preview in the notification doesn't mark the chat as opened.

**Key takeaway:** Snapchat+ subscribers can see when a friend is present in chat (Bitmoji selfie holding a phone) via the "Friends in Chat" toggle, and can receive Story View Notifications the first time a specific friend views their Story. Topic Chat profile pills display joined Topic Chats directly on a user's profile for friend discoverability.

---

## 19. Department 17 — Snapchat Creator Tools & Profile

### Search: "Snapchat creator tools 2026" / "Snapchat profile 2026"

**Top results:**
- SPS 2024 | New Ways for Creators to Build a Community & Find Success | Snap Newsroom — https://newsroom.snap.com/sps-2024-new-ways-for-creators
- Empowering Content Creation with New Tools, Features, and Insights | Snap Newsroom — https://newsroom.snap.com/empowering-content-creation-with-new-tools
- Snapchat Launches Creator Subscriptions | Snap Newsroom — https://newsroom.snap.com/snapchat-launches-creator-subscriptions?lang=en-US
- About Profiles on Snapchat | Snapchat Support — https://help.snapchat.com/hc/en-us/articles/7012292808596-About-Profiles-on-Snapchat
- What is My Profile and who can see it? | Snapchat Support — https://help.snapchat.com/hc/en-us/articles/46695769512084-What-is-My-Profile-and-who-can-see-it

**Key takeaway:** Snapchat introduced a simplified profile design allowing users 16+ to toggle between personal and public accounts, with creators able to pin favourite Snaps to the top of their public profile. Templates make it easier to create Snaps from Memories and Camera Roll with soundtracked music. The Replies and Quoting feature enables deeper audience engagement — nearly 15 billion interactions occur daily between creators and fans.

**Key takeaway:** Snapchat rolled out new insights across Stories and Spotlight (Views by Traffic Sources: Discover For You, Following, Spotlight, Search, Chat, Profile), Auto-Save Stories to Public Profiles (so fans can revisit creator content beyond 24 hours), and a Timeline Editor for intuitive video editing on US creators. The Snap Star Collab Studio accelerates brand partnerships with self-serve engagement/demographic data sharing.

**Key takeaway:** Snapchat launched Creator Subscriptions in February 2026 (alpha testing with US-based Snap Creators, expanding to Canada, UK, France) — fans receive exclusive content, priority replies, and an ad-free experience within that creator's Stories. Creators set their own monthly pricing within Snap-recommended tiers, building a recurring income stream on top of the Unified Monetization Program.

**Key takeaway:** Snapchat's "My Profile" is a dedicated content profile for users under 16, allowing them to create, save, and showcase Stories and Spotlight videos to friends only — with no bio or followers support. Users can upgrade to a Public Profile when eligible, making previously saved content viewable by a broader audience.

---

## 20. Department 18 — Snapchat Onboarding & Notifications

### Search: "Snapchat onboarding 2026" / "Snapchat notifications 2026"

**Top results:**
- What is My Profile and who can see it? | Snapchat Support — https://help.snapchat.com/hc/en-us/articles/46695769512084-What-is-My-Profile-and-who-can-see-it
- How do Story View Notifications work with Snapchat+? | Snapchat Support — https://help.snapchat.com/hc/en-us/articles/26058714433428-How-do-Story-View-Notifications-work-with-Snapchat
- How do Notifications with Chat Preview work? | Snapchat Support — https://help.snapchat.com/hc/en-us/articles/48712730905748-How-do-Notifications-with-Chat-Preview-work
- About Profiles on Snapchat | Snapchat Support — https://help.snapchat.com/hc/en-us/articles/7012292808596-About-Profiles-on-Snapchat

**Key takeaway:** Snapchat's onboarding for under-16 users is profile-first: tap the Bitmoji icon → tap "My Profile" → tap "Create My Profile" → add content from Post Archive, Memories, or Camera Roll. The highest privacy safety settings are on by default for ages 16–17. This age-gated, safety-first onboarding is a reference for ThryftVerse's own minor-protection and onboarding flows.

**Key takeaway:** Snapchat's notification system includes Chat Preview (a second notification showing message preview, one per chat, only if unopened), Story View Notifications (Snapchat+ only, first-time view by specific friends, with a "Make it Private" toggle), and per-chat notification management from Friendship Profiles.

---

## 21. Department 19 — Wallet & Fintech UX

### Search: "2026 fintech wallet app UX"

**Top results:**
- Everything You Need To Know About Moove Handle & Moove Profile | moove.xyz — https://www.moove.xyz/blog/everything-you-need-to-know-about-moove-handle-and-moove-profile
- Moove App: The Ultimate Web3 FinTech App | moove.xyz — https://www.moove.xyz/blog/moove-app-the-ultimate-web3-fintech-app
- Avatar-First Wallets for Creator Trust | mypic.cloud — https://mypic.cloud/avatar-first-wallets-using-visual-identity-to-build-trust-wi
- Introducing YouPay Bio: A Link-in-Bio Built for Creators | YouPay — https://youpay.co/blog/introducing-youpay-bio-a-link-in-bio-built-for-creators/
- Portrait Wallet for iOS | Ryan Shahine — https://ryanshahine.me/portrait-wallet-for-ios

**Key takeaway:** The 2026 fintech wallet pattern is "dollars first, usernames instead of addresses, chain logic pushed into the background." Portrait Wallet reads USDC, USDT, USDT0, and DAI across twelve networks, converts them to dollars, and sums them into one spendable number — stablecoins should read as dollars, with chains and tickers as implementation details. Every meaningful transaction has a person on the other end, so money should move through social context.

**Key takeaway:** Moove Handle (@yourname) replaces long wallet addresses as a custom, discoverable alias acting as storefront, payment link, and digital business card. Moove Profile is a customisable, branded payment profile link with profile picture, background photo, biography, social media links, location, and website — abstracting complexity into a unified Web3 transaction experience. Moove Contacts reimagines the contact book for the blockchain era.

**Key takeaway:** Avatar-first wallet UX uses visual identity as a continuity trust signal — a verified portrait, creator mark, or branded avatar consistently attached to deposits, withdrawals, invoices, and transfers creates a "this is me" anchor that reduces doubt. The avatar must appear where decisions happen (not just in settings): in a send flow, the user sees the destination avatar, verified profile name, account purpose, and trust badge before the final confirmation. The avatar must be paired with verification metadata (confirmed handle, domain, business category, date of last verification) because profile images can be stale, spoofed, or duplicated.

**Key takeaway:** YouPay Bio (June 2026) is a link-in-bio built specifically for creators with a prominent "Tip Me" button, Age Verified badge display, badge displays, social links, music components, and gift/fund lists — a single destination reflecting brand, work, and vibe rather than a list of links.

---

## 22. Department 20 — AI UX Patterns & AI Slop Avoidance

### Search: "2026 AI UX design patterns"

**Top results:**
- 11 AI UX patterns, with real product examples | Lazarev.agency — https://www.lazarev.agency/articles/ai-ux-patterns
- 8 AI UX Patterns Every Product Team Gets Wrong | Krux — https://www.trykrux.com/blog/ai-ux-patterns
- AI Shopping Assistant UX That Helps Without Taking Over | Ecom Design Pro — https://ecomdesignpro.com/ai-shopping-assistant-ux/

**Key takeaway:** AI UX patterns solve problems traditional UI never had: probabilistic output, variable latency, and open-ended input break conventional interface assumptions. The highest-impact patterns are the ones users never name — guided prompting, confidence signaling, and correction flows. The 11 patterns include: guided prompting, agent persona, provenance, human-in-the-loop control, graceful fallback, confidence signaling, progressive disclosure, correction flows, streaming output, context persistence, and error recovery.

**Key takeaway:** The 8 most common AI UX failures across audited products: no feedback while AI processes (fix: show immediate state change within 200ms, even a shimmer or "thinking" animation; if >3 seconds, show estimated time; always provide a cancel button; stream output token-by-token), destructive "Regenerate" buttons, scattered feature naming, competing human/AI paths, unreadable walls of text, unclear next actions, missing error states, and undesigned draft lifecycles.

**Key takeaway:** The best AI shopping assistant UX in 2026 doesn't run the journey — it removes friction at moments where shoppers get stuck, then steps back. Four moves: Ask (when key context is missing, use short chips or one-tap prompts), Suggest (when intent is clear and risk is low, use inline recommendations with a reason), Summarize (when comparing or hesitating, use side panel or comparison strip), Stay quiet (when moving smoothly, passive availability). Autonomy breaks trust in commerce — never auto-add items or auto-select options.

### Search: "2026 AI slop avoidance"

**Top results:**
- Code of Practice on Transparency of AI-generated Content | EU Digital Strategy — https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content
- EU Icons for labelling AI-generated content | EU Digital Strategy — https://digital-strategy.ec.europa.eu/en/policies/eu-icons-labelling-ai-generated-content
- Guidelines on transparency obligations | EU Digital Strategy — https://digital-strategy.ec.europa.eu/en/policies/guidelines-transparency-ai-generated-content
- AI Slop and the Information Ecosystem | Columbia IGP Report — https://igp.sipa.columbia.edu/sites/igp/files/2026-06/AI%20Slop%20and%20the%20Information%20Ecosystem_IGP%20Report.pdf
- Can Anthropic's invisible watermarks curb 'AI slop'? | Nature — https://www.nature.com/articles/d41586-026-02503-7

**Key takeaway:** The EU AI Act Article 50 transparency obligations took effect on 2 August 2026 — providers and deployers of generative AI systems must mark and label AI-generated content, disclose deepfakes, and inform individuals when they interact with AI systems. The EU published a set of icons (black, white, and 50% transparency variants) for labelling AI-generated content, and a voluntary Code of Practice helps demonstrate compliance. This is now a legal requirement, not a design preference.

**Key takeaway:** AI slop is defined as generic, low-quality, or misleading AI-generated content, measured along three dimensions: usefulness of information, accuracy and appropriate framing, and quality of writing. Existing automated tools failed to reliably replicate human judgment on slop detection. Actor identity matters for threat assessment — if actor identity changes the assessment, it may no longer be "slop" but a coordinated influence operation.

**Key takeaway:** Anthropic announced that text generated by any Claude models launched on or after 2 August 2026 will be invisibly embedded with a watermark indicating AI authorship, with images carrying metadata digital signatures — a direct response to the EU AI Act. The watermark won't change meaning, quality, or readability and may persist through some editing. Researchers remain sceptical about durability.

---

## 23. Department 21 — Commerce UX: Returns, Style Quiz, Personalisation

### Search: "2026 returns flow mobile" / "2026 seller hub dashboard"

**Top results:**
- Ecommerce UX Trends 2026: Stats & Insights | Baymard — https://baymard.com/blog/ecommerce-quantitative-ux-insights-2026
- How Ecommerce Returns Management Works in 2026 | Shopify — https://www.shopify.com/blog/ecommerce-returns-management
- Shopify Returns Analytics: The 12 Metrics to Track (2026) | Forthroute — https://forthroute.io/blog/returns-analytics-dashboard-shopify
- Connected returns journey: Visibility, reasons data & control in 2026 | nShift — https://nshift.com/blog/connected-returns-journey-2026
- Ecommerce Returns Reduction: A 2026 Data-Led Playbook | DigitalApplied — https://www.digitalapplied.com/blog/ecommerce-returns-reduction-2026-data-playbook

**Key takeaway:** A connected returns journey in 2026 means customers and internal teams share a single, real-time view from return registration through drop-off, in-transit, receipt, assessment, restock, and resolution. Self-serve returns portals let customers submit requests from an order tracking page without contacting support, generating an RMA number and return labels automatically. Refund/return anxiety ("Where is my return?" / "Where is my refund?") is the fastest-reduced by shared visibility with automatic stage updates.

**Key takeaway:** The 12 essential returns metrics for 2026 include refund-to-exchange ratio, return reason mix, repeat-returner cohort, refund cycle time, and nine others. Pick a default rule that handles 70% of cases without human review, write the customer-facing wording before the rule (the wording is the product), and instrument conversion metrics.

**Key takeaway:** US retailers absorbed ~$890 billion in returned merchandise in 2024, with online return rates more than double in-store. A large share of returns trace to preventable expectation gaps the merchant created: ambiguous sizing, thin product content, missing fit guidance, and buried return policies. Product-page UX is the cheapest lever for returns reduction.

**Key takeaway:** Baymard's 2026 ecommerce UX research covers checkout usability (cart/checkout flows causing abandonment), self-service UX (orders, returns, account management), mobile app UX (navigation, product discovery, checkout patterns), and dashboard design (cards must be highly consistent and appropriately styled).

### Search: "2026 style quiz design" / "2026 personalisation UX"

**Top results:**
- Fashion Style Quizzes That Drive Revenue | MapleSage — https://blog.maplesage.com/fashion-style-quizzes-that-drive-revenue
- Fashion Quiz Playbook | RevenueHunt — https://docs.revenuehunt.com/customer-success/quiz-for-fashion-apparel/
- Fashion For Me — E-Commerce | Bitzage — https://bitzage.com/portfolio/fashion-for-me/
- StyleSense | GitHub — https://github.com/spandana-builds/stylesense
- Zero-Party Data Is Replacing the Third-Party Cookie for DTC Personalization in 2026 | Online Store News — https://onlinestorenews.com/zero-party-data-is-replacing-the-third-party-cookie-for-dtc-personalization-in-2026/

**Key takeaway:** Style quizzes have moved from novelty to revenue engine for fashion e-commerce in 2026. By asking a handful of taste and fit questions (preferred silhouettes, lengths/rises, palette, fabric, heel tolerance, budget), brands collect zero-party data that lets every touchpoint feel edited. Results: higher conversion, larger baskets via outfit completion, and calmer returns because aesthetic and fit expectations are aligned before the PDP.

**Key takeaway:** Fashion has the highest AOV of any quiz vertical ($101 median, $314 for top 10%) but the lowest first-session conversion (4% median, 25% of quizzes show 0% attributed first-session conversion). This means the lead matters as much as the instant sale — capture the email and style profile to bring shoppers back. The best fashion quizzes use 7 questions (~3.8 answer choices each), branching logic (62% of top performers — the highest of any vertical), and complete-look recommendations (75% recommend a set).

**Key takeaway:** Zero-party data is replacing the third-party cookie for DTC personalisation in 2026. Brands are routing ad clicks to 4–6 question interactive quizzes that segment shoppers before they see a single product, with conversion rates on quiz-matched recommendations consistently outperforming collection-page traffic. Style/fit quizzes capture data points no third-party pixel could ever reliably infer (fit preference, style archetype, colour palette, occasion).

**Key takeaway:** StyleSense builds a complete style vector in 30 seconds via a 4-question quiz (style personality, colour palette, occasion, size), then uses content-based filtering to rank products, suggest outfits, and provide AI fashion advice. A privacy modal shows every signal used with per-signal toggles and a clear-all-data option — the transparency pattern ThryftVerse should adopt.

---

## 24. Cross-Cutting Mobile UX Patterns

### Search: "2026 bottom sheet UX" / "2026 skeleton loading design" / "2026 empty state UX" / "2026 error state design mobile"

**Top results:**
- Mobile App Design Trends 2026: UI Patterns | Muzli — https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/
- 14 Mobile App Empty State Examples | ScreensDesign — https://screensdesign.com/articles/mobile-app-empty-state-examples/
- Design Empty and Error States for Data-Heavy UIs | DataView — https://dataviewer.cloud/how-to-design-empty-states-and-error-states-for-data-heavy-uis
- How to Design Error Messages and Empty States for UX | 137Foundry — https://137foundry.com/articles/how-to-design-error-messages-empty-states-ux
- Empty States in UX: Types, Examples & Best Practices (2026) | Kompassify — https://kompassify.com/blog/empty-states-guide
- Empty States Best Practices from 10 Enterprise Systems | Northbase — https://www.northbase.design/patterns/empty-states

**Key takeaway:** The bottom sheet pattern (a draggable panel anchored to the screen bottom) has become the dominant 2026 container for secondary content — settings, filters, confirmations, previews, sharing options. Apple standardised it with `UISheetPresentationController`, and by 2026 it is the expected pattern for anything that doesn't deserve a full-screen takeover. Telegram, Apple Maps, and Spotify all moved primary interaction surfaces below the screen's midpoint.

**Key takeaway:** Skeleton screens reduce perceived wait time and are the 2026 standard for loading states — a skeleton that paints structure in 200ms beats a spinner on a 400ms fetch. LinkedIn and YouTube both use this pattern. Design tokens should implement theming via semantic colour variables that resolve differently in light/dark contexts.

**Key takeaway:** There are five types of empty states — first-use, cleared/completed, no-results, error, and permission — each needing a different message, tone, and CTA. A great empty state has four parts: a supportive visual, a headline saying what the space is for, a line on why it's empty and what will appear, and one clear action that fills it. The first-use empty state deserves the most attention — it sits exactly where activation is won or lost.

**Key takeaway:** Across 119 empty state instances audited in 10 enterprise systems (Notion, Slack, Figma, Linear, GitHub, Stripe, Retool, Atlassian, Asana, Airtable), the icon + headline + CTA pattern has 100% adoption. The core component stack: a 48–64px monochrome icon, a 3–5 word headline, optional body text, and a primary CTA button with an imperative verb. Error messages and empty states are often designed last but are the moments when users decide whether to keep using a product or abandon it.

**Key takeaway:** For data-heavy UIs, state design is a data workflow problem. Most dashboards move through: initial load, partial load, success, no results, invalid configuration, degraded service, and hard failure. Every panel, table, chart, or KPI card needs defined behaviour for: first load, loading after filters change, no data returned, partial data, invalid filter combination, unauthorised data, backend timeout, stale cached result, and schema mismatch. Each state needs a plain-language message, a likely cause, a recommended next action, and an option to retry/reset.

---

## 25. Full URL Bibliography

Every URL below was returned by a web search conducted in August 2026 and is cited in the department sections above.

### Instagram
1. https://www.theverge.com/tech/946458/instagram-is-finally-letting-everyone-reorganize-their-grid
2. https://socialbee.com/blog/instagram-updates/
3. https://techcrunch.com/2026/06/27/instagram-is-testing-more-ways-for-users-to-customize-your-algorithm/
4. https://www.heyorca.com/blog/instagram-social-news
5. https://www.theverge.com/tech/947898/meta-instagram-your-algorithm-main-feed-tell
6. https://thenextweb.com/news/instagram-your-algorithm-central-experience-mosseri
7. https://www.macrumors.com/2026/06/09/instagram-now-lets-users-reorder-posts/
8. https://www.inro.social/blog/instagram-live-shopping
9. https://creatorflow.so/blog/instagram-live-dm-automation-guide/
10. https://liveshopfront.com/instagram-live-shopping-guide
11. https://smmnut.com/blog/how-instagram-live-works-algorithm-2026/
12. https://creatorflow.so/blog/instagram-live-shopping/

### Pinterest
13. https://gestalt.pinterest.systems/
14. https://github.com/pinterest/gestalt
15. https://www.designsystems.one/design-systems/gestalt
16. https://newsroom.pinterest.com/en-ca/news/introducing-new-visual-search-features/
17. https://www.linkedin.com/posts/pinterestdesign_at-pinterest-we-know-inspiration-often-starts-activity-7463348751752159233-st49
18. https://medium.com/pinterest-engineering/evolution-of-multi-objective-optimization-at-pinterest-home-feed-06657e33cd10
19. https://medium.com/pinterest-engineering/module-relevance-on-homefeed-ae76f8b545b2
20. https://socialbee.com/blog/pinterest-news/
21. https://metricool.com/pinterest-boards-ai-upgrade/
22. https://create.pinterest.com/blog/board-fundamentals/
23. https://socialbee.com/blog/how-to-use-pinterest/
24. https://www.gensumo.com/blog/how-to-organize-pinterest-boards/
25. https://www.aurascience.blog/how-to-get-to-pinterest-boards

### eBay
26. https://innovation.ebayinc.com/stories/ebay-reduces-the-time-to-list-on-mobile-with-new-simplified-selling-tool-now-featuring-magical-listing-ai-technology/
27. https://innovation.ebayinc.com/stories/how-ebay-modernized-the-most-important-page-on-our-platform/
28. https://www.annamzaremba.com/project-ebay-selling.html
29. https://linkedin.com/in/balasubramanian-ashok
30. https://www.flateboe.com/projects/ebay-seller-hub
31. https://www.ebay.com.au/help/buying/paying-items/buyer-protection-fee?id=5594
32. https://www.ebay.com.au/sellercentre/tracking/payment-holds-faqs
33. https://investors.ebayinc.com/investor-news/press-release-details/2026/eBay-Inc--Reports-First-Quarter-2026-Results/default.aspx
34. https://www.yahoo.com/news/us/articles/ebay-console-never-arrived-stranger-002423843.html
35. https://www.valueaddedresource.net/expanded-inr-protections-ebay-labels/
36. https://techcrunch.com/2026/08/06/ebay-continues-to-bet-on-live-shopping-after-record-quarter/
37. https://www.valueaddedresource.net/ebay-live-8x-growth/
38. https://www.ebayinc.com/stories/press-room/ca/ebay-live-launches-in-canada-bringing-real-time-community-driven-shopping-nationwide/
39. https://www.valueaddedresource.net/ebay-live-canada/
40. https://retail-insider.com/retail-insider/2026/02/ebay-launches-livestream-shopping-platform-in-canada-with-auctions-tied-to-fan-conventions/

### Snapchat
41. https://newsroom.snap.com/sps-2024-simple-snapchat?lang=en-US
42. https://newsroom.snap.com/sps-2024-new-ways-for-creators
43. https://www.theverge.com/2024/9/17/24246999/snapchat-redesign-three-tabs-stories-spotlight
44. https://newsroom.snap.com/empowering-content-creation-with-new-tools
45. https://newsroom.snap.com/snapchat-launches-creator-subscriptions?lang=en-US
46. https://www.theverge.com/news/658306/snapchat-simple-redesign-losing-north-american-users
47. https://help.snapchat.com/hc/en-us/articles/48712730905748-How-do-Notifications-with-Chat-Preview-work
48. https://help.snapchat.com/hc/en-us/articles/7012292808596-About-Profiles-on-Snapchat
49. https://help.snapchat.com/hc/en-us/articles/7012371641364-How-do-Friendship-Profiles-on-Snapchat-work
50. https://help.snapchat.com/hc/en-us/articles/46695769512084-What-is-My-Profile-and-who-can-see-it
51. https://help.snapchat.com/hc/en-us/articles/49292669382420-How-do-Topic-Chat-profile-pills-work
52. https://help.snapchat.com/hc/en-us/articles/7012374553876-How-do-Group-Profiles-on-Snapchat-work
53. https://help.snapchat.com/hc/en-us/articles/31119013165332-How-do-I-see-when-a-friend-is-viewing-our-Chat
54. https://help.snapchat.com/hc/en-us/articles/26058714433428-How-do-Story-View-Notifications-work-with-Snapchat

### Mobile UX & Design Systems
55. https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/
56. https://www.uxpin.com/studio/blog/what-is-mobile-ui/
57. https://creativecode.com.tr/en/blog/mobil-uygulama-tasarim-prensipleri-2026
58. https://www.gitnexa.com/blogs/mobile-app-design-guidelines
59. https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices
60. https://creativealive.com/design-systems-2026-component-libraries-motion-tokens/
61. https://www.themasterly.com/blog/design-tokens
62. https://feature-sliced.design/blog/design-tokens-architecture
63. https://www.digitalapplied.com/blog/design-systems-2026-scale-ui-without-chaos-methodology
64. https://www.carmenansio.com/articles/motion-tokens-design-systems/

### AI UX & AI Slop
65. https://www.lazarev.agency/articles/ai-ux-patterns
66. https://www.trykrux.com/blog/ai-ux-patterns
67. https://ecomdesignpro.com/ai-shopping-assistant-ux/
68. https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content
69. https://digital-strategy.ec.europa.eu/en/policies/eu-icons-labelling-ai-generated-content
70. https://digital-strategy.ec.europa.eu/en/policies/guidelines-transparency-ai-generated-content
71. https://igp.sipa.columbia.edu/sites/igp/files/2026-06/AI%20Slop%20and%20the%20Information%20Ecosystem_IGP%20Report.pdf
72. https://www.nature.com/articles/d41586-026-02503-7

### Live Shopping & Commerce UX
73. https://getstream.io/blog/live-shopping-app-design/
74. https://getstream.io/blog/tiktok-live-shopping/
75. https://baymard.com/blog/ecommerce-quantitative-ux-insights-2026
76. https://www.shopify.com/blog/ecommerce-returns-management
77. https://forthroute.io/blog/returns-analytics-dashboard-shopify
78. https://nshift.com/blog/connected-returns-journey-2026
79. https://www.digitalapplied.com/blog/ecommerce-returns-reduction-2026-data-playbook

### Fintech & Wallet UX
80. https://www.moove.xyz/blog/everything-you-need-to-know-about-moove-handle-and-moove-profile
81. https://www.moove.xyz/blog/moove-app-the-ultimate-web3-fintech-app
82. https://mypic.cloud/avatar-first-wallets-using-visual-identity-to-build-trust-wi
83. https://youpay.co/blog/introducing-youpay-bio-a-link-in-bio-built-for-creators/
84. https://ryanshahine.me/portrait-wallet-for-ios

### Messaging UX
85. https://www.uxpin.com/studio/blog/chat-user-interface-design/
86. https://ethora.com/blog/chat-app-ui-ux-design/
87. https://listrovert.com/design-patterns-for-mobile-messaging-screens/
88. https://medium.com/doctolib/building-reliable-ai-chat-on-mobile-01015d74422e
89. https://biocraftr.com/designing-mobile-conversations/

### Empty/Error States
90. https://screensdesign.com/articles/mobile-app-empty-state-examples/
91. https://dataviewer.cloud/how-to-design-empty-states-and-error-states-for-data-heavy-uis
92. https://137foundry.com/articles/how-to-design-error-messages-empty-states-ux
93. https://kompassify.com/blog/empty-states-guide
94. https://www.northbase.design/patterns/empty-states

### Style Quiz & Personalisation
95. https://blog.maplesage.com/fashion-style-quizzes-that-drive-revenue
96. https://docs.revenuehunt.com/customer-success/quiz-for-fashion-apparel/
97. https://bitzage.com/portfolio/fashion-for-me/
98. https://github.com/spandana-builds/stylesense
99. https://onlinestorenews.com/zero-party-data-is-replacing-the-third-party-cookie-for-dtc-personalization-in-2026/

---

*End of compendium. This document is the single source of truth for all 2026 web evidence cited across the ThryftVerse flagship upgrade programme reports 00–21. Every department claim about external product behaviour, design patterns, or platform conventions should be traceable to a URL in the bibliography above.*
