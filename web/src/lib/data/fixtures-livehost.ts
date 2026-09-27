/**
 * Live-host fixtures — the seeded viewer chatter for session-scoped demo
 * shows authored from /live/create. Separate file (fixtures-media.ts is
 * owned by another department); same LiveChatLine contract so host
 * surfaces speak the viewer grammar. Lines are written to work for any
 * seller closet — sizes, prices, shipping — never naming a specific item.
 */

import type { LiveChatLine } from './fixtures-media';

export const HOST_CHAT_LINES: LiveChatLine[] = [
  { id: 'hc1', user: 'mia.k', text: 'hiii, what are we starting with?' },
  { id: 'hc2', user: 'thriftgoblin', text: 'love the cover pick already' },
  { id: 'hc3', user: 'jodielouise', text: 'can you hold items to the end of the show?' },
  { id: 'hc4', user: 'benny.h', text: 'condition notes on the pinned pieces?' },
  { id: 'hc5', user: 'nia.v', text: 'do you ship tracked?' },
  { id: 'hc6', user: 'koko', text: 'pinning the next one pls' },
  { id: 'hc7', user: 'sandra_m', text: 'price check on the second item?' },
  { id: 'hc8', user: 'felixr', text: 'any bundles if i take two?' },
  { id: 'hc9', user: 'woolandworn', text: 'measurements when you get a sec' },
  { id: 'hc10', user: 'retro.rick', text: 'bagged one — that was quick' },
  { id: 'hc11', user: 'petit.pois', text: 'will these be relisted after the show?' },
  { id: 'hc12', user: 'denim.dan', text: 'great pace tonight, easy to keep up' },
];
