export interface Address {
  id: string;
  name: string;
  street: string;
  city: string;
  postcode: string;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  last4: string;
  brand?: 'visa' | 'mastercard' | 'amex';
  bankName?: string;
  expiry?: string;
  isDefault: boolean;
}

export interface Order {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  totalPrice: number;
  trackingNumber?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'sale' | 'purchase' | 'withdrawal' | 'refund';
  amount: number;
  status: 'completed' | 'pending';
  date: string;
  description: string;
}

export interface Review {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatar: string;
  rating: number;
  text: string;
  date: string;
  isAutomatic: boolean;
}
