import { fetchJson } from '../lib/apiClient';

export interface ProfileUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  phone: string | null;
  avatar: string | null;
  coverPhoto: string | null;
  coverVideo: string | null;
  role: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfileUser {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatar: string | null;
  coverPhoto: string | null;
  coverVideo: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

interface ProfileResponse {
  ok: true;
  user: ProfileUser;
}

interface PublicProfileResponse {
  ok: true;
  user: PublicProfileUser;
}

export async function fetchMyProfile(): Promise<ProfileUser> {
  const response = await fetchJson<ProfileResponse>('/users/me', { method: 'GET' });
  return response.user;
}

export interface UpdateProfileInput {
  displayName?: string;
  username?: string;
  bio?: string;
  location?: string;
  website?: string;
  phone?: string;
  avatar?: string;
  coverPhoto?: string;
  coverVideo?: string;
}

export async function updateMyProfile(input: UpdateProfileInput): Promise<ProfileUser> {
  const response = await fetchJson<ProfileResponse>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return response.user;
}

export async function fetchPublicProfile(userId: string): Promise<PublicProfileUser> {
  const response = await fetchJson<PublicProfileResponse>(`/users/${encodeURIComponent(userId)}/profile`, {
    method: 'GET',
  });
  return response.user;
}
