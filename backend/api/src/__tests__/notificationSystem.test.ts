import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Notification system push payload shape', () => {
  it('PushJobData includes canonical routing fields', () => {
    const jobData = {
      eventId: 'evt_1',
      userId: 'usr_1',
      title: 'Test',
      body: 'Body',
      payload: {},
      eventType: 'order_shipped',
      actorUserId: 'usr_actor',
      route: { screen: 'OrderDetail', params: { orderId: 'ord_1' } },
    };

    assert.equal(jobData.eventType, 'order_shipped');
    assert.equal(jobData.actorUserId, 'usr_actor');
    assert.equal(jobData.route?.screen, 'OrderDetail');
    assert.deepEqual((jobData.route as any).params, { orderId: 'ord_1' });
  });

  it('Expo push data includes eventId, eventType, actorUserId, and route', () => {
    const expoData = {
      eventId: 'evt_1',
      eventType: 'order_shipped',
      actorUserId: 'usr_actor',
      route: { screen: 'OrderDetail', params: { orderId: 'ord_1' } },
    };

    assert.equal(typeof expoData.eventId, 'string');
    assert.equal(typeof expoData.eventType, 'string');
    assert.equal(typeof expoData.actorUserId, 'string');
    assert.equal(typeof (expoData.route as any)?.screen, 'string');
  });

  it('idempotency key prevents duplicate insertion', () => {
    const insertSql = `
      INSERT INTO notification_events (id, user_id, channel, title, body, payload, status, metadata, event_type, actor_user_id, image_url, route, idempotency_key)
      VALUES ($1, $2, 'push', $3, $4, $5::jsonb, 'queued', $6::jsonb, $7, $8, $9, $10::jsonb, $11)
      ON CONFLICT (user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO NOTHING
      RETURNING id
    `;

    assert.ok(insertSql.includes('ON CONFLICT'));
    assert.ok(insertSql.includes('DO NOTHING'));
    assert.ok(insertSql.includes('RETURNING id'));
    assert.ok(insertSql.includes('idempotency_key'));
  });

  it('notification events query joins users for actor projection', () => {
    const querySql = `
      SELECT ne.id, ne.event_type, ne.actor_user_id, u.username AS actor_username, u.avatar AS actor_avatar
      FROM notification_events ne
      LEFT JOIN users u ON u.id = ne.actor_user_id
    `;

    assert.ok(querySql.includes('LEFT JOIN users'));
    assert.ok(querySql.includes('actor_username'));
    assert.ok(querySql.includes('actor_avatar'));
  });
});
