-- Personal profile fields edited through /users/me. Gender is owner-only;
-- pronouns and the creator's AI disclosure are part of their public profile.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pronouns VARCHAR(60),
  ADD COLUMN IF NOT EXISTS gender VARCHAR(80),
  ADD COLUMN IF NOT EXISTS is_ai_creator BOOLEAN;
