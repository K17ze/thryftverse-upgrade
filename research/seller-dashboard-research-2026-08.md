# Seller Dashboard Mobile Research — August 2026

Compiled from primary web research (web_search + webfetch) across 8 flagship seller-facing mobile surfaces, plus platform design-language research and haptic best practices. All sources cited with access date 2026-08-31.

---

## 1. Per-App Findings

### 1.1 eBay Seller Hub (mobile, 2026)

**Sources:**
- https://plugbooks.io/ebay-overview/ (accessed 2026-08-31)
- https://storesautomation.com/ebay-seller-hub/ (accessed 2026-08-31)
- https://www.underpriced.app/blog/ebay-seller-mastery-hub-2026 (accessed 2026-08-31)
- https://www.ebay.co.uk/help/selling/selling-tools/seller-hub?id=4095 (accessed 2026-08-31)
- https://www.ebay.com.au/sellercentre/seller-hub (accessed 2026-08-31)

**First-viewport composition:**
- Overview tab is the landing screen — a "daily triage board." Top of screen surfaces urgent tasks, recent sales, orders awaiting shipment, traffic, and updates.
- 15 customizable modules on the Overview page; sellers can tailor which appear. Onboarding flow lets you pick modules relevant to your business.
- Reading order: tasks/urgent → recent sales → orders awaiting shipment → traffic → updates.

**Money/payments panel:**
- Payments tab tracks available funds, payouts, fees, transaction history. View previous payouts, next payout date, funds on hold.
- Payout schedule visible; eBay-managed payments show payout timing.

**Orders presentation:**
- Orders tab = "fulfillment and service queue." View new orders, shipments, cancellations, returns. Filter by time period.
- Shipping labels, tracking upload, returns, buyer requests, past orders all in one queue.
- Mobile app: can create, edit, monitor listings, relist, provide tracking on the go. Full feature set (Research, Marketing) works best on desktop.

**Analytics summary:**
- Performance tab: sales, selling costs as % of sales, traffic, buyer traffic source, seller levels, standards. Drill into charts/graphs.
- Overview shows traffic summary; Performance is the deeper analytics layer.

**Quick-access tiles/shortcuts:**
- Tab-based navigation: Overview, Orders, Listings, Marketing, Advertising, Store, Performance, Payments, Research, Reports (10 tabs).
- Overview acts as jump board to all sections.

**Visual hierarchy:**
- Module-based dashboard; 15 modules can be reordered. Tasks/recent sales dominate top.
- Density is high — designed for daily triage, not glanceability.

**Spacing/radius/icon/color:**
- Not documented in primary sources at the pixel level. eBay's design is functional/utilitarian, not premium-crafted.

**State coverage:**
- Onboarding flow for first-time users (module configuration). Otherwise not documented.

**Unique flagship patterns:**
- **15-module customizable Overview** — the most configurable seller home of any app surveyed. Sellers curate their own triage board.
- **Weekly operating-system rhythm** — eBay explicitly frames Seller Hub as a control loop: operations first (Overview→Orders→Listings), growth second (Performance→Research).
- **Refurbished on eBay dashboard** — a dedicated real-time metrics tab for refurbished transactions, a niche vertical surface.

---

### 1.2 Stripe Dashboard mobile app (2026)

**Sources:**
- https://docs.stripe.com/dashboard/mobile (accessed 2026-08-31)
- https://apps.apple.com/us/app/stripe-dashboard/id978516833 (accessed 2026-08-31)
- https://play.google.com/store/apps/details?id=com.stripe.android.dashboard (accessed 2026-08-31, updated Aug 4 2026)
- https://www.925studios.co/blog/stripe-dashboard-design-breakdown (accessed 2026-08-31, published Mar 27 2026)
- https://www.putler.com/stripe-dashboard/ (accessed 2026-08-31)
- https://mobbin.com/explore/screens/cec70aed-48f1-4bde-a8e8-11d0a2d3d531 (accessed 2026-08-31)
- https://mobbin.com/explore/screens/4faf8630-06a3-4a56-8271-b6cd5bec3a25 (accessed 2026-08-31)

**First-viewport composition:**
- Home tab opens with "Reports overview" — a set of charts providing account info. Title row with an **Edit** button (iOS) / "Add or edit charts" link (Android) at bottom.
- Five headline numbers dominate: gross volume, net volume, new customers, successful payments, date-range comparison.
- Below numbers: small monochrome sparkline charts showing trend direction.
- **Opinionated, not configurable-by-default** — the home screen is opinionated about what matters. No "add metric" button on the default view (customization is via Edit, not a widget store).

**Money/balance panel:**
- Separate **Balances tab** at bottom of screen. Shows: available balance, in transit amount, available soon amount, total balance, and payout history.
- Can initiate instant or standard payout from Balances tab or via (+) top-right → "Pay out funds."
- Payout schedule: daily/weekly/monthly automatic, or manual. Standard = 2 business days; instant = within 30 minutes (1-1.5% fee).
- Payout timeline shows every status change: processing, paid, failed, returned, with failure reason.
- Balance types: payments balance, available, pending, reserve, issuing.

**Orders/transactions presentation:**
- Payments tab: filterable list of recent transactions. Filters map to user questions: by date, customer, status (succeeded/failed/refunded), amount. No filter by internal charge ID.
- Transaction detail: amount, fees, risk level (normal/elevated/highest) + numeric risk score 0-99 (with Radar), reason, full timeline of events.
- Action bar at bottom of payment detail: Refund, overflow menu (⋯) → View/Send receipt.
- **Global search** spans all object types (customers, invoices, payouts, products) simultaneously.

**Analytics summary:**
- Sparklines (monochrome) beneath each headline number — not colored bar charts.
- **Every metric shows current period alongside previous period** in smaller text beneath the primary number. Answers "is this good or bad?" without navigating away.
- Color reserved for status signals only: green = succeeded, red = failed, yellow = pending. Narrow palette so red always means attention.

**Quick-access tiles/shortcuts:**
- Bottom tab bar: Home, Payments, Balances, Customers (plus + action at top-right).
- (+) button top-right → Charge a card/invoice, Create payment link, Pay out funds.
- iOS lock screen widgets: 17+ metrics (MRR, net volume, high risk payments, dispute activity).
- Android home screen widgets: 4 metric widgets (daily gross volume, new payments, new customers, net volume).

