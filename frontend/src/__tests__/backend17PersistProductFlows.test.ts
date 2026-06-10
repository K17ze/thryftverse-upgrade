import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../');
const SCREENS = resolve(SRC, 'screens');
const STORE = resolve(SRC, 'store');
const SERVICES = resolve(SRC, 'services');

// Resolve backend from the monorepo root (thryftverse/)
const ROOT = resolve(process.cwd(), '..');
const BACKEND = resolve(ROOT, 'backend/api/src');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

describe('BACKEND-17 server-persist local-only product flows', () => {
  // ── 1. Support tickets have backend endpoint/service/client wiring ──
  it('backend has support_tickets migration', () => {
    const src = read(resolve(BACKEND, 'db/migrations/037_support_tickets.sql'));
    expect(src).toContain('CREATE TABLE IF NOT EXISTS support_tickets');
    expect(src).toContain('user_id TEXT NOT NULL REFERENCES users(id)');
    expect(src).toContain("status TEXT NOT NULL DEFAULT 'open'");
  });

  it('backend has support ticket endpoints', () => {
    const src = read(resolve(BACKEND, 'index.ts'));
    expect(src).toContain("app.post('/support/tickets'");
    expect(src).toContain("app.get('/support/tickets'");
    expect(src).toContain("app.get('/support/tickets/order/:orderId'");
    expect(src).toContain("app.patch('/support/tickets/:ticketId/status'");
  });

  it('frontend has supportApi client methods', () => {
    const src = read(resolve(SERVICES, 'supportApi.ts'));
    expect(src).toContain('export async function createSupportTicket');
    expect(src).toContain('export async function listSupportTickets');
    expect(src).toContain('export async function listSupportTicketsForOrder');
    expect(src).toContain('export async function updateSupportTicketStatus');
  });

  // ── 2. OrderSupportScreen calls backend support ticket method ──
  it('OrderSupportScreen calls backend createSupportTicketOnApi', () => {
    const src = read(resolve(SCREENS, 'OrderSupportScreen.tsx'));
    expect(src).toContain('createSupportTicketOnApi');
    expect(src).not.toContain('const ticketId = createSupportTicket({');
    expect(src).not.toContain('setTimeout(() => {');
  });

  it('OrderSupportScreen handles backend failure honestly', () => {
    const src = read(resolve(SCREENS, 'OrderSupportScreen.tsx'));
    expect(src).toContain('try {');
    expect(src).toContain('catch');
    expect(src).toContain('Unable to submit support request');
  });

  // ── 3. OrderDetailScreen loads backend support ticket status ──
  it('OrderDetailScreen loads support tickets from backend API', () => {
    const src = read(resolve(SCREENS, 'OrderDetailScreen.tsx'));
    expect(src).toContain('loadSupportTicketsForOrderFromApi');
  });

  // ── 4. Collections have backend endpoint/service/client wiring ──
  it('backend has collections migration', () => {
    const src = read(resolve(BACKEND, 'db/migrations/038_collections.sql'));
    expect(src).toContain('CREATE TABLE IF NOT EXISTS collections');
    expect(src).toContain('CREATE TABLE IF NOT EXISTS collection_items');
    expect(src).toContain('user_id TEXT NOT NULL REFERENCES users(id)');
  });

  it('backend has collection endpoints', () => {
    const src = read(resolve(BACKEND, 'index.ts'));
    expect(src).toContain("app.post('/collections'");
    expect(src).toContain("app.get('/collections'");
    expect(src).toContain("app.get('/collections/:collectionId'");
    expect(src).toContain("app.post('/collections/:collectionId/items'");
    expect(src).toContain("app.delete('/collections/:collectionId/items/:listingId'");
  });

  it('frontend has collectionsApi client methods', () => {
    const src = read(resolve(SERVICES, 'collectionsApi.ts'));
    expect(src).toContain('export async function createCollection');
    expect(src).toContain('export async function listCollections');
    expect(src).toContain('export async function getCollection');
    expect(src).toContain('export async function addListingToCollection');
    expect(src).toContain('export async function removeListingFromCollection');
  });

  // ── 5. CreateCollectionScreen calls backend collection method ──
  it('CreateCollectionScreen calls backend createCollectionOnApi', () => {
    const src = read(resolve(SCREENS, 'CreateCollectionScreen.tsx'));
    expect(src).toContain('createCollectionOnApi');
    expect(src).not.toContain('const newId = createCollection(');
    expect(src).toContain('try {');
    expect(src).toContain('Unable to create collection');
  });

  // ── 6. ClosetScreen loads collections from backend ──
  it('ClosetScreen loads collections from backend API', () => {
    const src = read(resolve(SCREENS, 'ClosetScreen.tsx'));
    expect(src).toContain('loadCollectionsFromApi');
  });

  // ── 7. Store has backend-aware actions ──
  it('useStore has backend-aware support ticket actions', () => {
    const src = read(resolve(STORE, 'useStore.ts'));
    expect(src).toContain('createSupportTicketOnApi:');
    expect(src).toContain('loadSupportTicketsFromApi:');
    expect(src).toContain('loadSupportTicketsForOrderFromApi:');
  });

  it('useStore has backend-aware collection actions', () => {
    const src = read(resolve(STORE, 'useStore.ts'));
    expect(src).toContain('createCollectionOnApi:');
    expect(src).toContain('loadCollectionsFromApi:');
    expect(src).toContain('addToCollectionOnApi:');
    expect(src).toContain('removeFromCollectionOnApi:');
  });

  // ── 8. No fake setTimeout submissions ──
  it('no setTimeout fake success in OrderSupportScreen', () => {
    const src = read(resolve(SCREENS, 'OrderSupportScreen.tsx'));
    expect(src).not.toContain('setTimeout(() => {');
  });

  it('no setTimeout fake success in CreateCollectionScreen', () => {
    const src = read(resolve(SCREENS, 'CreateCollectionScreen.tsx'));
    expect(src).not.toContain('setTimeout(() => {');
  });

  // ── 9. No local-only success unless labelled honestly ──
  it('OrderSupportScreen does not show success before backend confirms', () => {
    const src = read(resolve(SCREENS, 'OrderSupportScreen.tsx'));
    expect(src).toContain('Support request submitted');
    expect(src).toContain('Unable to submit support request');
  });

  // ── 10. No fake data regressions ──
  it('no fake user names or emails in updated screens', () => {
    const screens = [
      'OrderSupportScreen.tsx',
      'OrderDetailScreen.tsx',
      'CreateCollectionScreen.tsx',
      'ClosetScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain('user@example.com');
      expect(src).not.toContain('John Doe');
      expect(src).not.toContain('+44 7700');
      expect(src).not.toContain('picsum.photos');
      expect(src).not.toContain('unsplash.com');
    }
  });
});
