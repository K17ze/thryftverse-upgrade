# Phase 4 master flagship diagnosis

## The app has moved out of the “missing product” phase

The current codebase contains many of the right primitives:

- media-first detail surfaces;
- masonry;
- Poster and Look product separation;
- seller trust;
- search and visual search;
- server-driven auction facets;
- Co-Own due diligence;
- contextual chat/listing state;
- provider Connections;
- owner/public profile separation;
- wallet task separation;
- native-ish glass navigation;
- accessibility states;
- caching and truthful data fallbacks.

Yet it can still look less “finished” than Pinterest, Instagram, Depop or eBay because **feature completeness is not the same as visual authorship**.

The current recurring issue is that implementation teams have made each capability visible. Flagship products do the opposite: they decide which capability should be invisible until the exact moment it becomes relevant.

## Core Phase 4 diagnosis

### 1. Feature inventory is leaking into the UI
Symptoms:
- four-way Explore segment plus global search plus visual-search button;
- Closet tabs, sorting, search, brand filters, price-drop filter and stats;
- five Auction header actions;
- Profile completion + growth + portfolio + social identity;
- Inbox category proliferation;
- Notifications filters plus sections plus aggregation;
- Seller Analytics hero + period chips + metric-card grid + performer cards;
- Connections hero + management card + providers.

The user experiences implementation taxonomy rather than one coherent product thought.

### 2. The surface grammar is too uniform
A generated-looking app often repeats:
- rounded rectangle;
- icon inside small colored circle;
- heading;
- helper text;
- badge;
- next rounded rectangle.

When that grammar appears in settings, analytics, product details, wallet, seller tools and agent tools, departments lose their own identity.

### 3. Too many controls are equally styled
If Search, Create, Seller, Activity and Filter are all header actions, the interface avoids making a decision.

Flagship hierarchy needs:
- one dominant action;
- one secondary action;
- overflow for the rest.

### 4. Copy is over-explanatory
Implementation-oriented copy often narrates system state:
- “syncing”;
- “processing”;
- “quality”;
- “AI suggestions”;
- “advanced”;
- “market depth”;
- “seller analytics”.

Human product copy should describe the user’s object or next choice.

### 5. The app sometimes uses design-system tokens instead of composition
Tokens create consistency. They do not create art direction.

Pinterest quality comes from:
- image selection/crop;
- row rhythm;
- asymmetric density;
- scale contrast;
- interruption points.

Instagram quality comes from:
- predictable navigation;
- content-first geometry;
- highly selective chrome;
- interaction continuity.

Marketplace quality comes from:
- truthful structured product facts;
- confidence at the exact buying moment;
- efficient sell flow.

### 6. Motion is often attached to components rather than meaning
A fade/spring on every section is not premium.

Motion must answer:
- What moved?
- Where did it come from?
- What changed?
- What should I attend to?

## Phase 4 quality target

The correct end-state is not “more premium components.”

It is:

> **Fewer visible components, stronger content, clearer states, more confident geometry, and richer contextual behavior.**

## Proposed quality gates

A screen cannot be called flagship until:

- first viewport has one obvious subject;
- first viewport has no more than 2 primary competing actions;
- content/chrome ratio is intentionally specified;
- no permanent chip row exists without a repeated real task;
- no section is boxed simply because it is a section;
- labels do not explain controls whose icons/placement already do;
- states are truthful and calm;
- every overlay has an explicit dismissal/gesture model;
- reduced motion/transparency remain coherent;
- compact Android and current iOS screenshots pass optical review;
- loading skeleton matches final geometry;
- empty/error state preserves page identity;
- analytics/debug/internal stages stay out of consumer chrome.
