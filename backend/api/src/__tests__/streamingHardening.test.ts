// Streaming hardening tests — cover the behaviours pinned by the streaming
// hardening pass:
//   - live.viewer.token_issued emits the authoritative in-memory viewer count
//     (the viewer_count column is never incremented on issuance, so emitting
//     it would broadcast a permanently stale number)
//   - live.viewer_count.update on leave emits the post-delete set size
//   - GET /streaming/sessions surfaces recent ended sessions from the DB so
//     recording_url / recording_enabled stay discoverable
//   - POST /sessions/:roomId/start re-creates a provider room that was reaped
//     while idle (emptyTimeout) instead of orphaning the session row
//   - POST /webhooks/livekit verifies the LiveKit signature via the real
//     WebhookReceiver and rejects unsigned/invalid requests
//
// Uses `node:test` with an ESM load hook that substitutes a capturing stub
// for lib/realtime (same pattern as bidTransaction.test.ts) so emitted events
// can be asserted without standing up Redis.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash, createHmac } from 'node:crypto';

const loaderSource = [
  'export async function load(url, context, nextLoad) {',
  "  if (url.includes('/lib/realtime')) {",
  '    return {',
  '      format: "module",',
  "      source: 'globalThis.__capturedRealtime = globalThis.__capturedRealtime || []; export async function publishRealtimeEvent(e) { globalThis.__capturedRealtime.push(e); return 0; }',",
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

// LiveKit credentials for the webhook route — set before the route module is
// imported so config.ts picks them up at load time.
process.env.LIVEKIT_API_KEY = 'livekit-test-key';
process.env.LIVEKIT_API_SECRET = 'livekit-test-secret';

const { registerStreamingRoutes } = await import('../routes/streaming.js');

// ── Captured realtime events ─────────────────────────────────────────────────

type CapturedEvent = {
  topic: string;
  type: string;
  payload: Record<string, unknown>;
};

const capturedEvents = (): CapturedEvent[] =>
  (globalThis as { __capturedRealtime?: CapturedEvent[] }).__capturedRealtime ??
  [];

// ── Mock Fastify / pg harness ────────────────────────────────────────────────

interface CapturedRequest {
  body: unknown;
  params: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  rawBody?: string;
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
  const handlers = new Map<string, RouteHandler>();
  // Handlers are keyed by path for backwards compatibility (last
  // registration wins, as before) AND by "METHOD path" so routes sharing a
  // path across methods (e.g. POST vs GET /chat) stay addressable.
  const capture =
    (method: string) =>
    (path: string, optsOrHandler: unknown, maybeHandler?: RouteHandler) => {
      const handler = maybeHandler ?? (optsOrHandler as RouteHandler);
      handlers.set(`${method} ${path}`, handler);
      handlers.set(path, handler);
    };
  const app = {
    post: (p: string, o: unknown, h?: RouteHandler) => capture('POST')(p, o, h),
    get: (p: string, o: unknown, h?: RouteHandler) => capture('GET')(p, o, h),
    put: (p: string, o: unknown, h?: RouteHandler) => capture('PUT')(p, o, h),
    delete: (p: string, o: unknown, h?: RouteHandler) => capture('DELETE')(p, o, h),
    patch: (p: string, o: unknown, h?: RouteHandler) => capture('PATCH')(p, o, h),
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
  status: 'live',
  room_url: 'ws://localhost:7880',
  recording_url: null,
  recording_enabled: false,
  max_viewers: 100,
  viewer_count: 5,
  metadata: {},
  created_at: new Date().toISOString(),
  started_at: null,
  ended_at: null,
  ...overrides,
});

function createMockDb(options: {
  sessionRow?: Record<string, unknown> | null;
  endedRows?: Record<string, unknown>[];
}) {
  const queryCalls: { sql: string; args: unknown[] }[] = [];
  const db = {
    queryCalls,
    query: async (sql: string, args: unknown[] = []) => {
      queryCalls.push({ sql, args });
      if (sql.includes("status = 'ended'")) {
        return { rows: options.endedRows ?? [] };
      }
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
            },
          ],
        };
      }
      if (sql.includes('UPDATE live_shopping_sessions')) {
        return { rows: [] };
      }
      if (sql.includes('live_shopping_sessions')) {
        return { rows: options.sessionRow ? [options.sessionRow] : [] };
      }
      return { rows: [] };
    },
    connect: async () => {
      throw new Error('not needed for these tests');
    },
  };
  return db;
}

