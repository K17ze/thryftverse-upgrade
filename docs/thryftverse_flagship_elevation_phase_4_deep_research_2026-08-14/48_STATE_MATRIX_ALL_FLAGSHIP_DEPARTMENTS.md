# State matrix — every flagship department

A polished happy-path screen with weak states is not production flagship.

---

## Home
- initial loading;
- cached refreshing;
- offline with cache;
- hard error;
- empty;
- media fail;
- pagination;
- hidden/not interested;
- video active/inactive.

## Explore
- Discover;
- Looks;
- Pulse;
- loading each;
- offline;
- no content.

## Search
- idle;
- focused;
- typing;
- suggestions;
- items;
- people;
- filtered;
- visual;
- zero;
- backend error;
- cached/offline;
- saved search.

## Closet
- empty;
- large saved library;
- price drops;
- collection empty;
- collection full;
- manage/reorder;
- search zero.

## Product
- active;
- sold;
- reserved;
- own listing;
- one media;
- video;
- incomplete attributes;
- luxury/authenticated;
- seller unavailable;
- offer;
- bundle;
- offline.

## Sell
- new;
- restored draft;
- media uploading;
- media fail/retry;
- fixed;
- auction;
- Co-Own handoff;
- validation error;
- offline draft;
- publish;
- publish recoverable fail.

## Auction Home
- Live;
- Upcoming;
- Results;
- Watching;
- no live;
- outbid attention;
- filters;
- search.

## Auction Detail
- upcoming;
- live no bid;
- live leading;
- live outbid;
- live final minute;
- reserve;
- ended win;
- ended lose;
- sold buy-now;
- stale;
- offline.

## Co-Own Hub
- no holdings;
- holdings;
- no market;
- watchlist;
- new issues;
- holdings unavailable;
- offline.

## Asset
- non-holder;
- holder;
- market closed;
- reconciliation;
- incomplete rights;
- evidence unavailable;
- stale.

## Due Diligence
- full;
- sparse;
- TBC;
- appraisal updating;
- evidence failed.

## Profile
- owner;
- owner incomplete;
- public;
- seller;
- no media;
- blocked/restricted where applicable.

## Settings
- signed in;
- hydrating;
- search;
- developer;
- permission denied;
- external-link fail.

## Inbox
- 0;
- primary;
- buying;
- selling;
- requests;
- archived;
- offline;
- sync fail.

## Chat
- normal;
- listing context;
- order context;
- attachment;
- offer;
- reply;
- safety warning;
- agent working;
- agent draft;
- approval;
- send fail;
- offline.

## Connections
- no providers;
- one;
- invalid;
- testing;
- disconnected;
- active agent session.

## Creator Camera
- permission ask;
- denied;
- limited library;
- photo;
- video;
- timer;
- multi;
- interruption.

## Poster
- one frame;
- 10 frames;
- image;
- video;
- selected text;
- selected product;
- unsaved;
- publish;
- error.

## Look
- blank;
- one object;
- many objects;
- product;
- manual crop;
- arrangement;
- publish.

## Wallet
- empty;
- balance;
- pending;
- hold;
- reconciliation;
- auth denied;
- offline.

## Convert
- amount;
- invalid;
- review;
- auth;
- execute;
- receipt;
- failure.

## Checkout
- no address;
- no payment;
- wallet;
- shipping unavailable;
- SCA;
- pending;
- failed;
- succeeded.

## Orders
- placed;
- processing;
- shipped;
- delivered;
- dispute;
- refunded.

## Seller
- new;
- active;
- needs action;
- no analytics;
- high volume.

## Notifications
- empty;
- social;
- transactional;
- mixed;
- quiet hours;
- unread.

---

# State design rules

1. State should modify the existing screen identity, not replace it with a generic canvas wherever possible.
2. Loading geometry mirrors final geometry.
3. Error preserves user context if stale/cached data exists.
4. Offline disables only actions that require network.
5. Success advances the workflow.
6. Pending transaction state is durable and recoverable.
7. No fake data is inserted to make a state visually full.
8. Attention color reserved for real attention.

Every department implementation prompt must include its full state matrix.
