import { fetchJson } from '../lib/apiClient';

export interface ReferralCodeResponse {
  ok: true;
  code: string;
}

export interface ReferralStatsResponse {
  ok: true;
  invited: number;
  joined: number;
  rewarded: number;
  creditsBalance: number;
}

export interface ReferralHistoryApiItem {
  id: string;
  username: string;
  status: 'joined';
  joinedAt: string;
}

export interface ReferralHistoryResponse {
  ok: true;
  items: ReferralHistoryApiItem[];
}

export function fetchReferralCode(userId: string): Promise<ReferralCodeResponse> {
  return fetchJson<ReferralCodeResponse>(`/users/${userId}/referral-code`);
}

export function fetchReferralStats(userId: string): Promise<ReferralStatsResponse> {
  return fetchJson<ReferralStatsResponse>(`/users/${userId}/referral-stats`);
}

export function fetchReferralHistory(userId: string): Promise<ReferralHistoryResponse> {
  return fetchJson<ReferralHistoryResponse>(`/users/${userId}/referrals`);
}
