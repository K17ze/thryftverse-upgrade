/**
 * Standardized user-facing copy for ThryftVerse.
 * 
 * Terminology rules:
 * - "item" for buyer-facing contexts (what users browse/buy)
 * - "listing" for seller-facing contexts (what users create/manage)
 * - Never use "product" or "piece" in user-facing copy
 * 
 * Action verbs:
 * - "Buy" (never "Purchase" or "Get")
 * - "List" for creating listings (never "Post" or "Create listing")
 * - "Save" for bookmarking (never "Bookmark" or "Add to wishlist")
 * 
 * Error format:
 * - "Couldn't [action]" (never "Could not" or "Unable to")
 * - "Check your connection and try again" for network errors
 */

export const COPY = {
  terminology: {
    // Buyer-facing
    item: 'item',
    items: 'items',
    // Seller-facing
    listing: 'listing',
    listings: 'listings',
  },

  loading: {
    feed: 'Finding your feed',
    items: 'Finding items',
    looks: 'Loading your looks',
    profile: 'Loading profile',
    wallet: 'Loading wallet',
    auction: 'Loading auction',
    search: 'Searching',
  },

  error: {
    network: "Check your connection and try again",
    generic: "Something went wrong. Try again.",
    loadFeed: "Couldn't load your feed",
    loadItems: "Couldn't load items",
    loadProfile: "Couldn't load profile",
    loadWallet: "Couldn't load wallet",
    loadAuction: "Couldn't load this auction",
    loadArchive: "Couldn't load archive",
    loadStories: "Couldn't load stories",
    loadPortfolio: "Couldn't load portfolio",
    loadAsset: "Couldn't load asset",
    loadConversations: "Couldn't load conversations",
    loadNotifications: "Couldn't load notifications",
    publishListing: "Couldn't publish your listing. Try again.",
    prepareCoOwn: "Couldn't prepare co-own listing.",
    prepareAuction: "Couldn't prepare auction. Try again.",
    priceAlert: "Couldn't update price alert. Try again.",
    convert: "Couldn't convert that amount right now.",
    buy: "Couldn't complete that purchase right now.",
    payment: "Payment didn't go through. Try again.",
    paymentPending: "Payment is still processing.",
    paymentProvider: "This payment method can't complete checkout on this device.",
    cancelOrder: "Couldn't cancel your existing order.",
  },

  empty: {
    feed: "Nothing here yet. Pull to refresh or explore curated categories.",
    feedFiltered: "No items match your filters. Try adjusting them.",
    browse: "No items here yet. Try a different category or check back later.",
    search: "No results found. Try a different search term.",
    searchHint: "Try searching for a brand, category, or keyword",
    closet: "Tap the heart on any item to save it here.",
    closetWishlist: "Heart items to track them here.",
    listings: "List your first item to start selling.",
    listingsFiltered: "No listings match this filter.",
    orders: "No orders yet. Your purchases will appear here.",
    notifications: "No notifications yet. We'll let you know when something happens.",
    conversations: "No conversations yet. Message a seller to get started.",
    auctions: "No auctions running right now. Check back soon.",
    bids: "No bids yet. Be the first to bid.",
    wallet: "Your wallet is empty. Add 1ZE to get started.",
    walletTransactions: "No transactions yet. Your history will appear here.",
    looks: "No Looks yet. Create your first Look to showcase your style.",
    looksHint: "Combine items into a styled outfit to share with the community.",
    profileAbout: "Add details to your profile so others can get to know you.",
    bundle: "No items available for bundling right now.",
    syndicate: "No items yet. Add items to your syndicate to get started.",
    collection: "No items in this collection yet.",
    moodboard: "No items available to add. List items first to build moodboards.",
    outfit: "No items to add. Save items to your closet first.",
  },

  offline: "You're offline. Some features may be limited.",

  actions: {
    buy: 'Buy',
    sell: 'Sell',
    list: 'List',
    save: 'Save',
    message: 'Message',
    bid: 'Place bid',
    makeOffer: 'Make offer',
    publish: 'Publish',
    retry: 'Try again',
    refresh: 'Refresh',
    clearFilters: 'Clear filters',
    startSelling: 'Start selling',
    createListing: 'List an item',
  },

  placeholders: {
    titleExample: "e.g. Vintage Levi's 501 Denim Jacket",
    description: "Describe the fit, fabric, flaws, and why you love it...",
    searchGlobal: 'Search Thryftverse',
    searchConversational: 'Describe what you are looking for...',
    searchAuctions: 'Search auctions',
    searchMessages: 'Search messages',
    searchInventory: 'Search by title or brand',
    searchOrders: 'Search by item, order, or tracking',
    searchSettings: 'Search settings',
    searchHelp: 'Search FAQs',
  },
} as const;
