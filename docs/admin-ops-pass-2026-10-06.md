# Admin ops pass — grouped nav, ⌘K, "Today's work" (2026-10-06)

**Status:** shipped · **Surface:** `/admin` only (no customer-facing change) ·
**Language:** briefing in Bangla, UI terms in English.

The storefront's UX plan (`ux-sales-plan.md`, R0–R11) covered the buyer. The
admin shell had never had a pass of its own: **26 links in one flat list**,
every visit starting with a scan, and a dashboard that showed *figures* but
never answered the question the person on shift actually asks —
**"what needs me right now?"**

| Change | Where | Why |
|---|---|---|
| Grouped, foldable sidebar | `components/admin/admin-nav.ts`, `admin-sidebar-nav.tsx` | Ops · Catalog · People · Money · Reach · Insight & setup — no group is more than 5 links. A group you never open can be folded away; the badge moves to the group header, so a folded queue still shows its count. |
| ⌘K / Ctrl+K command palette | `components/admin/command-palette.tsx` | Type what you mean (`payo`, `bkash`, `coverage`, `approve`) and press ↵. Empty query lists the pages you actually visited, newest first. |
| "Today's work" | `lib/admin-todays-work.ts`, `components/admin/todays-work.tsx` | One list above the KPIs: orders needing a tap, bKash/Nagad to verify, parcels waiting for a rider, low stock, reviews to moderate — each row a door to that queue, each row saying how long the oldest one has waited. |
| `center` drawer side | `components/ui/drawer.tsx` | The palette reuses the shared dialog (Escape, focus trap, focus restoration, scroll lock, inert background) instead of growing a second one. |

## Rules the code follows

- **One source for the routes.** `admin-nav.ts` owns every admin href, its
  active-state matcher, its search keywords and its pending-queue badge. The
  sidebar, the palette and the header title all read it — a new page is added
  in exactly one place (the nav test fails if a route is listed twice or
  dropped from a group).
- **Pending counts are never hidden by a fold.** Shops / Riders / Access
  requests carry their count on the link; fold the group and the count moves
  to the header (`6 waiting in People`).
- **Today's work lists only queues that have something in them.** A quiet day
  reads *"every queue is clear"*, not four rows of zeros — the failure mode of
  every dashboard that renders counts unconditionally.
- **Urgent means past an SLA, not merely non-zero.** An order waiting 22 min is
  urgent (15 min SLA); a parcel waiting 41 min is urgent (30 min SLA). Money
  waiting for a TrxID is *work*, but it is never styled as "late" — verified in
  `lib/__tests__/admin-todays-work.test.ts`.
- **localStorage is the source of truth** for recents and the fold; React
  subscribes with `useSyncExternalStore` (identity-stable snapshots, server
  snapshot = empty), so there is no setState-in-effect and no hydration
  mismatch.
- **The palette body mounts only while the dialog is open**, so every visit
  starts with an empty query and the top row selected — no reset bookkeeping.

## Tests

`src/components/admin/__tests__/admin-nav.test.ts` (grouping, active state,
search ranking, recents/fold storage) ·
`admin-command-palette.test.tsx` (⌘K, arrow/Enter, recents, no-match, badges) ·
`admin-sidebar-nav.test.tsx` (groups, badges survive a fold, fold is
remembered) · `src/lib/__tests__/admin-todays-work.test.ts` (ordering, ages,
SLA, tone) · extended `src/app/admin/__tests__/admin-dashboard.test.tsx`.

`npm run lint && npm run typecheck && npm test && npm run build` — 3,329 tests.

## Next (not started)

1. **Saved views** on the order list (zone / status / shop remembered per
   staff member) — the filters still reset on every visit.
2. **Bulk actions with undo** — 20 orders at a time, with an Undo toast instead
   of a confirm dialog.
3. **Mobile ops** — tables become cards below `md`, so a queue can be worked
   from a phone.
4. **Bangla in the ops surfaces** — the storefront is bilingual, the admin is
   still English only.