**Visual hierarchy:**
- **Typography and whitespace enforce hierarchy, not color.** Large high-contrast numbers read across the room. Trend indicators are monochrome sparklines.
- Information density control: show what you need to act on, not everything that exists.
- Navigation maps to jobs-to-be-done (Payments, Payouts, Customers, Disputes), not internal data model.

**Spacing/radius/icon/color:**
- Restraint is the defining trait. Narrow color palette. Color = status, not decoration.
- Sparklines are monochrome. No chart grid, no decorative gradients.

**State coverage:**
- **Empty states designed with same care as populated states.** New account: metrics show zero, sparklines flat, prominent "Make your first test payment" prompt. Empty state is also documentation touchpoint (code snippet for test charge).
- Onboarding: progress checklist embedded in sidebar (Activate account, Set up payments, Configure branding). Persists until complete. Not modal-based.
- Loading: not explicitly documented but charts render progressively.

**Unique flagship patterns:**
- **Opinionated home over configurable home** — Stripe shows 5 numbers + sparklines and says "this is what matters." No widget store. The courage to say no.
- **Contextual date comparison on every metric** — current vs previous period always present, always smaller, always same period type. Eliminates "is this good?" anxiety.
- **Monochrome sparklines + status-only color** — color never means "category," always means "action required." A red indicator is never ignored.
- **Microcopy as first-class design asset** — "Your card was declined. Contact your bank or try a different payment method." "Respond by [specific date]" not "Action required." Specificity eliminates anxiety.
- **Global search across all object types** — no need to know which section data lives in.
- **Embedded onboarding checklist** (not modal) — persists in sidebar until complete.

---

### 1.3 Depop Shop Stats (2026)

**Sources:**
- https://depophelp.zendesk.com/hc/en-gb/articles/360019016817-Shop-Stats (accessed 2026-08-31, 403 — content from search snippet)
- https://www.valueaddedresource.net/depop-product-release-june-2025/ (accessed 2026-08-31)
- https://ifann.net/wiki/product/depop (accessed 2026-08-31)
- https://mobbin.com/explore/screens/9e72d8f5-7e88-466a-b5d0-8ef98975ef1a (accessed 2026-08-31)
- https://mobbin.com/explore/screens/882e9a0e-08e1-4d2d-a045-2796596eaa7f (accessed 2026-08-31)
- https://www.depop.com/blog/how-does-depop-work/ (accessed 2026-08-31)

**First-viewport composition:**
- Shop Stats accessed via Sell icon → Selling Hub → Stats. On mobile browser (not native app tab — Stats is in Explore Hub dropdown).
- Stats dashboard shows: sales, potential earnings, total listings in one view. Designed to "spot trends and understand what's driving performance."
- iOS-only features: Potential revenue (total you could make from live listings), Listings posted (total ever created).

**Money/wallet panel:**
- Earnings = money made from selling, before refunds, after transaction + boosting fees. Multi-currency toggle.
- No native wallet/payout schedule panel documented — Depop uses managed payments, earnings go to connected account.

**Orders presentation:**
- Not a focus of Shop Stats — orders managed elsewhere in Selling Hub. Stats is analytics-only.

**Analytics summary:**
- Graph or Table view toggle (top-right on desktop browser). All data is historical.
- Metrics: Earnings, Items sold (bundles count each item individually), Potential revenue (iOS), Listings posted (iOS).
- Graph view for trend spotting; Table view for precise numbers.

**Quick-access tiles/shortcuts:**
- Selling Hub is the parent; Stats is a sub-section. Navigation via Sell icon → Selling Hub → Stats.

**Visual hierarchy:**
- Social-marketplace DNA. Selling Hub dashboard has options to manage listings and view stats. Mobbin screens show a creative, image-forward aesthetic consistent with Depop's brand.

**Spacing/radius/icon/color:**
- Depop's brand is creative/social. Not documented at pixel level in primary sources.

**State coverage:**
- Not documented in primary sources.

**Unique flagship patterns:**
- **Potential revenue metric (iOS)** — forward-looking: total you *could* make from live listings. Uniquely optimistic/motivational.
- **Graph/Table toggle** — same data, two reading modes. Respects different seller cognitive styles.
- **Bundle-aware item counting** — each item in a bundle counted individually, so "items sold" reflects actual units moved.
- **No selling fees (US/UK)** — shifted to buyer-paid fee model. Earnings shown are closer to take-home.

---

### 1.4 Vinted seller dashboard (2026)

**Sources:**
- https://www.vinted.com/help/437-vinted-wallet-how-it-works (accessed 2026-08-31)
- https://www.vinted.co.uk/help/460-pending-balance (accessed 2026-08-31)
- https://vintedpay.com/uk/faq (accessed 2026-08-31)
- https://blog.vinta.app/blog/vinted-seller-statistics-dashboard-guide (accessed 2026-08-31)
- https://blog.vinta.app/blog/vinted-payments-payout-sellers-guide (accessed 2026-08-31)
- https://vinkit.co/en/features/vinted-sales-dashboard (accessed 2026-08-31)
- https://vintedmanager.com/ (accessed 2026-08-31)

**First-viewport composition:**
- Vinted's **native in-app seller stats are surface-level**: views per listing, likes, transaction history. "A starting point, not an analytics layer" (Vinta.App).
- The native app does NOT have a rich seller dashboard — third-party tools (Vinta, Vinkit, VintedManager, VintHelper) fill the gap. This is a notable anti-pattern.
- Profile icon → Balance is the wallet entry point. Activate Vinted Balance to start selling.

**Money/wallet panel:**
- **Vinted Wallet** is the core money surface. Two states: **Pending balance** and **Available balance**.
- Pending → Available flow: buyer pays (pending) → order delivered → buyer has 2 days to confirm/claim → order completed → payment moves to Available within 2 days.
- Available balance: withdraw to bank or auto-use for Vinted purchases. No top-up allowed.
- Withdrawal: ~5 business days to bank (Vinta guide). UK: typically same-day via Vinted Pay.
- Safeguarding: money held in separate dedicated bank account, disconnected from business funds.

**Orders presentation:**
- Native app shows order status (pending, delivered, completed). Shipping status trackable.
- No media thumbnails or SLA chips documented in native app — basic status list.

