// Streaming discovery tests — cover the behaviours added by the scheduled
// shows / discovery enrichment / go-live fan-out pass:
//   - POST /streaming/sessions accepts scheduledStartAt, defers provider room
//     creation for future-dated shows, and echoes scheduledStartAt
//   - GET /streaming/sessions surfaces upcoming scheduled sessions (soonest
//     first) and enriches every card with host identity / verified badge /
//     current-lot fields
//   - POST /sessions/:roomId/start fans out live_started to followers ∪
//     reminder-holders (deduped, host excluded) with stable idempotency keys
//   - POST/DELETE /sessions/:sessionId/remind manage reminder opt-ins
//
// Same mock-harness pattern as streamingHardening.test.ts: node:test, an ESM
// load hook stubbing lib/realtime, and a mock app/db capturing queries.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const loaderSource = [
  'export async function load(url, context, nextLoad) {',
  "  if (url.includes('/lib/realtime')) {",
  '    return {',
  '      format: "module",',
  "      source: 'export async function publishRealtimeEvent() { return 0; }',",
  '      shortCircuit: true,',
  '    };',
  '  }',
  '  return nextLoad(url, context);',
  '}',
].join('\n');
register(
  'data:text/javascript;base64,' + Buffer.from(loaderSource).toString('base64'),
  import.meta.url,
);

const { registerStreamingRoutes } = await import('../routes/streaming.js');
const { getStreamProvider } = await import('../lib/streaming/index.js');

// ── Mock Fastify / pg harness ────────────────────────────────────────────────

interface CapturedRequest {
  body: unknown;
  params: Record<string, string>;
  query?: Record<string, string>;
  authUser?: { userId?: string; role?: string };
}

interface MockReply {
  code: (c: number) => MockReply;
  _sentCode: number;
}

type RouteHandler = (
  request: CapturedRequest,
  reply: MockReply,
) => Promise<unknown> | unknown;

function createMockApp() {
  // Keyed by "METHOD path" so POST/DELETE on the same path don't collide.
  const handlers = new Map<string, RouteHandler>();
  const capture = (
    method: string,
    path: string,
    optsOrHandler: unknown,
    maybeHandler?: RouteHandler,
  ) => {
    handlers.set(`${method} ${path}`, maybeHandler ?? (optsOrHandler as RouteHandler));
  };
  const app = {
    post: (p: string, o: unknown, h?: RouteHandler) => capture('POST', p, o, h),
    get: (p: string, o: unknown, h?: RouteHandler) => capture('GET', p, o, h),
    put: (p: string, o: unknown, h?: RouteHandler) => capture('PUT', p, o, h),
    delete: (p: string, o: unknown, h?: RouteHandler) => capture('DELETE', p, o, h),
    patch: (p: string, o: unknown, h?: RouteHandler) => capture('PATCH', p, o, h),
  };
  return {
    app: app as unknown as Parameters<typeof registerStreamingRoutes>[0]['app'],
    handlers,
  };
}

function createMockReply(): MockReply {
  const reply: MockReply = { _sentCode: 200, code: () => reply };
  reply.code = (c: number) => {
    reply._sentCode = c;
    return reply;
  };
  return reply;
}

const SESSION_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'sess-1',
  title: 'Live auction',
  host_user_id: 'host-1',
  status: 'created',
  room_url: 'ws://localhost:7880',
  recording_url: null,
  recording_enabled: false,
  max_viewers: 100,
  viewer_count: 0,
  metadata: {},
  created_at: new Date().toISOString(),
  started_at: null,
  ended_at: null,
  scheduled_start_at: null,
  ...overrides,
});

