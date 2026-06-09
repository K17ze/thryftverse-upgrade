import { randomUUID } from 'crypto';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

async function request(path, opts = {}) {
  const url = `${API_BASE_URL}${path}`;
  const { headers: optsHeaders, ...restOpts } = opts;
  const res = await fetch(url, {
    ...restOpts,
    headers: { 'Content-Type': 'application/json', ...optsHeaders },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function signup() {
  const username = `test_${randomUUID().slice(0, 8)}`;
  const email = `${username}@example.com`;
  const password = 'TestPass123!';
  const res = await request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
  });
  if (!res.body.accessToken) {
    console.error('SIGNUP_FAIL', res.body);
    throw new Error('Signup failed');
  }
  return { userId: res.body.user.id, accessToken: res.body.accessToken };
}

async function getMe(token) {
  return request('/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function patchMe(token, updates) {
  return request('/users/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(updates),
  });
}

async function getPublicProfile(userId) {
  return request(`/users/${userId}/profile`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERT_FAIL: ${message}`);
  }
}

async function run() {
  console.log('PROFILE_SMOKE_START');

  // 1. Signup
  const { userId, accessToken } = await signup();
  console.log('SIGNUP_OK', userId);

  // 2. Get /users/me
  const me1 = await getMe(accessToken);
  assert(me1.status === 200, 'GET /users/me should return 200');
  assert(me1.body.ok === true, 'GET /users/me should return ok');
  assert(me1.body.user.id === userId, 'GET /users/me user.id mismatch');
  console.log('GET_ME_OK');

  // 3. Patch profile
  const patchRes = await patchMe(accessToken, {
    displayName: 'Test User',
    bio: 'Hello world',
    location: 'London',
    website: 'https://example.com',
  });
  assert(patchRes.status === 200, 'PATCH /users/me should return 200');
  assert(patchRes.body.ok === true, 'PATCH /users/me should return ok');
  assert(patchRes.body.user.displayName === 'Test User', 'displayName not updated');
  assert(patchRes.body.user.bio === 'Hello world', 'bio not updated');
  console.log('PATCH_ME_OK');

  // 4. Get /users/me again and verify changes
  const me2 = await getMe(accessToken);
  assert(me2.body.user.displayName === 'Test User', 'displayName not persisted');
  assert(me2.body.user.bio === 'Hello world', 'bio not persisted');
  assert(me2.body.user.location === 'London', 'location not persisted');
  console.log('GET_ME_VERIFY_OK');

  // 5. Get public profile
  const pub = await getPublicProfile(userId);
  assert(pub.status === 200, 'GET public profile should return 200');
  assert(pub.body.ok === true, 'GET public profile should return ok');
  assert(pub.body.user.id === userId, 'public profile id mismatch');
  assert(pub.body.user.displayName === 'Test User', 'public profile displayName mismatch');
  console.log('GET_PUBLIC_PROFILE_OK');

  // 6. Verify public profile excludes private fields
  assert(!('email' in pub.body.user), 'public profile should NOT include email');
  assert(!('phone' in pub.body.user), 'public profile should NOT include phone');
  assert(!('twoFactorEnabled' in pub.body.user), 'public profile should NOT include 2fa status');
  assert(!('updatedAt' in pub.body.user), 'public profile should NOT include updatedAt');
  console.log('PUBLIC_PRIVACY_OK');

  // 7. Patch avatar and verify public profile reflects it
  const avatarPatch = await patchMe(accessToken, { avatar: 'https://example.com/avatar.jpg' });
  assert(avatarPatch.status === 200, 'PATCH avatar should return 200');
  assert(avatarPatch.body.user.avatar === 'https://example.com/avatar.jpg', 'avatar not updated');
  const pubWithAvatar = await getPublicProfile(userId);
  assert(pubWithAvatar.body.user.avatar === 'https://example.com/avatar.jpg', 'public profile should include avatar');
  console.log('AVATAR_PATCH_OK');

  // 8. Cross-user patch blocked (create second user and try to patch first)
  const { userId: userId2, accessToken: token2 } = await signup();
  const crossPatch = await patchMe(token2, { displayName: 'Hijack', avatar: 'https://evil.com/avatar.jpg' });
  // Token2 should patch user2's profile, not user1's. Verify user1 is unchanged.
  const pubAfterCross = await getPublicProfile(userId);
  assert(pubAfterCross.body.user.displayName === 'Test User', 'cross-user patch leaked to other user');
  assert(pubAfterCross.body.user.avatar === 'https://example.com/avatar.jpg', 'cross-user avatar leak');
  console.log('CROSS_USER_PATCH_BLOCKED_OK');

  // 9. Unauthorized edit blocked
  const badPatch = await patchMe('invalid-token', { displayName: 'Hacker' });
  assert(badPatch.status === 401, 'Unauthorized PATCH should return 401');
  console.log('UNAUTHORIZED_PATCH_BLOCKED_OK');

  // 10. Unauthenticated get private profile blocked
  const unauthMe = await getMe('invalid-token');
  assert(unauthMe.status === 401, 'Unauthenticated GET /users/me should return 401');
  console.log('UNAUTH_GET_ME_BLOCKED_OK');

  console.log('PROFILE_SMOKE_PASS');
}

run().catch((err) => {
  console.error('PROFILE_SMOKE_FAIL', err.message);
  process.exit(1);
});
