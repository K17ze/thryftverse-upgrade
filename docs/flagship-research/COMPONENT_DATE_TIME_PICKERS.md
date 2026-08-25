# ThryftVerse Flagship Upgrade — Date & Time Pickers

**Component deep-dive:** every calendar, date picker, time picker, date range picker, and time slot selector in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### eBay (2026)
eBay's auction creation uses a native date picker (`@react-native-community/datetimepicker`) for selecting auction end times. The picker appears as a bottom sheet on iOS and a dialog on Android. Quick-select chips ("1 day", "3 days", "7 days") sit above the picker for common durations. eBay's lesson: **chips for common selections + native picker for custom dates = speed + flexibility.**

### Instagram (2026)
Instagram's event/scheduling flows use an inline calendar with date range selection. The calendar highlights the selected range with a brand-colored fill. Time selection uses a wheel picker (iOS-style) for hour/minute. Instagram's lesson: **inline calendars are more discoverable than modal pickers for date ranges.**

### Cross-cutting 2026 consensus
- **Native picker for single date/time** — `@react-native-community/datetimepicker` on both platforms.
- **Quick-select chips** for common durations (1h, 6h, 1d, 3d, 7d) above the picker.
- **Calendar for date ranges** — visual calendar with highlighted range.
- **Wheel picker for time** — iOS-style spinning wheel for hour:minute.
- **Timezone awareness** — store all times as UTC, display in user's local timezone.
- **Date formatting** — use `date-fns` or `dayjs` for consistent formatting across locales.

---

## 2. Psychology & Principles

### Relative vs absolute time
For auction durations, relative time ("ends in 3 days") is more intuitive than absolute time ("ends Aug 21 at 2:30 PM"). But for scheduling ("ship by August 20"), absolute time is necessary. The 2026 standard: offer both — quick-select chips for relative durations, native picker for absolute dates.

### Calendar visualization
A calendar makes date selection spatial — the user sees the relationship between days, weeks, and the selected date. This is more informative than a text input or a wheel picker for date selection. For date ranges, the calendar shows the span visually, which helps the user understand the duration at a glance.

### Timezone confusion
The most common date/time bug: a seller in London sets an auction end time, a buyer in New York sees a different time because of timezone conversion. The 2026 standard: store all times as UTC, display in the user's local timezone, and label the timezone ("Ends Aug 21, 2:30 PM BST").

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Date/time picker components: NONE
The codebase has **zero dedicated date/time picker components**. No `@react-native-community/datetimepicker`, no `react-native-calendars`, no `dayjs`, no `date-fns`.

### Current date/time selection methods

| Screen | Lines | Method | Defect |
|--------|-------|--------|--------|
| `CreateAuctionScreen.tsx` | 35-47, 322-376 | Hardcoded chip selection (3h/6h/12h/24h/3d durations, Now/30m/1h/3h start windows) | No custom date/time |
| `SellerFulfilmentScreen.tsx` | 61-86, 382-398 | Server-calculated dispatch deadline (read-only display) | Not user-configurable |
| `PushNotificationsScreen.tsx` | 320-384 | Custom 24-hour grid picker (hour-level only) | No minutes, no native picker |
| `NotificationPreferencesScreen.tsx` | 230-294 | Same 24-hour grid | Same defects |
| `CreatorAssetPicker.tsx` | 4131-4200 | Format selector only (time/date/datetime), always uses `new Date().toISOString()` | No actual date input |

### Date formatting utilities
- `utils/dateFormat.ts` (134 lines) — centralized formatting functions (formatShortDate, formatFullDate, formatTime, formatRelativeTime, etc.)
- **Hardcoded to `'en-GB'` locale** — no locale awareness
- **No timezone handling** — all dates use device local time

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No date picker library installed** | package.json | Critical |
| 2 | **No calendar component** | Global | High |
| 3 | **No native date/time picker integration** | Global | High |
| 4 | **Auction end time limited to predefined chips** (3h/6h/12h/24h/3d) | `CreateAuctionScreen.tsx:35-47` | High |
| 5 | **Dispatch date not user-configurable** — server-calculated only | `SellerFulfilmentScreen.tsx` | Medium |
| 6 | **No timezone handling** — all dates use device local time | `utils/dateFormat.ts` | High |
| 7 | **Quiet hours limited to hour-level precision** — no minutes | PushNotificationsScreen, NotificationPreferencesScreen | Medium |
| 8 | **Hardcoded `'en-GB'` locale** in date formatting | `utils/dateFormat.ts` | Medium |
| 9 | **No date range picker** | Global | Medium |
| 10 | **No time slot selector** for scheduling | Global | Low |
| 11 | **Creator time layer always uses `new Date().toISOString()`** — no date selection | `CreatorAssetPicker.tsx:4148` | Low |