function setup(db: ReturnType<typeof createMockDb>) {
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
  });
  return handlers;
}

async function invoke(
  handlers: Map<string, RouteHandler>,
  path: string,
  request: Partial<CapturedRequest> & { params?: Record<string, string> },
) {
  const handler = handlers.get(path);
  assert.ok(handler, `route ${path} was not registered`);
  const reply = createMockReply();
  const result = await handler(
    { body: {}, params: {}, ...request } as CapturedRequest,
    reply,
  );
  return { result, reply };
}

// ── Viewer-count honesty ─────────────────────────────────────────────────────

describe('viewer count emission uses the in-memory membership set', () => {
  it('join emits live.viewer_count.update with the post-insert set size, not the stale DB column', async () => {
    const sessionId = 'sess-vc-emit';
    const db = createMockDb({
      sessionRow: SESSION_ROW({
        id: sessionId,
        host_user_id: 'host-vc',
        status: 'live',
        viewer_count: 7, // stale — never incremented by design
      }),
    });
    const handlers = setup(db);

    const first = await invoke(handlers, '/streaming/sessions/:roomId/token', {
      params: { roomId: sessionId },
      body: { role: 'viewer' },
      authUser: { userId: 'viewer-vc-1', role: 'viewer' },
    });
    assert.equal(first.reply._sentCode, 200);

    const second = await invoke(handlers, '/streaming/sessions/:roomId/token', {
      params: { roomId: sessionId },
      body: { role: 'viewer' },
      authUser: { userId: 'viewer-vc-2', role: 'viewer' },
    });
    assert.equal(second.reply._sentCode, 200);

    const events = capturedEvents().filter(
      (e) => e.type === 'live.viewer_count.update' && e.topic === `live.session:${sessionId}`,
    );
    assert.equal(events.length, 2);
    assert.equal(events[0].payload.count, 1, 'first join must emit the real count, not 7');
    assert.equal(events[1].payload.count, 2, 'second join must emit the real count, not 7');
  });

  it('leave emits live.viewer_count.update with the post-delete set size', async () => {
    const sessionId = 'sess-vc-leave';
    const db = createMockDb({
      sessionRow: SESSION_ROW({
        id: sessionId,
        host_user_id: 'host-vcl',
        status: 'live',
        viewer_count: 9,
      }),
    });
    const handlers = setup(db);

    for (const viewer of ['lv-1', 'lv-2']) {
      await invoke(handlers, '/streaming/sessions/:roomId/token', {
        params: { roomId: sessionId },
        body: { role: 'viewer' },
        authUser: { userId: viewer, role: 'viewer' },
      });
    }

    const leave = await invoke(handlers, '/streaming/sessions/:sessionId/leave', {
      params: { sessionId },
      authUser: { userId: 'lv-1', role: 'viewer' },
    });
    const body = leave.result as { ok: boolean; viewerCount: number };
    assert.equal(body.ok, true);
    assert.equal(body.viewerCount, 1, 'response must report the real remaining count');

    const updates = capturedEvents().filter(
      (e) => e.type === 'live.viewer_count.update' && e.topic === `live.session:${sessionId}`,
    );
    // Two joins + one leave — the last emission is the post-delete count.
    assert.equal(updates.length, 3);
    assert.equal(updates[2].payload.count, 1);

    // The pinned floor-guarded decrement still runs against the DB column.
    const decrementCalls = db.queryCalls.filter((c) =>
      c.sql.includes('viewer_count = GREATEST(0, viewer_count - 1)'),
    );
    assert.equal(decrementCalls.length, 1);
  });
});

// ── Ended-session discovery ──────────────────────────────────────────────────

describe('GET /streaming/sessions includes ended sessions from the DB', () => {
  it('returns ended rows with recording fields so replays stay discoverable', async () => {
    const ended = SESSION_ROW({
      id: 'sess-ended-1',
      status: 'ended',
      recording_url: 'https://cdn.example.com/replays/sess-ended-1.mp4',
      recording_enabled: true,
      ended_at: new Date().toISOString(),
    });
    const db = createMockDb({ sessionRow: null, endedRows: [ended] });
    const handlers = setup(db);

    const { result } = await invoke(handlers, '/streaming/sessions', {
      query: { limit: '10' },
    });
    const body = result as { ok: boolean; sessions: Array<Record<string, unknown>> };
    assert.equal(body.ok, true);

    const endedSession = body.sessions.find((s) => s.roomId === 'sess-ended-1');
    assert.ok(endedSession, 'ended DB session must appear in the list');
    assert.equal(endedSession.status, 'ended');
    assert.equal(endedSession.recordingUrl, 'https://cdn.example.com/replays/sess-ended-1.mp4');
    assert.equal(endedSession.recordingEnabled, true);
  });
});

