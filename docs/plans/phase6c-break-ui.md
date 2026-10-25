# Phase 6C — break-ui report

> `e2e/break-ui-6c.spec.ts` (`@breakui`, `pnpm --filter @vyuh/web e2e:breakui`), out `apps/web/e2e/checkpoint/6c/break/` (git-ignored). Same method as 6B (decision 152): real API responses rewritten in flight — never the components — into **demo / worst / empty / one / many**. Pages: home, notices, service record, AAR remarks (trainee); readiness, live sessions (instructor) at 1366 and 1920; status at 360 and 1366 (demo / worst / empty / many); landing, sources (technical notes open), login at 360 and 1366. Run 2026-10-25 on the dev server: 30 / 30, no horizontal scroll anywhere after the fixes (`overflow.txt`, 76 measurements).

Limits used: user and unit names 120, scenario name 200, scenario code 16 (`AUT-…`), remark 500, notices 50 per response (API); counts unbounded. Worst values: "Lt Col Raghavendra Venkatanarasimharajuvaripeta", "Jo", "Air Defence Training Wing — Detachment 7 (Northern Sector)", a 500-character remark ending in an unbroken URL, 1,284 sessions / unread / open assignments, 12,840 stage contacts, 1234.5 s latency, a 30-character API version, 24 terrain presets.

## What broke (all fixed)

| #   | Severity | Page · field                                      | Worst-case value                                                | What happened                                                                                                                                              | Fix                                                                                                                       |
| --- | -------- | ------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Broken   | Status · versions at 360 px                       | API version `0.1.0+build.2026-10-25.7d5dbb9`, long preset names | Value cells did not wrap: the page scrolled 199–207 px sideways. A first fix (`overflow-wrap: anywhere` alone) collapsed the value column to one character | `table-fixed` with 55 / 45 % shares, both cells wrap anywhere — `app/(public)/status/page.tsx`                            |
| 2   | Ugly     | Home, service record, readiness, notices · counts | 1,284 sessions; 12,840 contacts                                 | "1284", "of 12840": no thousands separator                                                                                                                 | `formatCount` (`lib/strings.ts`) in fact strips, stage notes, criteria values (`lib/record.ts`), readiness counts, unread |
| 3   | Fragile  | Service record · endorsement "First earned"       | 200-character scenario name                                     | Link did not wrap and widened its column (still fit at 1366)                                                                                               | Cell wraps with a 16 rem width — `app/record/page.tsx`                                                                    |

## Decisions

- **Live sessions trainee name truncates** (title holds the full name) rather than wrapping: rows stay one line in a table that refreshes every 10 s. Kept.
- **Readiness sign-off cell** grows with "Engagement controller · ready to sign" plus "Review due": at 1366 the trainee column yields, which is the right column to give space. Kept.
- **The top bar shows "99+"** while the Notices fact strip shows the exact count. Kept: the bar must not grow; the page can.

## What held up

120-character names wrap in page headers and record panels; 500-character remarks and an unbroken URL wrap in notices, home and the AAR side panel (`overflow-wrap: anywhere`); empty states are worded on every page (home first-run welcome, "No notices yet.", record "Nothing counts yet…", readiness and live table notices); one-item lists read correctly (no "1 sessions"); 60 live rows and 120 readiness rows keep the layout; the 4-tab AAR side panel stays on one line with the Remarks count.
