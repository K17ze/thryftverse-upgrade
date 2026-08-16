# Settings, Edit Profile and account surfaces

## Code surfaces inspected / affected

- `frontend/src/screens/SettingsScreen.tsx`
- `frontend/src/screens/EditProfileScreen.tsx`
- `frontend/src/components/settings/SettingsSection.tsx`
- `frontend/src/components/settings/SettingsRow.tsx`

## Current diagnosis


Settings has good search and domain coverage but the route metadata exposes a very large number of leaf destinations at the root. This risks making settings feel like the app's sitemap.

The supplied reference uses flat grouped rows, strong section headings, hairline separation and a single clear Save action.


## User psychology / product job


Settings psychology is retrieval, not discovery.

Users arrive with a question:
- privacy?
- account?
- payment?
- notification?
- appearance?

Hierarchy should reduce scanning.


## Flagship target composition


Top-level groups:
1. Account & security
2. Privacy & safety
3. Buying & payments
4. Selling & payouts
5. Notifications
6. Personalisation & accessibility
7. Co-Own
8. Agents & connections
9. Help & about

Leaf settings move one level down when the root would otherwise exceed a comfortable scan.


## Detailed implementation map


1. Keep Settings search.
2. Search can expose deep leaf destinations even if the root doesn't.
3. Remove hero cards from Settings unless identity/account status requires action.
4. Settings row = label + optional value + chevron/toggle; flat.
5. Group headers use typography/space, not card wrappers.
6. Dangerous Account Control options remain nested and separated.
7. Connections/Agents live as a normal product group, but provider secrets are never previewed beyond masked value.
8. Runtime developer tools remain gated.
9. Edit Profile:
   - avatar/cover editing in explicit media zone;
   - form labels sentence case;
   - Save in header;
   - no duplicate settings entry;
   - field validation inline.
10. Theme/language/currency pickers use platform sheets/menus and avoid full custom card stacks.


## Micro-detail pass


- Divider starts aligned with label, not necessarily edge-to-edge.
- Section gap larger than row gap.
- Toggles only for binary immediate settings; a chevron for multi-option settings.
- Do not display an icon for every row.


## Acceptance / screenshot QA


Pass:
- ordinary user can scan root settings in <10 seconds;
- root contains no more than ~9 groups;
- settings screenshots visually resemble flat reference more than dashboard cards.


## Reference crosswalk


- User-supplied Settings reference.
- Apple current form/search conventions.