**Analytics summary:**
- Native: views per listing, likes, transaction history. No charts, no trends, no conversion rate.
- Third-party tools add: revenue over time, profit margin per item, conversion rate, sell-through rate by category, AOV.

**Quick-access tiles/shortcuts:**
- Profile icon → Balance. No dedicated seller hub tab in native app — sellers navigate through profile.

**Visual hierarchy:**
- Buyer-first app. Seller surfaces are secondary and minimal.

**State coverage:**
- Wallet activation flow documented (identity verification). Otherwise minimal.

**Unique flagship patterns:**
- **Two-state wallet (Pending/Available) with clear lifecycle** — the pending→available flow is the most clearly documented escrow lifecycle of any app surveyed. Educational and transparent.
- **Safeguarding disclosure** — explicit statement that funds are in a separate, dedicated bank account. Trust-building through regulatory transparency.
- **Auto-use balance for purchases** — available balance automatically applies at checkout. Frictionless reuse.

**Anti-pattern (flagship):**
- **Native seller dashboard is absent** — the entire seller analytics layer is outsourced to third-party browser extensions and web tools. Vinted's GMV hit €10.8B in 2025 (+47% YoY) yet the native seller experience is the weakest of all 8 apps surveyed.

---

### 1.5 Shopify mobile home (2026)

**Sources:**
- https://changelog.shopify.com/posts/customizable-home-metrics-now-available-on-the-shopify-app (accessed 2026-08-31, posted Dec 11 2024)
- https://help.shopify.com/en/manual/shopify-admin/shopify-app/using-shopify-mobile-widgets (accessed 2026-08-31)
- https://qstomy.com/en/blog-posts/what-is-the-shopify-dashboard (accessed 2026-08-31)
- https://www.letstalkshop.com/blog/how-to-set-up-shopify-custom-reports-and-dashboards (accessed 2026-08-31)
- https://community.shopify.com/t/anyone-else-frustrated-with-the-new-shopify-app/654393/1 (accessed 2026-08-31)
- https://community.shopify.com/t/anyone-else-frustrated-with-the-new-shopify-app/654393/4 (accessed 2026-08-31, summarized Jul 26 2026)
- https://shopify.engineering/improving-shopify-app-s-performance (accessed 2026-08-31)

**First-viewport composition:**
- Shopify Home is the landing page: sales metrics, order tasks, alerts, suggestion cards.
- **Customizable Home Metrics** (Dec 2024): metrics extended from 4 to 18, with comprehensive visualizations. Long-press a metric name to customize. Syncs across desktop and mobile.
- Recent redesign (2026) introduced an **animated "gamified" daily sales total** at the top — a spinning animation that counts up to the day's sales number. **This caused significant merchant backlash.**

**Money/wallet panel:**
- Total sales / net sales appear as Home metrics. Finance reports separate. Gift-card purchases excluded from Home analytics card.
- Shopify Balance (business account) exists but is a separate product surface.

**Orders presentation:**
- Orders appear as task cards on Home. Order tasks, alerts surfaced.
- Live View: real-time active visitors (last 5 min), totals since midnight in store timezone.

**Analytics summary:**
- 18 customizable metrics: total sales, net sales, AOV, total orders, ordered items, returned items, visitors, sessions, conversion rate, fulfilled orders, delivered orders, time to fulfill, and more.
- Metric cards are resizable (drag to span 2 columns), reorderable (drag-and-drop), removable.
- Real-time refresh (~1 minute). Automatic insights and metric targets.
- **The animated daily sales total is the controversial element** — merchants want plain numbers immediately, not a spinning animation. "Sales figures are important business data and should appear immediately as plain numbers."

**Quick-access tiles/shortcuts:**
- **Mobile widgets** (iOS + Android): Insights widget (2/4/7 metrics), Shopify Counter (order counter), Sidekick widget (lock screen/Apple Watch).
- Home metrics are the in-app equivalent — long-press to customize.

**Visual hierarchy:**
- Daily sales total dominates top of Home (post-redesign). Below: metric cards, tasks, alerts.
- Pre-redesign: 4 metric cards in a row. Post-redesign: animated hero number + cards.

**Spacing/radius/icon/color:**
- Card-based. Metric cards are rounded rectangles. Drag-to-resize implies a grid system.

**State coverage:**
- Performance engineering: Home screen renders progressively — doesn't wait for all queries. Renders with cache first, then updates. Cache hit rate improved 20% after GraphQL cache fix.
- All screens rewritten as lists (FlashList/ListSource) for render efficiency.

**Unique flagship patterns:**
- **18-metric customizable home with long-press editing** — the most granular metric customization, syncs across platforms.
- **Mobile widgets (Insights, Counter, Sidekick)** — extends dashboard to OS home screen. Counter widget = pure number, no animation (the workaround merchants adopted).
- **Progressive Home rendering** — render with cache first, don't block on all queries. Engineering excellence for perceived performance.
- **Live View** — real-time active visitors + totals since midnight. For launches/BFCM, not weekly KPIs.

**Anti-pattern (flagship warning):**
- **Animated gamified sales total** — merchants hate it. Business data should appear as plain numbers immediately. No setting to disable. This is the #1 anti-pattern of 2026. The community workaround (home screen widget) proves users want the number without the animation.

---

### 1.6 Square Dashboard app (2026)

**Sources:**
- https://squareup.com/help/us/en/article/5618-get-started-with-the-square-dashboard-app (accessed 2026-08-31)
- https://my.squareup.com/help/us/en/article/5381-in-app-summaries-and-reports (accessed 2026-08-31)
- https://apps.apple.com/gb/app/square-dashboard-for-pos/id992958748 (accessed 2026-08-31, © 2026 Block Inc.)
- https://play.google.com/store/apps/details?id=com.squareup.dashboard&hl=en (accessed 2026-08-31, updated Aug 24 2026)
- https://siliconbased.dev/square-dashboard (accessed 2026-08-31)
- https://community.squareup.com/t5/Event-Discussions/Dashboard-iOS-App-Ask-us-anything-about-the-updates-to-sales/m-p/638380 (accessed 2026-08-31)

