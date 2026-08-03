import { z } from 'zod';

// ── Sell / Create-listing form schema ──────────────────────────────
// This schema is the single source of truth for listing validation.
// It is used inside `handlePublish` to produce the `errors` record that
// drives inline error display below each field.
//
// Conditional fields (auction starting bid, co-own share count / price /
// auth photos) are validated separately in the publish handler because
// they depend on the selected `listingMode`.

export const sellListingSchema = z.object({
  photos: z
    .array(z.string())
    .min(1, 'Add at least one photo before publishing.'),
  title: z
    .string()
    .min(1, 'Please provide a title.')
    .transform((v) => v.trim()),
  category: z
    .string()
    .min(1, 'Please select a category.'),
  size: z
    .string()
    .min(1, 'Please choose a size.'),
  condition: z
    .string()
    .min(1, 'Please choose a condition.'),
  description: z
    .string()
    .min(10, 'Add a description with at least 10 characters.')
    .transform((v) => v.trim()),
  price: z
    .number()
    .positive('Enter a valid price greater than 0.'),
});

export type SellListingFormData = z.infer<typeof sellListingSchema>;

// ── Auction-specific extension ─────────────────────────────────────
export const auctionExtensionSchema = z.object({
  startingBid: z
    .number()
    .positive('Enter a valid starting bid greater than 0.'),
});

export type AuctionExtensionData = z.infer<typeof auctionExtensionSchema>;

// ── Co-own-specific extension ──────────────────────────────────────
export const coOwnExtensionSchema = z.object({
  shareCount: z
    .number()
    .int()
    .positive('Enter a valid share count.'),
  sharePrice: z
    .number()
    .positive('Enter a valid share price.'),
  authPhotos: z
    .array(z.string())
    .min(1, 'Attach authentication photos before issuing co-own units.'),
});

export type CoOwnExtensionData = z.infer<typeof coOwnExtensionSchema>;