type NotificationCall = {
  userId: string;
  title: string;
  body: string;
  eventType?: string;
  actorUserId?: string;
  route?: Record<string, unknown>;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

function createMockDb(options: {
  sessions?: Record<string, unknown>[];
  endedRows?: Record<string, unknown>[];
  scheduledRows?: Record<string, unknown>[];
  follows?: { follower_id: string; following_id: string }[];
  reminders?: { session_id: string; user_id: string }[];
  users?: Record<string, { username: string; avatar: string | null }>;
  enrichmentRows?: Record<string, unknown>[];
}) {
  const queryCalls: { sql: string; args: unknown[] }[] = [];
  const reminders = [...(options.reminders ?? [])];
  const db = {
    queryCalls,
    reminders,
    query: async (sql: string, args: unknown[] = []) => {
      queryCalls.push({ sql, args });

      if (sql.includes('INSERT INTO live_shopping_sessions')) {
        // Reflect the persisted values back like INSERT ... RETURNING would.
        return {
          rows: [
            {
              id: args[0],
              title: args[1],
              host_user_id: args[2],
              status: args[3],
              room_url: args[4],
              recording_url: null,
              recording_enabled: args[5],
              max_viewers: args[6],
              viewer_count: args[7],
              metadata: {},
              created_at: args[8],
              started_at: args[9],
              ended_at: args[10],
              scheduled_start_at: args[11],
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO live_session_reminders')) {
        // Model ON CONFLICT (session_id, user_id) DO NOTHING.
        if (
          !reminders.some(
            (r) => r.session_id === args[0] && r.user_id === args[1],
          )
        ) {
          reminders.push({ session_id: args[0] as string, user_id: args[1] as string });
        }
        return { rows: [] };
      }
      if (sql.includes('DELETE FROM live_session_reminders')) {
        const idx = reminders.findIndex(
          (r) => r.session_id === args[0] && r.user_id === args[1],
        );
        if (idx >= 0) reminders.splice(idx, 1);
        return { rows: [] };
      }
      if (sql.includes('FROM live_session_reminders')) {
        return {
          rows: reminders
            .filter((r) => r.session_id === args[0])
            .map((r) => ({ user_id: r.user_id })),
        };
      }
      if (sql.includes('FROM user_follows')) {
        return {
          rows: (options.follows ?? []).filter((f) => f.following_id === args[0]),
        };
      }
      if (sql.includes('FROM users WHERE id')) {
        const user = options.users?.[args[0] as string];
        return { rows: user ? [user] : [] };
      }
      // Discovery enrichment batch query (marker: the users join on host id).
      if (sql.includes('LEFT JOIN users u ON u.id = s.host_user_id')) {
        const ids = (args[0] as string[]) ?? [];
        return {
          rows: (options.enrichmentRows ?? []).filter((r) =>
            ids.includes(r.session_id as string),
          ),
        };
      }
      if (sql.includes('scheduled_start_at IS NOT NULL')) {
        // Model ORDER BY scheduled_start_at ASC.
        return {
          rows: [...(options.scheduledRows ?? [])].sort((a, b) =>
            String(a.scheduled_start_at).localeCompare(String(b.scheduled_start_at)),
          ),
        };
      }
      if (sql.includes("status = 'ended'")) {
        return { rows: options.endedRows ?? [] };
      }
      if (sql.includes('UPDATE live_shopping_sessions')) {
        return { rows: [] };
      }
      if (sql.includes('FROM live_shopping_sessions')) {
        if (sql.includes('ANY($1)')) {
          const ids = (args[0] as string[]) ?? [];
          return {
            rows: (options.sessions ?? []).filter((s) => ids.includes(s.id as string)),
          };
        }
        const row = (options.sessions ?? []).find((s) => s.id === args[0]);
        return { rows: row ? [row] : [] };
      }
      return { rows: [] };
    },
    connect: async () => {
      throw new Error('not needed for these tests');
    },
  };
  return db;
}

function setup(
  db: ReturnType<typeof createMockDb>,
  notifications?: NotificationCall[],
) {
  const { app, handlers } = createMockApp();
  registerStreamingRoutes({
    app,
    db: db as unknown as Parameters<typeof registerStreamingRoutes>[0]['db'],
    createApiError: ((code: string, message: string) =>
      Object.assign(new Error(message), { code })) as Parameters<
      typeof registerStreamingRoutes
    >[0]['createApiError'],
    resolveAuthenticatedUserId: ((request: CapturedRequest) =>
      request.authUser?.userId ?? 'user-1') as Parameters<
      typeof registerStreamingRoutes
    >[0]['resolveAuthenticatedUserId'],
    queueUserNotification: (async (input: NotificationCall) => {
      notifications?.push(input);
      return `evt_${notifications?.length ?? 0}`;
    }) as Parameters<typeof registerStreamingRoutes>[0]['queueUserNotification'],
  });
  return handlers;
}

async function invoke(
  handlers: Map<string, RouteHandler>,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  request: Partial<CapturedRequest> & { params?: Record<string, string> },
) {
  const handler = handlers.get(`${method} ${path}`);
  assert.ok(handler, `route ${method} ${path} was not registered`);
  const reply = createMockReply();
  const result = await handler(
    { body: {}, params: {}, ...request } as CapturedRequest,
    reply,
  );
  return { result, reply };
}

/** Poll until the fire-and-forget fan-out delivers `expected` notifications. */
async function waitForNotifications(calls: NotificationCall[], expected: number) {
  for (let i = 0; i < 200 && calls.length < expected; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// ── Scheduled sessions ───────────────────────────────────────────────────────

describe('POST /streaming/sessions with scheduledStartAt', () => {
  it('persists scheduledStartAt and defers provider room creation', async () => {
    const db = createMockDb({});
    const handlers = setup(db);

    const scheduledStartAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { result, reply } = await invoke(handlers, 'POST', '/streaming/sessions', {
      body: { title: 'Saturday drop', scheduledStartAt },
      authUser: { userId: 'host-sched', role: 'seller' },
    });

    assert.equal(reply._sentCode, 201);
    const body = result as {
      ok: boolean;
      session: { roomId: string; scheduledStartAt?: string; status: string };
    };
    assert.equal(body.ok, true);
    assert.equal(body.session.status, 'created');
    assert.equal(body.session.scheduledStartAt, scheduledStartAt);

    // No provider room exists yet — it is created lazily at /start.
    const provider = getStreamProvider();
    assert.equal(await provider.getStream(body.session.roomId), null);
  });

  it('rejects a past scheduledStartAt', async () => {
    const db = createMockDb({});
    const handlers = setup(db);

    await assert.rejects(
      invoke(handlers, 'POST', '/streaming/sessions', {
        body: {
          title: 'Past show',
          scheduledStartAt: new Date(Date.now() - 60_000).toISOString(),
        },
        authUser: { userId: 'host-sched', role: 'seller' },
      }),
    );
  });

  it('still creates the provider room immediately for unscheduled sessions', async () => {
    const db = createMockDb({});
    const handlers = setup(db);

    const { result, reply } = await invoke(handlers, 'POST', '/streaming/sessions', {
      body: { title: 'Going live now' },
      authUser: { userId: 'host-now', role: 'seller' },
    });

    assert.equal(reply._sentCode, 201);
    const body = result as { session: { roomId: string; scheduledStartAt?: string } };
    assert.equal(body.session.scheduledStartAt, undefined);
    const provider = getStreamProvider();
    assert.ok(await provider.getStream(body.session.roomId));
  });
});

describe('GET /streaming/sessions', () => {
  it('includes upcoming scheduled sessions ordered by scheduledStartAt', async () => {
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const sooner = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const db = createMockDb({
      scheduledRows: [
        SESSION_ROW({ id: 'sess-later', scheduled_start_at: later }),
        SESSION_ROW({ id: 'sess-sooner', scheduled_start_at: sooner }),
      ],
    });
    const handlers = setup(db);

    const { result } = await invoke(handlers, 'GET', '/streaming/sessions', {
      query: { limit: '10' },
    });
    const body = result as {
      ok: boolean;
      sessions: Array<{ roomId: string; scheduledStartAt?: string }>;
    };
    assert.equal(body.ok, true);
    assert.equal(body.sessions.length, 2);
    assert.equal(body.sessions[0].scheduledStartAt, sooner);
    assert.equal(body.sessions[1].scheduledStartAt, later);
  });

  it('enriches sessions with host + current-lot discovery fields', async () => {
    const ended = SESSION_ROW({
      id: 'sess-ended-1',
      status: 'ended',
      ended_at: new Date().toISOString(),
    });
    const db = createMockDb({
      endedRows: [ended],
      enrichmentRows: [
        {
          session_id: 'sess-ended-1',
          host_username: 'vintage_vic',
          host_avatar_url: 'https://cdn.example.com/avatars/vic.png',
          host_verified: true,
          current_lot_title: 'Y2K Utility Bag',
          current_lot_price_major: '89.00',
          current_lot_currency: 'GBP',
          thumbnail_url: 'https://cdn.example.com/listings/bag-1.jpg',
        },
      ],
    });
    const handlers = setup(db);

    const { result } = await invoke(handlers, 'GET', '/streaming/sessions', {
      query: { limit: '10' },
    });
    const body = result as {
      ok: boolean;
      sessions: Array<Record<string, unknown>>;
    };
    const session = body.sessions.find((s) => s.roomId === 'sess-ended-1');
    assert.ok(session, 'ended session must appear in the list');
    assert.equal(session.hostUsername, 'vintage_vic');
    assert.equal(session.hostAvatarUrl, 'https://cdn.example.com/avatars/vic.png');
    assert.equal(session.hostVerified, true);
    assert.equal(session.currentLotTitle, 'Y2K Utility Bag');
    assert.equal(session.currentLotPriceMinor, 8900);
    assert.equal(session.currentLotCurrency, 'GBP');
    assert.equal(session.thumbnailUrl, 'https://cdn.example.com/listings/bag-1.jpg');
  });

  it('emits null enrichment fields when no enrichment row exists', async () => {
    const ended = SESSION_ROW({ id: 'sess-ended-2', status: 'ended' });
    const db = createMockDb({ endedRows: [ended] });
    const handlers = setup(db);

    const { result } = await invoke(handlers, 'GET', '/streaming/sessions', {
      query: { limit: '10' },
    });
    const body = result as { sessions: Array<Record<string, unknown>> };
    const session = body.sessions.find((s) => s.roomId === 'sess-ended-2');
    assert.ok(session);
    assert.equal(session.hostUsername, null);
    assert.equal(session.hostVerified, false);
    assert.equal(session.currentLotTitle, null);
    assert.equal(session.thumbnailUrl, null);
  });
});

// ── Go-live fan-out ──────────────────────────────────────────────────────────

describe('POST /streaming/sessions/:roomId/start live_started fan-out', () => {
  it('notifies followers and reminder-holders, deduped, host excluded', async () => {
    const notifications: NotificationCall[] = [];
    const sessionId = 'sess-fanout';
    const db = createMockDb({
      sessions: [
        SESSION_ROW({ id: sessionId, host_user_id: 'host-f', title: 'Friday drop' }),
      ],
      follows: [
        { follower_id: 'fan-1', following_id: 'host-f' },
        { follower_id: 'fan-2', following_id: 'host-f' },
        { follower_id: 'fan-other', following_id: 'someone-else' },
      ],
      reminders: [
        { session_id: sessionId, user_id: 'fan-2' }, // also a follower — dedupe
        { session_id: sessionId, user_id: 'reminded-1' },
        { session_id: 'other-session', user_id: 'reminded-elsewhere' },
      ],
      users: { 'host-f': { username: 'vintage_vic', avatar: 'https://cdn/x.png' } },
    });
    const handlers = setup(db, notifications);

    const { result, reply } = await invoke(
      handlers,
      'POST',
      '/streaming/sessions/:roomId/start',
      {
        params: { roomId: sessionId },
        authUser: { userId: 'host-f', role: 'seller' },
      },
    );
    assert.equal(reply._sentCode, 200);
    assert.equal((result as { ok: boolean }).ok, true);

    await waitForNotifications(notifications, 3);
    assert.equal(notifications.length, 3);

    const recipients = notifications.map((n) => n.userId).sort();
    assert.deepEqual(recipients, ['fan-1', 'fan-2', 'reminded-1']);

    for (const n of notifications) {
      assert.equal(n.eventType, 'live_started');
      assert.equal(n.actorUserId, 'host-f');
      assert.equal(n.title, 'vintage_vic is live');
      assert.ok(n.body?.includes('Friday drop'));
      // startedAt discriminates restarts: a session that ends and is
      // re-started re-notifies instead of being swallowed by the old key.
      assert.ok(n.idempotencyKey);
      assert.match(
        n.idempotencyKey!,
        new RegExp(`^live_started:${sessionId}:.+:${n.userId}$`),
      );
      assert.deepEqual(n.route, {
        screen: 'LiveStreamViewer',
        params: { sessionId },
      });
      assert.equal(n.payload?.sessionId, sessionId);
      assert.equal(n.payload?.hostUsername, 'vintage_vic');
    }
  });

  it('does not fan out when the host has no followers or reminders', async () => {
    const notifications: NotificationCall[] = [];
    const sessionId = 'sess-quiet';
    const db = createMockDb({
      sessions: [SESSION_ROW({ id: sessionId, host_user_id: 'host-q' })],
      users: { 'host-q': { username: 'quiet_host', avatar: null } },
    });
    const handlers = setup(db, notifications);

    const { result } = await invoke(handlers, 'POST', '/streaming/sessions/:roomId/start', {
      params: { roomId: sessionId },
      authUser: { userId: 'host-q', role: 'seller' },
    });
    assert.equal((result as { ok: boolean }).ok, true);

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(notifications.length, 0);
  });
});

// ── Remind me ────────────────────────────────────────────────────────────────

describe('live session reminders', () => {
  it('POST /remind opts in (idempotent), DELETE /remind opts out', async () => {
    const sessionId = 'sess-remind';
    const db = createMockDb({
      sessions: [
        SESSION_ROW({ id: sessionId, host_user_id: 'host-r', status: 'created' }),
      ],
    });
    const handlers = setup(db);

    const optIn = await invoke(handlers, 'POST', '/streaming/sessions/:sessionId/remind', {
      params: { sessionId },
      authUser: { userId: 'viewer-1', role: 'buyer' },
    });
    assert.equal(optIn.reply._sentCode, 200);
    assert.deepEqual(optIn.result, { ok: true, reminding: true });
    assert.deepEqual(db.reminders, [{ session_id: sessionId, user_id: 'viewer-1' }]);

    // Re-posting is a no-op (ON CONFLICT DO NOTHING — mock models the dedupe).
    const optInAgain = await invoke(
      handlers,
      'POST',
      '/streaming/sessions/:sessionId/remind',
      {
        params: { sessionId },
        authUser: { userId: 'viewer-1', role: 'buyer' },
      },
    );
    assert.deepEqual(optInAgain.result, { ok: true, reminding: true });

    const optOut = await invoke(
      handlers,
      'DELETE',
      '/streaming/sessions/:sessionId/remind',
      {
        params: { sessionId },
        authUser: { userId: 'viewer-1', role: 'buyer' },
      },
    );
    assert.equal(optOut.reply._sentCode, 200);
    assert.deepEqual(optOut.result, { ok: true, reminding: false });
    assert.deepEqual(db.reminders, []);
  });

  it('rejects reminders on sessions that are not upcoming', async () => {
    const sessionId = 'sess-live-now';
    const db = createMockDb({
      sessions: [SESSION_ROW({ id: sessionId, host_user_id: 'host-r', status: 'live' })],
    });
    const handlers = setup(db);

    const { result, reply } = await invoke(
      handlers,
      'POST',
      '/streaming/sessions/:sessionId/remind',
      {
        params: { sessionId },
        authUser: { userId: 'viewer-1', role: 'buyer' },
      },
    );
    assert.equal(reply._sentCode, 409);
    assert.equal((result as { code: string }).code, 'REMINDER_NOT_AVAILABLE');
  });
});