**First-viewport composition:**
- Home screen: high-level summary of **gross sales, transaction counts, payment types** over selected date range.
- Described as "modular" but can feel "overwhelming, akin to stepping into the cockpit of a commercial airliner" for beginners.
- iOS widget shows: gross sales, net sales, transactions, average sale. Customizable timeframe.

**Money/wallet panel:**
- Sales summary: gross sales, refunds, net sales, discounts, tips, taxes, total collected, fees.
- Net total = total collected minus fees minus withholdings. Net sales = gross minus returns minus discounts/comps.
- Deposits tracked. Cash flow management: integrate sales/spend reports, automate budgeting, pay bills, manage linked credit cards (banking features via Square Financial Services).

**Orders/transactions presentation:**
- Transactions: granular, chronologically ordered list of every swipe/dip/tap.
- Sales summary report: closed sales, partial payments, tips, top-selling items.
- Can print, export, or copy links to share with team.

**Analytics summary:**
- **Sales trends report**: compares daily, weekly, yearly sales. Comparison charts.
- Gauge (Line) graph or Bar group view — toggleable.
- Group by: hour, day, week, month. Filter by location, device, team member.
- Metrics now have **definitions attached** — helps understand what each metric means.
- Controls (metrics, locations, grouping, filters) in a blade opening from right-hand side.

**Quick-access tiles/shortcuts:**
- Left-hand navigation: Reports, Transactions, Items, Customers, Team.
- iOS widget: Data point (single metric), Key info (multiple metrics), Up next (upcoming shifts).

**Visual hierarchy:**
- Gross sales is the speedometer; Reports tab is the diagnostic computer. Sales summary leads with the big number, breakdowns below.
- Controls in a right-hand blade — keeps the main view clean.

**Spacing/radius/icon/color:**
- Functional/POS-utility aesthetic. Not premium-crafted. Card-based reports.

**State coverage:**
- Permissions-based: reports permission (limited vs detailed) controls what's visible. 90 days in POS app; full historical in Dashboard.

**Unique flagship patterns:**
- **Metric definitions attached to metrics** — inline definitions reduce "what does this number mean?" friction. Educational without leaving context.
- **Right-hand controls blade** — filters/grouping/metrics in a side blade, not cluttering the main report. Clean separation of data from controls.
- **Gauge vs Bar view toggle** — same data, two visualization modes.
- **Multi-location, device, team-member filtering** — the most granular operational filtering of any app surveyed (built for multi-location POS businesses).
- **Banking integration** — Square Financial Services brings spend management, budgeting, bill pay, credit cards into the dashboard. Money in + money out in one surface.

**Anti-pattern:**
- **Gross sales as default** — merchants repeatedly request Net sales as default. Gross is "nearly useless when running promotions." Square has not addressed this despite years of feedback.

---

### 1.7 Etsy Seller app (2026)

**Sources:**
- https://help.etsy.com/hc/en-us/articles/115015774268-How-to-Use-Etsy-Stats-for-Your-Shop (accessed 2026-08-31, 403 — content from search snippet)
- https://www.etsy.com/sell-mobile (accessed 2026-08-31)
- https://www.insightagent.app/guides/etsy-seller-dashboard-guide (accessed 2026-08-31)
- https://play.google.com/store/apps/details?id=com.etsy.butter.sell_on_etsy&hl=en (accessed 2026-08-31, updated Aug 20 2026)
- https://closo.co/blogs/optimization-growth-strategies/the-etsy-shop-manager-hide-and-seek-guide-mastering-your-dashboard-in-2026 (accessed 2026-08-31)
- https://www.putler.com/etsy-dashboard/ (accessed 2026-08-31)
- https://spctek.com/etsy-new-ai-tools-and-shop-manager-features/ (accessed 2026-08-31)

**First-viewport composition:**
- Dashboard (Home) = "Feed." Shows recent activity, new orders, **"Stats at a glance."**
- **New for 2026: "Today's Top Tasks" checklist** at the top — prioritizes what needs attention first (e.g., "1 Message Unanswered," shipping orders, renewing listings).
- Below Top Tasks: shop reminders, stats (views, visits, orders, revenue), links to Etsy education.

**Money/wallet panel:**
- Finances section in Shop Manager. Revenue tracked per listing. Financial reports fuller on desktop; limited on mobile.

**Orders presentation:**
- Orders page: New, In Progress, Completed, Canceled. Print labels, track fulfillment, communicate with buyers.
- **Updated order design shows "what to ship, and when"** — time-sensitive prioritization.
- Late shipments tank shop score → orders have implicit SLA pressure.
- Repeat buyer tags in Messages.

**Analytics summary:**
- Stats accessed via More (bottom nav) → Stats.
- **Metrics Overview**: scroll right/left through graphs for Total Visits, Total Orders, Total Revenue, Conversion Rate. Toggle "Compare to last year" for YoY.
- **How buyers found you this week**: traffic sources over last 7 days (Direct, Etsy Search, Etsy Ads, Social Media).
- **Listing stats over 7 days**: Views, Orders, Revenue, Favorites. Sorted by highest view count.
- **Shop engagement**: favorited items, new followers.

**Quick-access tiles/shortcuts:**
- Bottom navigation: More → Stats (Stats is one level deep, not on main bar).
- Dashboard has quick-action links to timely tasks.

**Visual hierarchy:**
- Top Tasks checklist dominates top. Then stats-at-a-glance. Then recent activity.
- Task-first design — "what to deal with next" is the organizing principle.

**Spacing/radius/icon/color:**
- Etsy's brand is handmade/craft. Warm, not corporate. Not documented at pixel level.

**State coverage:**
- Seller Checklists for new shops (step-by-step onboarding in dashboard).
- Recent Activity Filters + Quick Actions (one-click: check stats, send offers, respond to reviews).

**Unique flagship patterns:**
- **Today's Top Tasks checklist** — the most explicit task-prioritization pattern. Not a dashboard of numbers; a checklist of actions. "1 Message Unanswered" is more actionable than "Messages: 1."
- **YoY comparison toggle on metrics** — scroll through metric graphs with "Compare to last year" toggle. Historical context is one tap.
- **Traffic source breakdown (7-day)** — "how buyers found you this week" is uniquely buyer-acquisition-focused.
- **Repeat buyer tags in Messages** — identity signal embedded in communication, not a separate report.
- **Two-app separation** (buyer app vs seller app) — deliberate. Seller app is purpose-built for management, not polluted by shopping.

