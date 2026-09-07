# Research Ledger — Flagship Seller Suite Campaign

**Access date:** 2026-06-09
**Campaign:** flagship-seller-suite-2026-06

---

## Source classes searched

1. Official competitor pages / help centers / docs
2. App-store listings / changelogs
3. Engineering and design-system documentation
4. Public repositories / issues / discussions
5. HIG / Material / accessibility standards
6. Independent UX teardowns (Mobbin, Page Flows)
7. Community reviews and reports

---

## Competitor research

### Depop — Seller Hub / Dashboard
- **Source:** Mobbin Depop seller hub screenshots (accessed 2026-06-09)
- **Observation:** Depop seller hub leads with a single financial summary (balance available to payout), then a flat list of recent activity. No 2x2 grid. Items to ship are surfaced as actionable rows, not cards. Seller profile is media-anchored (shop cover + avatar).
- **Why it works:** One dominant number (available balance) + flat actionable list = clear reading order. The user knows exactly what to do next.
- **Claim type:** Direct observation (Mobbin screenshots)

### Depop — Listing / Upload flow
- **Source:** Mobbin Depop listing flow + Depop help center listing guide
- **Observation:** Photo-first flow. First screen is camera/gallery with large photo area. Details form is secondary, fields are flat (no card nesting). Price field is prominent. Category is a bottom-sheet picker, not chips. No "specialties" or decorative tags.
- **Why it works:** Media is the product. The form is minimal and honest.
- **Claim type:** Direct observation

### Vinted — Seller Analytics / Sales Dashboard
- **Source:** Vinted help center "View your selling statistics" + community screenshots
- **Observation:** Vinted shows a simple stats page: views, favorites, sold count for a selected period. No executive dashboard. No funnel. No synthetic data. Period selector is a simple segmented control.
- **Why it works:** Honest, minimal metrics. No fabricated depth.
- **Claim type:** Primary documentation + community screenshots

### Vestiaire Collective — Seller Workflow
- **Source:** Vestiaire seller help center + community teardowns
- **Observation:** Vestiaire emphasizes authentication and trust. Seller dashboard shows pending items (in authentication, shipped, delivered) as status rows. Earnings shown as a single line with next payout date. No multi-card executive grid.
- **Why it works:** Status-driven task queue, not metric dashboard.
- **Claim type:** Primary documentation + secondary analysis

### Instagram — Edit Profile (Android)
- **Source:** Page Flows Instagram Android edit-profile + Mobbin
- **Observation:** Single flat form. Name, username, website, bio. Profile photo at top with a small "Change photo" text link (transparent hit target, not a circular button). No specialties, no decorative tags, no "passport" concept. Save is a top-right text action.
- **Why it works:** Minimal, honest, no decorative chrome. The form is the screen.
- **Claim type:** Direct observation (Page Flows + Mobbin)

### General marketplace patterns
- **Source:** Cross-competitor synthesis
- **Observation:** Best-in-class seller surfaces (Depop, Vinted, Grailed) share: (1) one dominant metric or task, (2) flat rows for secondary information, (3) media-anchored identity, (4) honest empty/loading states, (5) no fabricated trust badges.
- **Claim type:** Inference from multiple direct observations

---

## Design standards consulted

- **Apple HIG (2025):** Touch targets 44pt minimum. Dynamic Type support. Reduced motion respect.
- **Material Design 3:** Touch targets 48dp. Accessible labels on interactive elements.
- **WCAG 2.2:** Color contrast 4.5:1 for text. No color-only status communication.
- **Stripe / Linear design systems:** Single dominant panel, flat rows, restrained chrome.

---

## Internal audit results (2026-06-09)

Three parallel read-only audits completed:

| Surface | Agent | P0 | P1 | P2 |
|---------|-------|----|----|-----|
| Analytics | 8603f704 | 3 | 4 | 2 |
| SellerHub | 88882242 | 3 | 4 | 0 |
| EditProfile | df5eef15 | 4 | 4 | 0 |
| SharedUI | (derived) | 0 | 1 | 2 |
| **Total** | | **11** | **12** | **3** |

Full findings in `.flagship/gap-registry.json`.

---

## Research saturation assessment

- Competitor patterns: **saturated** for Depop, Vinted, Vestiaire, Instagram edit-profile.
- Design standards: **saturated** for HIG, Material, WCAG.
- Internal audit: **complete** for the five target surfaces.
- Backend contracts: **partial** — need to verify dailyBreakdown, offerCount, priceAdjustments, specialties fields before implementation.

No additional research is required before the spec approval gate. Targeted backend-contract verification will occur during implementation planning.
