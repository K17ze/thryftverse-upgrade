/**
 * Syndicate fixtures — seeded group-buy pools over Co-Own assets.
 * Covers every state the surfaces must render: a pool the viewer is in,
 * a joinable open pool, a member-capped pool, a fully funded pool, and
 * an executed pool with a complete order history.
 */

import type { Syndicate, SyndicateMember, SyndicateExecution } from '@/lib/contracts/syndicate';
import { CURRENT_USER } from './fixtures';

const img = (id: string, w = 200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// Member identities mirror the co-own fixture cast so the pools read as
// the same community. Viewer detection keys on userId 'me' (CURRENT_USER).
const MARIE = { userId: 'u1', username: 'mariefullery', displayName: 'Marie Fullery', avatar: img('photo-1494790108377-be9c29b29330') };
const SCOTT = { userId: 'u2', username: 'scott_art', displayName: 'Scott Art', avatar: img('photo-1500648767791-00dcc994a43e') };
const DAN = { userId: 'u3', username: 'dankdunksuk', displayName: 'Dan K', avatar: img('photo-1507003211169-0a1dd7228f2d') };
const ELLA = { userId: 'u6', username: 'ellawears', displayName: 'Ella Wears', avatar: img('photo-1438761681033-6461ffad8d80') };
const LUCY = { userId: 'u7', username: 'lucygibson94', displayName: null, avatar: img('photo-1544005313-94ddf0286df2') };
const ARCHIVE = { userId: 'u8', username: 'archive.thread', displayName: 'Archive Thread', avatar: img('photo-1531123897727-8f129e1688ce') };
const VIEWER = { userId: CURRENT_USER.id, username: CURRENT_USER.username, displayName: 'You', avatar: CURRENT_USER.avatar };

function member(
  syndicateId: string,
  index: number,
  who: { userId: string; username: string; displayName: string | null; avatar: string | null },
  role: SyndicateMember['role'],
  contributionGbp: number,
  joinedAt: string,
): SyndicateMember {
  return { id: `${syndicateId}-m${index}`, role, contributionGbp, joinedAt, ...who };
}

function contribution(
  syndicateId: string,
  index: number,
  username: string,
  amountGbp: number,
  at: string,
): SyndicateExecution {
  return {
    id: `${syndicateId}-e${index}`,
    kind: 'contribution',
    actorUsername: username,
    amountGbp,
    units: null,
    note: null,
    at,
  };
}

export const SYNDICATES: Syndicate[] = [
  // ── Open, viewer is a member ───────────────────────────────────────
  // £4,350 pooled of £5,700 (40 units × £142.50) — four members in, room
  // for four more and £1,350 left to fund.
  {
    id: 'syn-01',
    name: 'Birkin Circle',
    assetId: 'co1',
    organizerId: MARIE.userId,
    organizerUsername: MARIE.username,
    memberCap: 8,
    unitsTarget: 40,
    minContributionGbp: 100,
    maxContributionGbp: 1500,
    termsNote: 'Holding to spring 2027 resale window. Exits decided by member vote.',
    status: 'open',
    members: [
      member('syn-01', 1, MARIE, 'organizer', 1500, '2026-09-14T11:20:00Z'),
      member('syn-01', 2, LUCY, 'member', 1200, '2026-09-15T09:05:00Z'),
      member('syn-01', 3, SCOTT, 'member', 900, '2026-09-16T17:40:00Z'),
      member('syn-01', 4, VIEWER, 'member', 750, '2026-09-18T13:10:00Z'),
    ],
    executions: [
      contribution('syn-01', 1, MARIE.username, 1500, '2026-09-14T11:20:00Z'),
      contribution('syn-01', 2, LUCY.username, 1200, '2026-09-15T09:05:00Z'),
      contribution('syn-01', 3, SCOTT.username, 900, '2026-09-16T17:40:00Z'),
      contribution('syn-01', 4, VIEWER.username, 750, '2026-09-18T13:10:00Z'),
    ],
    createdAt: '2026-09-14T11:05:00Z',
  },

  // ── Open and joinable ──────────────────────────────────────────────
  // £2,850 of £4,710 (60 units × £78.50) — three of ten seats taken.
  {
    id: 'syn-02',
    name: 'Archive Grail Pool',
    assetId: 'co7',
    organizerId: SCOTT.userId,
    organizerUsername: SCOTT.username,
    memberCap: 10,
    unitsTarget: 60,
    minContributionGbp: 150,
    maxContributionGbp: 1600,
    termsNote: 'Buying during the initial offering. Custody stays with the issuer vault.',
    status: 'open',
    members: [
      member('syn-02', 1, SCOTT, 'organizer', 1400, '2026-09-19T10:00:00Z'),
      member('syn-02', 2, ARCHIVE, 'member', 800, '2026-09-20T08:30:00Z'),
      member('syn-02', 3, DAN, 'member', 650, '2026-09-22T19:15:00Z'),
    ],
    executions: [
      contribution('syn-02', 1, SCOTT.username, 1400, '2026-09-19T10:00:00Z'),
      contribution('syn-02', 2, ARCHIVE.username, 800, '2026-09-20T08:30:00Z'),
      contribution('syn-02', 3, DAN.username, 650, '2026-09-22T19:15:00Z'),
    ],
    createdAt: '2026-09-19T09:40:00Z',
  },

  // ── Open but member-capped ─────────────────────────────────────────
  // Five of five seats taken, £2,400 of £2,700 pooled — the cap gates
  // joining; existing members can still top up the last £300.
  {
    id: 'syn-03',
    name: 'Nike Mag Consortium',
    assetId: 'co4',
    organizerId: ELLA.userId,
    organizerUsername: ELLA.username,
    memberCap: 5,
    unitsTarget: 50,
    minContributionGbp: 200,
    maxContributionGbp: 1000,
    termsNote: null,
    status: 'open',
    members: [
      member('syn-03', 1, ELLA, 'organizer', 700, '2026-09-10T14:00:00Z'),
      member('syn-03', 2, MARIE, 'member', 500, '2026-09-11T09:45:00Z'),
      member('syn-03', 3, ARCHIVE, 'member', 450, '2026-09-12T16:20:00Z'),
      member('syn-03', 4, SCOTT, 'member', 400, '2026-09-13T12:00:00Z'),
      member('syn-03', 5, LUCY, 'member', 350, '2026-09-15T18:30:00Z'),
    ],
    executions: [
      contribution('syn-03', 1, ELLA.username, 700, '2026-09-10T14:00:00Z'),
      contribution('syn-03', 2, MARIE.username, 500, '2026-09-11T09:45:00Z'),
      contribution('syn-03', 3, ARCHIVE.username, 450, '2026-09-12T16:20:00Z'),
      contribution('syn-03', 4, SCOTT.username, 400, '2026-09-13T12:00:00Z'),
      contribution('syn-03', 5, LUCY.username, 350, '2026-09-15T18:30:00Z'),
    ],
    createdAt: '2026-09-10T13:30:00Z',
  },

  // ── Fully funded ───────────────────────────────────────────────────
  // £5,040 of £5,040 (24 units × £210) — pool complete, buy queued.
  {
    id: 'syn-04',
    name: 'Kelly Fund',
    assetId: 'co8',
    organizerId: MARIE.userId,
    organizerUsername: MARIE.username,
    memberCap: 4,
    unitsTarget: 24,
    minContributionGbp: 500,
    maxContributionGbp: 1500,
    termsNote: 'Full set buy — box, dust bag and receipt held in Freeport custody.',
    status: 'open',
    members: [
      member('syn-04', 1, MARIE, 'organizer', 1500, '2026-09-08T10:10:00Z'),
      member('syn-04', 2, LUCY, 'member', 1300, '2026-09-09T15:30:00Z'),
      member('syn-04', 3, SCOTT, 'member', 1240, '2026-09-11T08:50:00Z'),
      member('syn-04', 4, ELLA, 'member', 1000, '2026-09-12T20:05:00Z'),
    ],
    executions: [
      contribution('syn-04', 1, MARIE.username, 1500, '2026-09-08T10:10:00Z'),
      contribution('syn-04', 2, LUCY.username, 1300, '2026-09-09T15:30:00Z'),
      contribution('syn-04', 3, SCOTT.username, 1240, '2026-09-11T08:50:00Z'),
      contribution('syn-04', 4, ELLA.username, 1000, '2026-09-12T20:05:00Z'),
      {
        id: 'syn-04-e5',
        kind: 'note',
        actorUsername: null,
        amountGbp: null,
        units: null,
        note: 'Pool target reached — the pooled buy is queued.',
        at: '2026-09-12T20:05:00Z',
      },
    ],
    createdAt: '2026-09-08T09:55:00Z',
  },

  // ── Executed, viewer is a member ───────────────────────────────────
  // The buy settled: 30 units at £96.40, allocated pro-rata.
  {
    id: 'syn-05',
    name: 'Submariner Desk',
    assetId: 'co2',
    organizerId: DAN.userId,
    organizerUsername: DAN.username,
    memberCap: 6,
    unitsTarget: 30,
    minContributionGbp: 250,
    maxContributionGbp: 1200,
    termsNote: 'Long hold — servicing costs split pro-rata each year.',
    status: 'executed',
    members: [
      member('syn-05', 1, DAN, 'organizer', 900, '2026-08-28T11:00:00Z'),
      member('syn-05', 2, VIEWER, 'member', 700, '2026-08-29T14:25:00Z'),
      member('syn-05', 3, ELLA, 'member', 700, '2026-08-30T09:10:00Z'),
      member('syn-05', 4, ARCHIVE, 'member', 592, '2026-09-01T17:45:00Z'),
    ],
    executions: [
      contribution('syn-05', 1, DAN.username, 900, '2026-08-28T11:00:00Z'),
      contribution('syn-05', 2, VIEWER.username, 700, '2026-08-29T14:25:00Z'),
      contribution('syn-05', 3, ELLA.username, 700, '2026-08-30T09:10:00Z'),
      contribution('syn-05', 4, ARCHIVE.username, 592, '2026-09-01T17:45:00Z'),
      {
        id: 'syn-05-e5',
        kind: 'purchase',
        actorUsername: null,
        amountGbp: 2892,
        units: 30,
        note: 'Pool buy executed — 30 units at £96.40, allocated pro-rata.',
        at: '2026-09-01T18:00:00Z',
      },
    ],
    createdAt: '2026-08-28T10:40:00Z',
  },
];

export function syndicateById(id: string): Syndicate | undefined {
  return SYNDICATES.find((s) => s.id === id);
}