---

### 1.8 Poshmark seller dashboard (2026)

**Sources:**
- https://blog.poshmark.com/2026/07/30/60046/ (accessed 2026-08-31, posted Jul 30 2026)
- https://blog.poshmark.com/2026/01/25/your-complete-guide-to-poshmarks-features-tools/ (accessed 2026-08-31)
- https://blog.poshmark.com/2026/04/06/sellerupdatesapril6/ (accessed 2026-08-31)
- https://blog.poshmark.com/2026/08/31/60225/ (accessed 2026-08-31)
- https://blog.poshmark.com/navigating-promoted-closet/ (accessed 2026-08-31)
- https://www.valueaddedresource.net/poshmark-seller-tools-updates/ (accessed 2026-08-31)

**First-viewport composition:**
- **Seller Hub** (announced Jul 30 2026, coming Q3 2026): "new home base." Brings together what needs attention, next best action, and tools to grow sales. "Sleek, streamlined new look that puts everything front and center."
- Currently: seller tools accessed via Me Tab (app) or Account Settings (web). Seller Tools > Posh Stats for performance.

**Money/wallet panel:**
- Redeemable Balance exists (mentioned as a payment method for Promoted Closet). Earnings from sales.
- No detailed wallet panel documented in primary sources.

**Orders presentation:**
- Posh Stats (updated Apr 2026): average ship time, cancellation rate, approved return cases, total sales, shipped orders — all in one place.
- Listing-level metrics (rolling out Apr 2026): impressions, clicks, likes, seller offers, buyer offers, days listed — on listing details page.
- Inactive Listings tool: flags listings with no action in 60 days. Notified in app/email. Active listings prioritized in search.

**Analytics summary:**
- Posh Stats: operational metrics (ship time, cancellation rate, return cases) + sales totals.
- Listing-level: engagement funnel (impressions → clicks → likes → offers).
- **Sourcing Calendar** (Aug 2026): what's selling now and trending next. Paired with Sold Search.
- **Show Analytics Dashboard** (Posh LIVE): show-level views, sales, metrics + 30-day recap.

**Quick-access tiles/shortcuts:**
- Me Tab → Seller Tools → Posh Stats / Sourcing Insights / Promoted Closet.
- Bundle discounts "front and center at top of seller closets" with real-time banner showing discount + progress.

**Visual hierarchy:**
- Seller Hub (upcoming) promises "everything front and center." Current state is tool-by-tool navigation.
- Bundle discount banner at top of closet = buyer-facing conversion element.

**Spacing/radius/icon/color:**
- Poshmark's brand is social/fashion. Not documented at pixel level.

**State coverage:**
- Inactive Listings notifications (app + email). Performance-based seller program with clear thresholds.

**Unique flagship patterns:**
- **Seller Hub "next best action"** (upcoming) — explicitly surfaces the single next best action, not just a dashboard of metrics. Action-oriented IA.
- **Sourcing Calendar + Sold Search** — uniquely sourcing-focused. Tells sellers *what to list next*, not just how past listings performed. Forward-looking inventory guidance.
- **Listing-level engagement funnel** (impressions → clicks → likes → offers) — most granular per-listing diagnostic. Diagnoses exactly where the funnel breaks: "Low impressions? Refresh title. Clicks but no offers? Better description."
- **Performance-based seller program with transparent thresholds** — 20 lifetime orders, then rolling 90-day: 5 orders or $500, 2-day ship time, ≤2% cancellation/return. Trust signal to buyers, visibility reward for sellers.
- **Bundle discount progress banner** — real-time, buyer-facing, shows how close to unlocking discount. Conversion mechanic embedded in closet.

---

## 2. Cross-App Patterns (3+ apps do identically)

