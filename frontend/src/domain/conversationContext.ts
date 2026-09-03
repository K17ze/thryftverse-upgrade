export interface ConversationContext {
  listing?: {
    id: string;
    title: string;
    price: number;
    currency: string;
    imageUrl?: string;
    status: 'active' | 'sold' | 'paused' | 'deleted';
    condition?: string;
  };
  offer?: {
    id: string;
    amount: number;
    currency: string;
    status: 'pending' | 'countered' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';
    expiresAt: string;
  };
  order?: {
    id: string;
    status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded';
    totalAmount: number;
    currency: string;
    createdAt: string;
  };
  protection?: {
    status: 'active' | 'expired' | 'claimed' | 'resolved';
    expiresAt?: string;
  };
}
