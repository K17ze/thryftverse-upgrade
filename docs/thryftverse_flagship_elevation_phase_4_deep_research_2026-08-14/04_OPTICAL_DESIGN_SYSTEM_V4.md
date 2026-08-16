# Optical design system V4

## Objective

Keep the existing token architecture, but add **optical roles** that determine composition rather than merely dimensions.

## 1. Introduce hierarchy roles

Create explicit roles:

- `mediaHero`
- `editorialSection`
- `identityPrimary`
- `utilitySecondary`
- `transactionDock`
- `evidenceSection`
- `attentionState`
- `inlineControl`
- `navigationChrome`

Components should declare role in code review.

## 2. Radius system

Do not add more radii. Reduce usage.

Recommended role mapping:
- media: category-dependent, often 0–12;
- cards that are true objects: medium;
- bottom sheets: platform/system;
- chips: full only when truly a token;
- content sections: no radius by default;
- list rows: no radius by default.

## 3. Spacing

Current code uses tokens consistently but visual rhythm still needs contrast.

Define three vertical rhythms:
- `tight`: dense rows/chat/filter;
- `standard`: forms/settings/product facts;
- `editorial`: discovery, Galleria, evidence storytelling.

Never use `Space.md` between everything.

## 4. Typography

Create functional typography hierarchy:
- display/editorial;
- commerce price;
- identity;
- section title;
- body;
- secondary/meta;
- numeric/tabular.

A price and a section title should not compete just because both are “subtitle/bold”.

Auction/Co-Own numeric values need tabular figures.

## 5. Hairlines vs cards

Create a flat-row primitive:
- optional leading image/icon;
- primary label;
- optional secondary;
- trailing value/action;
- hairline from text edge, not full width when visually appropriate.

Use it for:
- Settings;
- Connections;
- Wallet activity;
- Seller operations;
- notification preferences;
- evidence lists.

## 6. Media geometry contract

Every media component should know:
- intrinsic ratio;
- target role;
- crop focal point;
- minimum/maximum height;
- fallback geometry;
- whether a video is allowed;
- whether zoom/fullscreen exists.

Do not default all unknown marketplace images to the same ratio where the source can provide dimensions.

## 7. Glass/material

Restrict Liquid Glass to:
- tab/nav bar;
- temporary floating creator controls over media;
- transient toolbar over media.

Use standard background/surface inside content.

## 8. Shadows

No generic card shadow system.

Elevation only for:
- floating toolbar;
- sheet;
- drag target;
- detached navigation chrome.

In dark mode prefer contrast/edge/blur rather than stronger shadow.

## 9. Border discipline

If a surface already differs by:
- background,
- spacing,
- or elevation,

it usually does not need a border as well.

Avoid `background + border + radius + icon circle` on the same small component.

## 10. Screenshot calibration matrix

For each flagship route capture:
- iPhone compact current OS;
- iPhone Pro Max class;
- small Android (~360dp);
- Pixel-class Android;
- tablet/foldable medium;
- light;
- dark;
- large text;
- Reduce Motion;
- Reduce Transparency/high contrast where supported.

Optical acceptance is screenshot-based, not token-lint-based.
