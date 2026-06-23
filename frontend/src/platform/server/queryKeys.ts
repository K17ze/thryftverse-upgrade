export const queryKeys = {
  user: {
    profile: (userId?: string) => ['user', 'profile', userId] as const,
    listings: (userId: string) => ['user', 'listings', userId] as const,
    orders: (userId: string) => ['user', 'orders', userId] as const,
    collections: (userId: string) => ['user', 'collections', userId] as const,
  },
  listing: {
    detail: (id: string) => ['listing', 'detail', id] as const,
    search: (query: string) => ['listing', 'search', query] as const,
    category: (category: string) => ['listing', 'category', category] as const,
  },
  auction: {
    detail: (id: string) => ['auction', 'detail', id] as const,
    bids: (auctionId: string) => ['auction', 'bids', auctionId] as const,
  },
  chat: {
    conversations: ['chat', 'conversations'] as const,
    messages: (conversationId: string) => ['chat', 'messages', conversationId] as const,
  },
  discover: {
    feed: ['discover', 'feed'] as const,
    editorial: ['discover', 'editorial'] as const,
  },
} as const;
