#!/usr/bin/env node
/**
 * Batch-fix: replace type imports from ../data/mockData with ../domain
 * Phase 5 WP10/P5-20 completion audit.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Map of mockData type imports → domain equivalents
const TYPE_MAPPINGS = [
  // Single type imports
  { from: /import type \{ Listing \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { Listing } from '../domain';" },
  { from: /import type \{ Listing \} from ['"]\.\.\/\.\.\/data\/mockData['"];?/g, to: "import type { Listing } from '../../domain';" },
  { from: /import type \{ ListingSeller \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { ListingSeller } from '../domain';" },
  { from: /import type \{ ListingSeller \} from ['"]\.\.\/\.\.\/data\/mockData['"];?/g, to: "import type { ListingSeller } from '../../domain';" },
  { from: /import type \{ Conversation \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { Conversation } from '../domain';" },
  { from: /import type \{ Conversation \} from ['"]\.\.\/\.\.\/data\/mockData['"];?/g, to: "import type { Conversation } from '../../domain';" },
  { from: /import type \{ Message \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { Message } from '../domain';" },
  { from: /import type \{ Message \} from ['"]\.\.\/\.\.\/data\/mockData['"];?/g, to: "import type { Message } from '../../domain';" },
  { from: /import type \{ ChatBot \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { ChatBot } from '../domain';" },
  { from: /import type \{ ChatBot \} from ['"]\.\.\/\.\.\/data\/mockData['"];?/g, to: "import type { ChatBot } from '../../domain';" },
  { from: /import type \{ ChatAgentConfig \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { ChatAgentConfig } from '../domain';" },
  { from: /import type \{ ChatAgentConfig \} from ['"]\.\.\/\.\.\/data\/mockData['"];?/g, to: "import type { ChatAgentConfig } from '../../domain';" },
  // Multi-type imports
  { from: /import type \{ ChatAgentConfig, ChatBot \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { ChatAgentConfig, ChatBot } from '../domain';" },
  { from: /import type \{ ChatAgentConfig, ChatBot \} from ['"]\.\.\/\.\.\/data\/mockData['"];?/g, to: "import type { ChatAgentConfig, ChatBot } from '../../domain';" },
  { from: /import type \{ ChatAgentConfig, ChatBot, Conversation, Message \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { ChatAgentConfig, ChatBot, Conversation, Message } from '../domain';" },
  { from: /import type \{ ChatBot, Conversation, Message as ConversationMessage \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { ChatBot, Conversation, Message as ConversationMessage } from '../domain';" },
  { from: /import type \{ Conversation, Message \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { Conversation, Message } from '../domain';" },
  { from: /import type \{ Conversation, Message \} from ['"]\.\.\/\.\.\/data\/mockData['"];?/g, to: "import type { Conversation, Message } from '../../domain';" },
  { from: /import type \{ Listing, ListingSeller \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { Listing, ListingSeller } from '../domain';" },
  { from: /import type \{ Message as ConversationMessage \} from ['"]\.\.\/\.\.\/data\/mockData['"];?/g, to: "import type { Message as ConversationMessage } from '../../domain';" },
  { from: /import type \{ Message as ConversationMessage \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { Message as ConversationMessage } from '../domain';" },
  { from: /import type \{ Listing as CatalogListing \} from ['"]\.\.\/data\/mockData['"];?/g, to: "import type { Listing as CatalogListing } from '../domain';" },
];

// Files to process (from the check-mockdata-imports output, excluding test files)
const FILES = [
  'src/components/chat/ConversationManagementRow.tsx',
  'src/components/closet/ClosetMediaMosaic.tsx',
  'src/components/closet/CollectionCard.tsx',
  'src/components/discover/PinterestMasonryGrid.tsx',
  'src/components/listing/ListingSellerRow.tsx',
  'src/components/poster/DetailsDrawer.tsx',
  'src/components/product/BundleUpsellRow.tsx',
  'src/components/product/DiscoveryGrid.tsx',
  'src/components/product/RecommendationRail.tsx',
  'src/components/ProductCardV2.tsx',
  'src/hooks/chat/useConversationMessages.ts',
  'src/hooks/useFollowingFeed.ts',
  'src/hooks/useForYouFeed.ts',
  'src/hooks/useSavedSearchAlerts.ts',
  'src/hooks/useSoldComps.ts',
  'src/platform/product/recommendationTypes.ts',
  'src/presentation/homeDiscoveryViewModel.ts',
  'src/screens/BotBuilderScreen.tsx',
  'src/screens/BrowseScreen.tsx',
  'src/screens/CreateAuctionScreen.tsx',
  'src/screens/ExploreCollectionScreen.tsx',
  'src/screens/GroupChatScreen.tsx',
  'src/screens/InboxScreen.tsx',
  'src/screens/ItemDetailScreen.tsx',
  'src/screens/VisualSearchScreen.tsx',
  'src/services/botsApi.ts',
  'src/services/chatApi.ts',
  'src/services/coOwnPortfolio.ts',
  'src/services/feedApi.ts',
  'src/store/useStore.ts',
  'src/utils/chatSafetyWarnings.ts',
  'src/utils/conversationAttention.ts',
  'src/utils/conversationClassification.ts',
  'src/utils/coOwnMessaging.ts',
  'src/utils/listingMediaGeometry.ts',
  'src/utils/systemMessageProvenance.ts',
];

let fixed = 0;
let skipped = 0;

for (const relPath of FILES) {
  const fullPath = join(ROOT, relPath);
  if (!existsSync(fullPath)) {
    console.log(`SKIP (not found): ${relPath}`);
    skipped++;
    continue;
  }
  let content = readFileSync(fullPath, 'utf8');
  let changed = false;
  for (const { from, to } of TYPE_MAPPINGS) {
    const newContent = content.replace(from, to);
    if (newContent !== content) {
      content = newContent;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(fullPath, content);
    console.log(`FIXED: ${relPath}`);
    fixed++;
  } else {
    console.log(`SKIP (no match): ${relPath}`);
    skipped++;
  }
}

console.log(`\nTotal: ${fixed} fixed, ${skipped} skipped`);