---

## 4. Micro Improvements

### M1 — Install date picker library
Add `@react-native-community/datetimepicker` for native date/time pickers. Add `dayjs` with timezone plugin for timezone-aware date handling.

### M2 — Add native date/time picker to auction creation
In `CreateAuctionScreen.tsx`, add a native date picker below the quick-select chips. Keep chips for common durations; add picker for custom end times.

### M3 — Add timezone handling
- Store all times as UTC in the backend
- Display in user's local timezone using `dayjs.tz()`
- Label the timezone in the UI ("Ends Aug 21, 2:30 PM BST")
- Add timezone preference to settings

### M4 — Add minute-level precision to quiet hours
Replace the 24-hour grid with a native time picker that supports hour:minute selection.

### M5 — Add seller dispatch settings
Create a seller settings screen where sellers can configure their default dispatch window ("Dispatch within 1/2/3/5/7 days"). Integrate with backend dispatch calculation.

### M6 — Localize date formatting
Replace hardcoded `'en-GB'` with the user's locale from `react-native-localize` (per Report #26).

---

## 5. Macro Improvements

### A1 — Date/time component system
Create a unified date/time component family:
- `DatePicker` — native single date picker (bottom sheet on iOS, dialog on Android)
- `TimePicker` — native time picker with hour:minute
- `DateRangePicker` — calendar with range selection
- `TimeSlotSelector` — list of available time slots
- `DurationChips` — quick-select chips for common durations (1h, 6h, 1d, 3d, 7d)

All share: UTC storage, local display, timezone labels, locale-aware formatting.

### A2 — Timezone-aware architecture
- All backend times stored as UTC
- All API responses include UTC ISO strings
- Client converts to local timezone for display
- User can override timezone in settings
- Auction end times, dispatch deadlines, and quiet hours all respect timezone

---

## 6. Flagship Acceptance Criteria

- **Native date/time picker** for all date/time selection
- **Quick-select chips** for common durations alongside the picker
- **Calendar component** for date range selection
- **Timezone-aware** — UTC storage, local display, timezone labels
- **Locale-aware formatting** — not hardcoded to `'en-GB'`
- **Minute-level precision** for time selection (not hour-only)
- **Seller-configurable dispatch window** in settings
- **`dayjs` or `date-fns`** for date manipulation and formatting

### Thumbnail test
At 25% scale, a date picker must show: the current month name, at least 2 weeks of dates, and the selected date highlighted. A time picker must show hour and minute values clearly.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Install date picker + dayjs | Low | All date/time |
| P0 | M3 — Timezone handling | Medium | Cross-timezone users |
| P1 | M2 — Native picker for auctions | Low | Auction scheduling |
| P1 | M6 — Localize date formatting | Low | i18n (Report #26) |
| P1 | M4 — Minute-level quiet hours | Low | Notification UX |
| P2 | M5 — Seller dispatch settings | Medium | Seller config |
| P3 | A1 — Full date/time system | High | All date surfaces |
| P3 | A2 — Timezone architecture | High | Architectural |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `datePicker.variant` | native (iOS bottom sheet, Android dialog) | Platform-native |
| `datePicker.quickSelect` | DurationChips above picker | 1h, 6h, 1d, 3d, 7d |
| `dateRangePicker.calendar` | Monthly view with range highlight | Brand-colored fill |
| `timePicker.precision` | minute | Not hour-only |
| `timezone.storage` | UTC | All backend times |
| `timezone.display` | User local | With timezone label |
| `dateFormat.locale` | From react-native-localize | Not hardcoded |
| `dateFormat.library` | dayjs with timezone plugin | Lightweight |

---

*Generated 2026-08-18. Sources: production codebase audit, eBay auction creation patterns, @react-native-community/datetimepicker docs.*
