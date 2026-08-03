import { z } from 'zod';

// ── Edit-profile form schema ───────────────────────────────────────
// Validates the public profile fields edited on EditProfileScreen.
// `name` and `username` are required; `bio`, `website`, and `phone`
// are optional but constrained when present.

export const editProfileSchema = z.object({
  name: z
    .string()
    .min(1, 'Name cannot be empty.'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters.'),
  bio: z
    .string()
    .max(200, 'Bio must be 200 characters or fewer.')
    .optional()
    .default(''),
  website: z
    .string()
    .refine(
      (v) => {
        if (!v) return true;
        return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i.test(v);
      },
      'Enter a valid URL (e.g. https://example.com)'
    )
    .optional()
    .default(''),
  phone: z
    .string()
    .optional()
    .default(''),
});

export type EditProfileFormData = z.infer<typeof editProfileSchema>;