// ── Orphaned-room recovery on start ──────────────────────────────────────────

describe('POST /streaming/sessions/:roomId/start re-creates a reaped room', () => {
  it('goes live even when the provider has no room for the session', async () => {
    // The mock provider's in-memory map has no room for this session — the
    // equivalent of LiveKit having reaped it after emptyTimeout. The start
    // route passes the persisted session fields so the provider re-creates
    // the room instead of throwing "not found" and orphaning the row.
    const sessionId = 'sess-orphan-room';
    const db = createMockDb({
      sessionRow: SESSION_ROW({
        id: sessionId,
        host_user_id: 'host-orphan',
        status: 'created',
      }),
    });
    const handlers = setup(db);

    const { result, reply } = await invoke(handlers, '/streaming/sessions/:roomId/start', {
      params: { roomId: sessionId },
      authUser: { userId: 'host-orphan', role: 'seller' },
    });

    assert.equal(reply._sentCode, 200);
    const body = result as { ok: boolean; session: { status: string } };
    assert.equal(body.ok, true);
    assert.equal(body.session.status, 'live');
  });
});

// ── LiveKit webhook signature gate ───────────────────────────────────────────

function signLiveKitWebhook(rawBody: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'livekit-test-key',
      sha256: createHash('sha256').update(rawBody).digest('base64'),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', 'livekit-test-secret')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('POST /webhooks/livekit', () => {
  it('rejects requests without a valid LiveKit signature', async () => {
    const db = createMockDb({});
    const handlers = setup(db);

    const noAuth = await invoke(handlers, '/webhooks/livekit', {
      headers: {},
      rawBody: JSON.stringify({ event: 'room_started' }),
      body: { event: 'room_started' },
    });
    assert.equal(noAuth.reply._sentCode, 401);
    assert.equal((noAuth.result as { code: string }).code, 'WEBHOOK_SIGNATURE_INVALID');

    const badAuth = await invoke(handlers, '/webhooks/livekit', {
      headers: { authorization: 'Bearer garbage' },
      rawBody: JSON.stringify({ event: 'room_started' }),
      body: { event: 'room_started' },
    });
    assert.equal(badAuth.reply._sentCode, 401);
  });

  it('accepts a correctly-signed event and no-ops 200', async () => {
    const db = createMockDb({});
    const handlers = setup(db);

    const rawBody = JSON.stringify({ event: 'room_started', room: { name: 'stream_x' } });
    const { result, reply } = await invoke(handlers, '/webhooks/livekit', {
      headers: { authorization: signLiveKitWebhook(rawBody) },
      rawBody,
      body: { event: 'room_started' },
    });

    assert.equal(reply._sentCode, 200);
    const body = result as { ok: boolean; event: string };
    assert.equal(body.ok, true);
    assert.equal(body.event, 'room_started');
  });
});

// ── Host viewer moderation (mute / unmute / kick) ────────────────────────────
//
// Pinned behaviours:
//   - mute/unmute/kick and the moderation viewer list are host-or-admin only
//     (fail-closed 403), and the host can never be the target
//   - a muted viewer cannot send chat (STREAM_CHAT_MUTED) and cannot obtain
//     a new viewer token (STREAM_VIEWER_MUTED) — kick+mute keeps them out
//   - unmute restores chat + viewer-token issuance
//   - kick emits live.viewer.kicked plus the post-delete viewer count, and a
//     kicked-but-not-muted viewer can rejoin
//
// The mock applies the JSONB metadata writes onto the session row so
// subsequent fetchSessionRow calls observe the mute state like Postgres
// would. The audit write (immutable_audit_events) is fire-and-forget in the
// route — the empty-row mock makes it throw internally and the route's
// .catch absorbs it.

