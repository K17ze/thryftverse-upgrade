import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('profile media truth rules', () => {
  it('EditProfileScreen uploads cover to backend via uploadMedia', () => {
    const src = readSrc('screens/EditProfileScreen.tsx');
    expect(src).toContain('uploadMedia(pickedUri, \'covers\')');
    expect(src).toContain('updateMyProfile({ coverPhoto: publicUrl })');
  });

  it('EditProfileScreen uploads avatar to backend via uploadMedia', () => {
    const src = readSrc('screens/EditProfileScreen.tsx');
    expect(src).toContain('uploadMedia(pickedUri, \'avatars\')');
    expect(src).toContain('updateMyProfile({ avatar: publicUrl })');
  });

  it('EditProfileScreen calls fetchMyProfile after save to refresh store', () => {
    const src = readSrc('screens/EditProfileScreen.tsx');
    expect(src).toContain('await fetchMyProfile()');
  });

  it('profileApi UpdateProfileInput includes coverPhoto and coverVideo', () => {
    const src = readSrc('services/profileApi.ts');
    expect(src).toContain('coverPhoto?: string');
    expect(src).toContain('coverVideo?: string');
  });

  it('backend PATCH /users/me accepts coverPhoto and coverVideo', () => {
    const src = readFileSync(resolve(__dirname, '../../../backend/api/src/index.ts'), 'utf-8');
    expect(src).toContain('coverPhoto: z.string().trim().max(2048).optional()');
    expect(src).toContain('coverVideo: z.string().trim().max(2048).optional()');
  });

  it('backend users table migration adds cover_photo and cover_video', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../backend/api/src/db/migrations/036_add_user_cover_media.sql'),
      'utf-8'
    );
    expect(src).toContain('cover_photo');
    expect(src).toContain('cover_video');
  });

  it('OrderDetailScreen does not use fake condition fallback', () => {
    const src = readSrc('screens/OrderDetailScreen.tsx');
    expect(src).not.toContain("condition: 'Very good'");
    expect(src).not.toContain("condition: 'Very good' as const");
  });

  it('OrderDetailScreen uses honest listingTitle from order data', () => {
    const src = readSrc('screens/OrderDetailScreen.tsx');
    expect(src).toContain('backendOrder?.listingTitle');
  });
});
