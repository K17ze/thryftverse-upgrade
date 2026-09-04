/**
 * Curated fashion aesthetic presets for Group Chat branding.
 * High-quality, art-directed photography and textures aligned with
 * Thryftverse fashion taxonomy (streetwear, vintage, luxury, denim, Y2K).
 */

export interface GroupAestheticPreset {
  id: string;
  label: string;
  category: 'streetwear' | 'vintage' | 'luxury' | 'denim' | 'y2k' | 'minimal';
  avatarUri: string;
  coverUri: string;
}

export const GROUP_AESTHETIC_PRESETS: GroupAestheticPreset[] = [
  {
    id: 'vintage-archive',
    label: 'Vintage Archive',
    category: 'vintage',
    avatarUri: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=300&q=80',
    coverUri: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1200&q=80',
  },
  {
    id: 'streetwear-hype',
    label: 'Streetwear & Sneakers',
    category: 'streetwear',
    avatarUri: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=300&q=80',
    coverUri: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=1200&q=80',
  },
  {
    id: 'luxury-vault',
    label: 'Luxury Vault',
    category: 'luxury',
    avatarUri: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300&q=80',
    coverUri: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80',
  },
  {
    id: 'denim-club',
    label: 'Selvedge Denim Club',
    category: 'denim',
    avatarUri: 'https://images.unsplash.com/photo-1542272604-780c96856592?w=300&q=80',
    coverUri: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=1200&q=80',
  },
  {
    id: 'y2k-cyber',
    label: 'Cyber Y2K',
    category: 'y2k',
    avatarUri: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=300&q=80',
    coverUri: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1200&q=80',
  },
  {
    id: 'minimal-studio',
    label: 'Minimal Studio',
    category: 'minimal',
    avatarUri: 'https://images.unsplash.com/photo-1508296695146-257a814070b4?w=300&q=80',
    coverUri: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&q=80',
  },
];

export function getAestheticPresets(target: 'avatar' | 'cover'): Array<{ id: string; label: string; uri: string }> {
  return GROUP_AESTHETIC_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    uri: target === 'avatar' ? p.avatarUri : p.coverUri,
  }));
}
