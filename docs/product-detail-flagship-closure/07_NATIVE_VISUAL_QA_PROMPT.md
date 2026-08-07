# Native Visual QA Prompt

## Objective

Perform true native visual acceptance for Direct Listing, Auction and Co-Own.

Source-reading tests do not count as visual acceptance.

## Runtime mode

Use integration-truth or production-like mode.

Do not use fixture fallback to make empty screens look complete.

## Required devices and widths

Capture at:

- 320 logical width;
- 360 logical width;
- 390 logical width;
- 430 logical width;
- representative Android device;
- representative iOS device.

Test:

- light mode;
- dark mode;
- large text;
- reduced motion.

## Required Direct Listing states

- buyer;
- owner;
- sold;
- unavailable;
- long title;
- missing seller avatar;
- one image;
- multiple images;
- no description;
- no price insight;
- purchase details;
- Q&A collapsed/open;
- overflow sheet;
- buy/offer dock.

## Required Auction states

- upcoming;
- live, not participating;
- watching;
- leading;
- outbid;
- seller;
- won;
- lost;
- cancelled;
- ended without bids;
- buy-now available;
- no reserve;
- reserve unmet;
- multi-media;
- overflow;
- bid sheet;
- buy-now sheet;
- fulfilment next step.

## Required Co-Own states

- non-holder;
- holder;
- issuer;
- rights incomplete;
- open;
- paused;
- fully allocated;
- no bid/ask;
- stale market;
- unavailable market snapshot;
- no settled price history;
- price-history error;
- real line history;
- candle data available;
- full dossier;
- supply sheet;
- rights sheet;
- overflow;
- sell/buy-more dock.

## Capture positions

For every required screen:

1. top viewport;
2. transaction module;
3. middle content;
4. sticky dock;
5. expanded sheet;
6. end of scroll.

## Reject conditions

Reject the pass if any of the following occurs:

- text clipping;
- bid/ask collision;
- repeated large price;
- repeated family badge;
- duplicated terminal state;
- inactive chart controls;
- giant passive warning;
- dock covers content;
- button labels truncate;
- sheet ignores safe area;
- seller row breaks with long name;
- missing data becomes zero;
- visible debug gear or diagnostic badge;
- dark mode uses light static surfaces;
- three-column phone content feels cramped;
- page ends with excessive recommendation modules;
- animation ignores reduced motion.

## Report

Provide:

- screenshot paths;
- device;
- width;
- OS;
- theme;
- state;
- pass/fail;
- issue description;
- exact component responsible.

## Commit

`test(product-detail): complete native visual acceptance matrix`
