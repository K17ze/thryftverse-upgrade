# Analytics, Experiments & Quality Telemetry

Do not A/B test basic correctness. First make the lifecycle coherent. Then optimise.

## Required events

### Product
- `product_view`
- `media_swipe`
- `delivery_details_open`
- `offer_start`
- `buy_start`
- `save_toggle`
- `message_seller`

### Checkout
- `checkout_started`
- `address_selected`
- `shipping_service_selected`
- `payment_method_selected`
- `payment_submitted`
- `payment_sca_started`
- `order_created`
- `payment_succeeded`
- `checkout_recovered_after_resume`
- structured failure code

### Seller fulfilment
- `fulfilment_opened`
- `label_requested`
- `label_ready`
- `qr_opened`
- `label_print_opened`
- `dropoff_search_opened`
- `carrier_first_scan`
- `deadline_extension_requested`
- fulfilment failure code

### Buyer post-purchase
- `track_opened`
- `carrier_external_opened`
- `inspection_opened`
- `inspection_accepted`
- `issue_started`
- `issue_submitted`
- `return_label_opened`
- `refund_status_viewed`

## Funnel quality metrics

- product view → checkout start;
- checkout start → paid order;
- paid sale → label generated;
- label generated → first scan;
- first scan before deadline;
- delivery → inspection resolved;
- issue start → successful case submission;
- support contacts caused by “how do I ship?”;
- duplicate mutation rate;
- provider recovery success;
- crash-free transactional sessions.

## UX diagnostic metrics

- time from seller opening paid order to label ready;
- number of taps from paid sale notification to QR;
- number of screens needed to find tracking;
- percentage of order views where user opens help immediately;
- repeated taps on disabled/slow CTA;
- back-and-forth navigation around shipping;
- action mismatch telemetry (UI action requested but server capability rejects).

## Guardrail

Never optimise away a protection disclosure or make a consequential action easier solely because conversion goes up.