### 2.1 Task-first / triage-first home
**Apps:** eBay (Overview = daily triage board), Etsy (Today's Top Tasks), Poshmark (Seller Hub "what needs your attention, next best action"), Shopify (order tasks on Home).
- The seller home screen leads with **what needs attention now**, not raw analytics. Tasks/actions dominate the first viewport; metrics are secondary.

### 2.2 Mobile widgets extending dashboard to OS home screen
**Apps:** Stripe (iOS lock screen 17+ metrics, Android 4 widgets), Shopify (Insights/Counter/Sidekick widgets), Square (iOS Data point/Key info/Up next widgets).
- The dashboard extends beyond the app. Sellers check key numbers without opening the app. Widgets are the "glanceable layer."

### 2.3 Period comparison on every metric
**Apps:** Stripe (current vs previous period, always present, smaller text), Etsy (YoY toggle), Square (daily/weekly/yearly comparison), Shopify (date compare in analytics).
- "Is this good or bad?" is answered inline, not via a separate analytics view. Comparison is contextual and always available.

### 2.4 Bottom tab bar with jobs-to-be-done navigation
**Apps:** Stripe (Home, Payments, Balances, Customers), Etsy (More → Stats, Orders, Messages), Square (Reports, Transactions, Items, Customers, Team), eBay (Overview, Orders, Listings, Performance, Payments).
- Navigation labels map to user jobs, not data categories. "Payments" not "Transactions." "Balances" not "Account Ledger."

### 2.5 Sparkline / trend indicator on headline metrics
**Apps:** Stripe (monochrome sparklines), Shopify (metric visualizations), Square (gauge/bar trend graphs), Etsy (metric graphs with YoY).
- A trend indicator accompanies every headline number. The number alone is insufficient; direction matters.

### 2.6 Customizable / reorderable metric cards
**Apps:** eBay (15 modules, reorderable), Shopify (18 metrics, long-press to customize, drag to resize), Stripe (add/remove/reorder charts), Square (customizable metrics, drag to reorder in widget).
- Sellers have different priorities. The home screen adapts to the business, not the other way around.

### 2.7 Separate seller app or seller-only surface
**Apps:** Etsy (separate Etsy Seller app, distinct from buyer app), Stripe (separate Dashboard app, distinct from checkout), Square (separate Dashboard app, distinct from POS).
- The seller experience is a distinct product, not a mode toggle in the buyer app. Different users, different jobs, different density.

---

## 3. Unique Flagship Patterns (1-2 apps that elevate them)

### 3.1 Stripe: Opinionated home + monochrome sparklines + status-only color
Stripe's home shows exactly 5 numbers with monochrome sparklines and says "this is what matters." Color is reserved exclusively for status (green/red/yellow). No widget store, no "add metric" on the default view. The courage to be opinionated. Every metric has contextual period comparison in smaller text. This is the gold standard for financial dashboard clarity.

### 3.2 Etsy: Today's Top Tasks checklist
Etsy's Top Tasks checklist is the most action-oriented home screen. Not "Messages: 1" but "1 Message Unanswered." Not a dashboard of numbers but a checklist of actions. This transforms the home from an analytics view into an operational to-do list. The seller opens the app and knows exactly what to do next.

### 3.3 Poshmark: Sourcing Calendar + "next best action"
Poshmark's Sourcing Calendar tells sellers what to list *next* — forward-looking inventory guidance, not backward-looking analytics. Paired with the Seller Hub's "next best action" framing, Poshmark is the only app that guides future behavior, not just reports past performance.

### 3.4 Poshmark: Listing-level engagement funnel
Impressions → clicks → likes → offers on each listing detail page, with diagnostic copy ("Low impressions? Refresh title. Clicks but no offers? Better description"). The most granular per-listing diagnostic with actionable remediation guidance.

### 3.5 Vinted: Two-state wallet with transparent escrow lifecycle
Pending → Available with clear timing (2 days after delivery + 2 days buyer confirmation), safeguarding disclosure (separate dedicated bank account). The most transparent money lifecycle documentation. Trust through regulatory clarity.

### 3.6 Square: Metric definitions + right-hand controls blade
Inline metric definitions (what does "net sales" mean?) reduce friction without leaving context. Controls (filters, grouping, metrics) in a right-hand blade, keeping the report view clean. Educational + clean separation.

---

## 4. Anti-Patterns to Avoid

### 4.1 Animated/gamified sales numbers (Shopify 2026)
Shopify's spinning daily sales total caused widespread merchant backlash. Business data should appear as plain numbers immediately. No setting to disable. **The #1 anti-pattern of 2026.** Merchants adopted home screen widgets specifically to avoid the animation. Lesson: never make a seller wait through an animation to see their money number.

### 4.2 Gross sales as default with no net option (Square)
Merchants have requested Net sales as default for years. Gross is "nearly useless when running promotions." Square has not addressed this. Lesson: the default metric matters. Show what the seller actually keeps, not the top-line vanity number.

### 4.3 Absent native seller dashboard (Vinted)
Vinted's GMV is €10.8B but the native app has no real seller dashboard — only surface-level views/likes. The entire analytics layer is outsourced to third-party extensions. Lesson: a marketplace that doesn't invest in native seller tools loses sellers to third-party dependency and friction.

### 4.4 Confusing balance presentation (Stripe — post-redesign)
Stripe's new Balances tab drew 1-star reviews: "Shows three numbers to explain what's coming Monday vs after that, no idea how to read it anymore." The previous version was "perfect." Lesson: don't break a working money panel with a redesign that adds cognitive load. Three numbers where one clear number sufficed.

### 4.5 Burying stats behind "More" menu (Etsy)
Etsy's Stats require More → Stats (two taps from bottom nav). Stats are not on the main navigation bar. For a data-driven seller, this is friction. Lesson: if analytics is a daily-check surface, don't bury it behind a menu.

### 4.6 Desktop-only features on mobile (eBay, Depop, Etsy)
eBay: Research and Marketing "work best on desktop." Depop: Stats download requires laptop/desktop. Etsy: "detailed analytics, financial reports easier on desktop." Lesson: mobile is where sellers check daily. Don't gate the daily-use surface behind a desktop session.

### 4.7 Overwhelming cockpit density (Square)
Square's Home can feel "akin to stepping into the cockpit of a commercial airliner" for beginners. Too many metrics, no progressive disclosure. Lesson: lead with the 2-3 numbers that matter; demote the rest.

---

## 5. Platform Design-Language Findings

### 5.1 iOS 26 (Liquid Glass, shipping fall 2026)

**Sources:**
- https://stora.sh/blog/2026-04-16-apple-ios-26-figma-design-kits-screenshots (accessed 2026-08-31)
- https://www.figma.com/community/file/922533165060687529/ios-26-builder-swiftui-kit-for-ai-agents (accessed 2026-08-31)
- https://vp0.com/blogs/saas-mobile-app-dashboard-ui-free (accessed 2026-08-31)

**Key patterns for seller dashboards:**
- **Liquid Glass controls** — translucent material for navigation/controls. Updated tab bar, new sheet behaviors, reworked system typography.
- **Updated tab bar** and navigation patterns — old tab bar layouts look dated against iOS 26.
- **Dynamic Type and semantic color system** with dark mode on a single switch.
- **SwiftUI-native components**: `.glassEffect(.regular)`, `List` with `.listStyle(.insetGrouped)`, `TabView`, `Tab(role: .search)`.
- **Mobile SaaS dashboard best practice (VP0)**: lead with 2-3 headline KPIs with trends, one glanceable chart, secondary stats linking to detail. "A mobile dashboard is not a shrunk-down desktop analytics page; it is a focused summary that answers 'how are things?' in a glance and lets the user drill in only when they want to."
- **Native chart library** (Swift Charts) so charts look native, not grafted on.

### 5.2 Android 16 Material 3 Expressive (shipping Sept 2025, QPR1)

**Sources:**
- https://9to5google.com/2025/05/13/android-16-material-3-expressive-redesign/ (accessed 2026-08-31)
- https://www.androidauthority.com/google-material-3-expressive-features-changes-availability-devices-3556392/ (accessed 2026-08-31)
- https://www.youtube.com/watch?v=6IsFP3gD28E (accessed 2026-08-31)

**Key patterns for seller dashboards:**
- **Springy, natural-feeling animations** — "satisfying haptic rumble" when dismissing notifications; adjacent elements subtly respond to drag.
- **Background blur** for depth and context preservation (Quick Settings, Recents).
- **15 new/improved components**: app bars (multi-line, subtitles, center alignment, medium emphasis), toolbars (replace bottom app bar; dock to edge or float; pair with FAB).
- **Emphasized typography** and updated dynamic color themes.
- **Resizable Quick Settings tiles** — pills shift to rounded rectangles when activated.
- **Blockier brightness slider** with prominent handle.
- **Library of shapes** for icons (star, circle, asymmetric).
- **Bidirectionally compatible** with existing M3 — can adopt incrementally.

**Implication for seller dashboards:** M3 Expressive encourages springy physics + haptic on meaningful interactions, floating toolbars for quick actions, and dynamic color theming. But restraint still applies — haptic on every interaction is prohibited (see §5.3).

### 5.3 Mobile seller hub IA best practices (2026)

**Sources:**
- https://vp0.com/blogs/multi-vendor-marketplace-dashboard-ui-app (accessed 2026-08-31)
- https://vp0.com/blogs/saas-mobile-app-dashboard-ui-free (accessed 2026-08-31)
- https://adminlte.io/blog/fintech-dashboard-design-examples/ (accessed 2026-08-31)

**Consensus best practices:**
1. **Lead with 2-3 headline KPIs** with trend indicators. Not 20 metrics. Prioritization is the discipline.
2. **One glanceable chart** (native chart library). Not a wall of charts.
3. **Secondary stats link to detail screens.** Drill-down, not dump-everything-on-home.
4. **Order queue is the center** for marketplace sellers — clear states, quick actions. Slow fulfillment loses sales.
5. **Earnings summary**: sales, fees, what is owed. Payout status so vendors know when money arrives.
6. **Performance metrics** (views, conversion, ratings) help vendors improve.
7. **Fintech dashboard pattern**: verdict row (total balance, largest type) → money in motion (pending/transfers) → cash flow chart → transactions feed.
8. **Don't custody funds** — use certified payments provider (Stripe Connect model).
9. **Loading and empty states are designed**, not afterthoughts. First impressions happen in empty states.
10. **Navigation maps to jobs-to-be-done**, not internal data model.

---

## 6. Pull-to-Refresh Haptic Patterns (§34.6 AGENTS.md + 2026 research)

### 6.1 AGENTS.md §34.6 (codebase reference)

**Source:** C:\Users\User\Desktop\thryftverse-upgrade\AGENTS.md, lines 1217-1221

```
### 34.6 Pull-to-Refresh Haptic 2026
- Trigger haptic: Fire a `medium` impact when refresh is triggered (not when it completes). The haptic confirms the pull gesture was registered.
- Completion: No haptic on completion — the visual refresh of content is sufficient signal.
- Pattern: `HapticPatterns.refresh()` → `haptics.press()` (medium impact).
```

Also supported by §27.9 (micro-interaction grammar): "Pull to refresh | Custom indicator with physics + progress haptic at release."

### 6.2 2026 research findings

**Sources:**
- https://swmansion.com/blog/haptics-is-music-how-to-design-haptic-patterns-that-feel-right/ (accessed 2026-08-31)
- https://swmansion.com/blog/what-is-the-difference-between-i-os-and-android-haptics/ (accessed 2026-08-31)
- https://mobileapp.wiki/en/uiux/haptic-feedback-guide (accessed 2026-08-31)
- https://newly.app/sensors/haptics-mobile-apps (accessed 2026-08-31)
- https://trendupdates.me/mobile-app-haptic-feedback-integration/ (accessed 2026-08-31)

**Consensus pattern for pull-to-refresh:**
1. **Build-up haptic**: feedback builds as you pull, then releases. The arc mirrors the action (SWMansion). "Pull-to-refresh is a good example in the wild: the feedback builds as you pull, then releases."
2. **Threshold tick**: `selection` tick when pull crosses the refresh threshold (Mobile App Wiki: "pull-to-refresh threshold (selection tick)").
3. **Trigger haptic**: `medium` impact when refresh is *triggered* (released past threshold), not when it completes. Confirms the gesture was registered (AGENTS.md §34.6).
4. **No completion haptic**: the visual refresh of content is sufficient signal. Do not haptic on data arrival (AGENTS.md §34.6).
5. **Prepare generators on iOS**: call `prepare()` on `UIFeedbackGenerator` before the expected haptic (when drag begins) to eliminate first-fire latency.
6. **Respect system settings**: both platforms let users disable haptics. iOS handles automatically via `UIFeedbackGenerator`. Android: check system haptic preferences.
7. **Android fragmentation**: Pixel/Samsung flagships have excellent LRA motors; budget phones have crude vibration. Always test on multiple devices and provide fallback patterns. Normalize amplitude to avoid "tinny" feedback across different resonant frequencies.
8. **Latency target**: <50ms for cause-effect relationship. Delays weaken the connection.

**API specifics:**
- **iOS**: `UIImpactFeedbackGenerator(.medium)` for trigger; `UISelectionFeedbackGenerator` for threshold tick; `CoreHaptics` for rich build-up patterns (AHAP files).
- **Android**: `HapticFeedbackConstants` for action-oriented consistency; `VibratorManager` + `VibrationEffect.createPredefined` / `createWaveform` for custom patterns. API 30+ adds `GESTURE_START`, `GESTURE_END`, `DRAG_START` for nuanced drag-phase feedback.

**Anti-patterns:**
- Haptic on every render/debounce (buzzing brick).
- Continuous vibration during pull (drains battery, annoys).
- Haptic on completion (redundant with visual refresh).
- Same haptic intensity for all actions (if everything vibrates, nothing stands out).

---

## 7. Specific Recommendations for a Fashion Marketplace Seller Hub

Based on cross-app patterns, flagship patterns, anti-patterns, and platform design languages:

### 7.1 First-viewport composition
- **Task-first, not metrics-first.** Lead with a "Today's Top Tasks" checklist (Etsy pattern) — "2 orders to ship," "1 offer to respond to," "1 listing expiring." The seller opens the app and knows exactly what to do.
- **Below tasks: wallet verdict row.** Available balance as the largest number on screen (fintech pattern). Pending balance below in smaller type. Next payout date inline. This is the "am I okay?" answer.
- **Below wallet: 2-3 headline KPIs with trend.** Total sales (with vs-last-period comparison), orders, conversion rate. Monochrome sparkline (Stripe pattern). Not a wall of charts.
- **Below KPIs: order queue.** Media thumbnails (item image), SLA chip (ship-by date), buyer name. Quick-action: print label, mark shipped. The order queue is the workhorse.

### 7.2 Money/wallet panel
- **Two-state wallet (Vinted pattern)**: Pending and Available, with clear lifecycle timing. "Pending: €247 (available in ~2 days after delivery)." Transparency builds trust.
- **Available balance = dominant number.** Pending = secondary. Next payout date = inline metadata.
- **Withdraw CTA** prominent but not aggressive. Auto-use for purchases optional.
- **No gamified animation on the money number** (Shopify anti-pattern). Plain number, immediately visible.

### 7.3 Orders presentation
- **Media thumbnails** (item cover image) — fashion is visual. Each order row shows the item image, not a generic icon.
- **SLA chips**: "Ships by [date]" with color escalation (neutral → urgent → overdue). Color = status, not decoration (Stripe pattern).
- **Task queue framing**: orders grouped by action needed — "To ship," "To respond," "Completed." Not a flat chronological list.
- **Quick actions inline**: print label, mark shipped, message buyer — without entering order detail.

### 7.4 Analytics summary
- **Monochrome sparkline + period comparison** (Stripe pattern). Current vs last period, always present, smaller text. Answers "is this good?" inline.
- **3-4 metrics max on home**: total sales, orders, conversion rate, AOV. Everything else is one tap deeper.
- **Listing-level engagement funnel** (Poshmark pattern): impressions → clicks → likes → offers per listing, with diagnostic guidance. Fashion sellers need to know *why* a listing isn't selling.
- **YoY toggle** (Etsy pattern) for seasonal fashion businesses.

### 7.5 Quick-access tiles/shortcuts
- **Bottom tab bar with jobs-to-be-done**: Home, Orders, Wallet, Listings, Stats. 5 tabs max.
- **Floating action button** (M3 Expressive toolbar pattern) for "List new item" — the primary creation action.
- **Mobile widgets** (iOS + Android): Counter widget (today's sales, no animation), Insights widget (2-4 metrics). Extend dashboard to OS home screen.

### 7.6 Visual hierarchy
- **Wallet verdict row is the dominant object.** Largest type on screen. Everything else recedes.
- **Tasks second.** Checklist with clear count badges.
- **KPIs third.** Compact, sparklined, compared.
- **Order queue fourth.** Dense but scannable, media-forward.

### 7.7 Spacing rhythm and radius grammar
- **Two radius sizes max** (AGENTS.md §4 Surface Budget): 12pt for cards/metrics, 20pt for the dominant wallet panel. Avatars circular.
- **Flat canvas default** — hairline separators between sections, not grey cards around everything. Card-fatigue is the AI tell.
- **Generous breathing room around the wallet panel** — it's the anchor. Tighter density in the order queue.

### 7.8 Icon treatment and color discipline
- **One icon family, one optical size band.** 20-24pt for navigation, 14-18pt for metadata.
- **Color = status, not decoration** (Stripe pattern). Green = available/succeeded, yellow = pending, red = urgent/failed. No decorative gradients.
- **Monochrome sparklines.** Color on charts only for status escalation.

### 7.9 State coverage
- **Loading**: skeleton matching final silhouette (AGENTS.md §27). Not spinners.
- **Empty**: "Make your first sale" prompt with clear next action (Stripe pattern). Not an apology.
- **Partial**: show what loaded, inline error for what didn't. Don't block the whole screen.
- **Error**: inline error + recovery action, intensity matched to severity (AGENTS.md §27.9).
- **Offline**: last-cached data with stale indicator. Don't show empty state for transient network issues.

### 7.10 Pull-to-refresh haptic
- **Follow AGENTS.md §34.6**: `medium` impact on trigger (release past threshold), no haptic on completion.
- **Threshold tick**: `selection` feedback when pull crosses refresh threshold.
- **Prepare generator on iOS** when drag begins (eliminate latency).
- **Android fallback**: `HapticFeedbackConstants` for consistency; test on budget devices.

### 7.11 Unique patterns to adopt for fashion specifically
- **Sourcing guidance** (Poshmark Sourcing Calendar): what's trending, what to list next. Fashion sellers source constantly — forward-looking guidance is more valuable than backward analytics alone.
- **Listing-level engagement funnel with diagnostic copy**: "Low impressions? Refresh title. Clicks but no offers? Better photos." Fashion listings live or die on photos and title quality.
- **Bundle discount progress banner** (Poshmark): real-time, buyer-facing. Fashion buyers bundle — surface the discount mechanic.
- **Potential revenue metric** (Depop): total you *could* make from live listings. Motivational for fashion sellers with large closets.
- **Seasonal YoY comparison** (Etsy): fashion is seasonal. Compare to same period last year, not just last week.

---

## Summary Table

| App | First-viewport dominant | Money panel | Orders | Analytics | Unique flagship |
|-----|------------------------|-------------|--------|-----------|-----------------|
| eBay | 15-module triage board | Payments tab (payouts, holds) | Fulfillment queue, filters | Performance tab (drill-in charts) | 15-module customizable overview |
| Stripe | 5 numbers + monochrome sparklines | Balances tab (available/pending/transit) | Filterable payment list, global search | Opinionated, period-compared | Opinionated home + status-only color |
| Depop | Stats (sales, potential earnings) | Earnings (managed payments) | Not in Stats | Graph/Table toggle | Potential revenue metric |
| Vinted | Surface-level views/likes | Two-state wallet (pending/available) | Basic status list | Native: minimal; third-party: rich | Transparent escrow lifecycle |
| Shopify | Animated sales total (controversial) | Total/net sales metrics | Task cards on Home | 18 customizable metrics | Mobile widgets + progressive render |
| Square | Gross sales summary | Sales summary + banking | Transaction list | Gauge/bar toggle, metric definitions | Metric definitions + controls blade |
| Etsy | Top Tasks checklist | Finances (limited mobile) | "What to ship, when" | Scrollable metric graphs + YoY | Top Tasks checklist |
| Poshmark | Seller Hub (upcoming): next best action | Redeemable balance | Posh Stats (ship time, cancel rate) | Listing-level funnel + sourcing calendar | Sourcing guidance + engagement funnel |

---

*Research compiled 2026-08-31. All URLs accessed on this date unless otherwise noted.*