function createModerationMockDb(sessionRow: Record<string, unknown>) {
  const queryCalls: { sql: string; args: unknown[] }[] = [];
  const applyMuteWrite = (mutate: (muted: Record<string, unknown>) => void) => {
    const metadata = (sessionRow.metadata ?? {}) as Record<string, unknown>;
    const moderation = (metadata.viewerModeration ?? {}) as Record<string, unknown>;
    const muted = { ...((moderation.muted ?? {}) as Record<string, unknown>) };
    mutate(muted);
    sessionRow.metadata = {
      ...metadata,
      viewerModeration: { ...moderation, muted },
    };
  };
  const db = {
    queryCalls,
    query: async (sql: string, args: unknown[] = []) => {
      queryCalls.push({ sql, args });
      if (sql.includes('jsonb_set') && sql.includes('viewerModeration')) {
        applyMuteWrite((muted) => {
          muted[String(args[1])] = JSON.parse(String(args[2]));
        });
        return { rows: [] };
      }
      if (sql.includes('#-') && sql.includes('viewerModeration')) {
        applyMuteWrite((muted) => {
          delete muted[String(args[1])];
        });
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO live_shopping_chat_messages')) {
        return {
          rows: [
            {
              id: args[0],
              session_id: args[1],
              user_id: args[2],
              user_name: args[3],
              message: args[4],
              type: 'message',
              is_seller: args[5],
              moderation_state: args[6],
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      if (sql.includes('FROM live_shopping_sessions')) {
        return { rows: [sessionRow] };
      }
      return { rows: [] };
    },
    connect: async () => {
      throw new Error('not needed for these tests');
    },
  };
  return db;
}

describe('host viewer moderation', () => {
  it('rejects non-host moderation calls with 403 and never targets the host', async () => {
    const sessionRow = SESSION_ROW({ id: 'sess-mod-1', host_user_id: 'host-mod' });
    const db = createModerationMockDb(sessionRow);
    const handlers = setup(db as unknown as ReturnType<typeof createMockDb>);

    const asViewer = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/moderation/mute',
      {
        params: { sessionId: 'sess-mod-1' },
        body: { userId: 'viewer-x' },
        authUser: { userId: 'viewer-y', role: 'viewer' },
      },
    );
    assert.equal(asViewer.reply._sentCode, 403);

    const listAsViewer = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/moderation/viewers',
      {
        params: { sessionId: 'sess-mod-1' },
        authUser: { userId: 'viewer-y', role: 'viewer' },
      },
    );
    assert.equal(listAsViewer.reply._sentCode, 403);

    const muteHost = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/moderation/mute',
      {
        params: { sessionId: 'sess-mod-1' },
        body: { userId: 'host-mod' },
        authUser: { userId: 'host-mod', role: 'seller' },
      },
    );
    assert.equal(muteHost.reply._sentCode, 400);
    assert.equal(
      (muteHost.result as { code: string }).code,
      'CANNOT_MODERATE_HOST',
    );
  });

  it('mute blocks chat + viewer token; unmute restores both', async () => {
    const sessionRow = SESSION_ROW({ id: 'sess-mod-2', host_user_id: 'host-mod2' });
    const db = createModerationMockDb(sessionRow);
    const handlers = setup(db as unknown as ReturnType<typeof createMockDb>);

    const mute = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/moderation/mute',
      {
        params: { sessionId: 'sess-mod-2' },
        body: { userId: 'viewer-m' },
        authUser: { userId: 'host-mod2', role: 'seller' },
      },
    );
    assert.equal(mute.reply._sentCode, 200);
    assert.equal((mute.result as { muted: boolean }).muted, true);

    const mutedList = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/moderation/viewers',
      {
        params: { sessionId: 'sess-mod-2' },
        authUser: { userId: 'host-mod2', role: 'seller' },
      },
    );
    const listBody = mutedList.result as { muted: Array<{ userId: string }> };
    assert.deepEqual(listBody.muted.map((m) => m.userId), ['viewer-m']);

    const chatWhileMuted = await invoke(
      handlers,
      'POST /streaming/sessions/:sessionId/chat',
      {
        params: { sessionId: 'sess-mod-2' },
        body: { message: 'hello' },
        authUser: { userId: 'viewer-m', role: 'viewer' },
      },
    );
    assert.equal(chatWhileMuted.reply._sentCode, 403);
    assert.equal(
      (chatWhileMuted.result as { code: string }).code,
      'STREAM_CHAT_MUTED',
    );

    const tokenWhileMuted = await invoke(
      handlers,
      '/streaming/sessions/:roomId/token',
      {
        params: { roomId: 'sess-mod-2' },
        body: { role: 'viewer' },
        authUser: { userId: 'viewer-m', role: 'viewer' },
      },
    );
    assert.equal(tokenWhileMuted.reply._sentCode, 403);
    assert.equal(
      (tokenWhileMuted.result as { code: string }).code,
      'STREAM_VIEWER_MUTED',
    );

    const mutedEvent = capturedEvents().find(
      (e) => e.type === 'live.viewer.muted' && e.topic === 'live.session:sess-mod-2',
    );
    assert.ok(mutedEvent, 'mute must broadcast live.viewer.muted on the session topic');
    assert.equal(mutedEvent.payload.userId, 'viewer-m');

    const unmute = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/moderation/unmute',
      {
        params: { sessionId: 'sess-mod-2' },
        body: { userId: 'viewer-m' },
        authUser: { userId: 'host-mod2', role: 'seller' },
      },
    );
    assert.equal(unmute.reply._sentCode, 200);

    const tokenAfterUnmute = await invoke(
      handlers,
      '/streaming/sessions/:roomId/token',
      {
        params: { roomId: 'sess-mod-2' },
        body: { role: 'viewer' },
        authUser: { userId: 'viewer-m', role: 'viewer' },
      },
    );
    assert.equal(tokenAfterUnmute.reply._sentCode, 200);

    const chatAfterUnmute = await invoke(
      handlers,
      'POST /streaming/sessions/:sessionId/chat',
      {
        params: { sessionId: 'sess-mod-2' },
        body: { message: 'hello again' },
        authUser: { userId: 'viewer-m', role: 'viewer' },
      },
    );
    assert.equal(chatAfterUnmute.reply._sentCode, 201);
  });

  it('kick ejects the viewer and lets them rejoin unless muted', async () => {
    const sessionRow = SESSION_ROW({ id: 'sess-mod-3', host_user_id: 'host-mod3' });
    const db = createModerationMockDb(sessionRow);
    const handlers = setup(db as unknown as ReturnType<typeof createMockDb>);

    // Two viewers join so the kick has a real post-delete count.
    for (const viewer of ['viewer-k', 'viewer-other']) {
      await invoke(handlers, '/streaming/sessions/:roomId/token', {
        params: { roomId: 'sess-mod-3' },
        body: { role: 'viewer' },
        authUser: { userId: viewer, role: 'viewer' },
      });
    }

    const kick = await invoke(
      handlers,
      '/streaming/sessions/:sessionId/moderation/kick',
      {
        params: { sessionId: 'sess-mod-3' },
        body: { userId: 'viewer-k' },
        authUser: { userId: 'host-mod3', role: 'seller' },
      },
    );
    assert.equal(kick.reply._sentCode, 200);
    const kickBody = kick.result as { kicked: boolean; viewerCount: number };
    assert.equal(kickBody.kicked, true);
    assert.equal(kickBody.viewerCount, 1);

    const kickedEvent = capturedEvents().find(
      (e) => e.type === 'live.viewer.kicked' && e.topic === 'live.session:sess-mod-3',
    );
    assert.ok(kickedEvent, 'kick must broadcast live.viewer.kicked');
    assert.equal(kickedEvent.payload.userId, 'viewer-k');

    // Not muted → a fresh viewer token lets them back in.
    const rejoin = await invoke(handlers, '/streaming/sessions/:roomId/token', {
      params: { roomId: 'sess-mod-3' },
      body: { role: 'viewer' },
      authUser: { userId: 'viewer-k', role: 'viewer' },
    });
    assert.equal(rejoin.reply._sentCode, 200);

    // Kick + mute keeps them out.
    await invoke(handlers, '/streaming/sessions/:sessionId/moderation/mute', {
      params: { sessionId: 'sess-mod-3' },
      body: { userId: 'viewer-k' },
      authUser: { userId: 'host-mod3', role: 'seller' },
    });
    await invoke(handlers, '/streaming/sessions/:sessionId/moderation/kick', {
      params: { sessionId: 'sess-mod-3' },
      body: { userId: 'viewer-k' },
      authUser: { userId: 'host-mod3', role: 'seller' },
    });
    const rejoinMuted = await invoke(handlers, '/streaming/sessions/:roomId/token', {
      params: { roomId: 'sess-mod-3' },
      body: { role: 'viewer' },
      authUser: { userId: 'viewer-k', role: 'viewer' },
    });
    assert.equal(rejoinMuted.reply._sentCode, 403);
    assert.equal(
      (rejoinMuted.result as { code: string }).code,
      'STREAM_VIEWER_MUTED',
    );
  });
});
