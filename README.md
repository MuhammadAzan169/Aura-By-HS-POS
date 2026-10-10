# Aura by HS

*Bridal make-up · Saloon services · Photography studio*

A production-quality **front end** for a multi-branch salon business: bookings, point of sale,
customers, staff rotas, stock and reporting, for one owner and three salon branches.

It runs in two modes, picked automatically:

- **Online** — when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. Data lives in
  Supabase (Postgres) and is shared live between every branch; sign-in is Google or email +
  password; row-level security keeps each branch inside its own data. **To launch, follow
  [docs/GO_LIVE.md](docs/GO_LIVE.md).**
- **Demo** — with no keys. A generated dataset in the browser, with one-click demo logins.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build
npm run typecheck    # tsc --noEmit
```

Requires Node 18 or newer.

---

## Demo credentials

Shown on the login screen, with **Login as Admin** / **Login as Shop** buttons for one-click access.

| Role | Email | Password | Sees |
| --- | --- | --- | --- |
| Owners (admin) — Hira & Shumaila | `admin@aurabyhs.pk` | `admin123` | Everything, across all three branches |
| Branch (shop) | `gulberg@aurabyhs.pk` | `shop123` | Aura Gulberg only |
| Branch (shop) | `dha@aurabyhs.pk` | `shop123` | Aura DHA Phase 6 only |
| Branch (shop) | `clifton@aurabyhs.pk` | `shop123` | Aura Clifton only |

A shop account that navigates to an admin URL is redirected to its own dashboard with an
"Access denied" message. Shop accounts can never read another branch's data — the boundary is
enforced in the service layer, not just in the UI.

**Reset demo data** lives in *Settings → Data* (admin). The seed is deterministic, so a reset always
rebuilds exactly the same starting dataset.

---

## What's in the build

### Admin portal
Dashboard · Shops · Appointments · Customers · Staff · Services · Packages · Memberships ·
Products · Inventory · Sales & Billing · Expenses · Reports · Notifications · Settings

### Shop portal
Dashboard · Appointments · Customers · Sales & Billing · Services (read-only) · Staff Schedule ·
Inventory · Notifications · Shop Profile

### The parts worth looking at first

- **`src/services/availability.ts`** — the booking engine. Pure functions, no store access. A slot
  is only offered when the shop is open, the stylist is rostered and not on leave, the slot fits
  their shift, misses their break, does not overlap another appointment, and the stylist is
  qualified for every selected service. Blocked slots are still rendered, greyed out and carrying
  the reason, because an empty morning is more confusing than an explained one. The same rules are
  re-run at submit time, so a slot taken while the form was open is refused with a clear message.

- **`src/services/pricing.ts`** — one implementation of bill arithmetic, used by the till, the
  receipt, the seed data and the reports, so a total can never disagree with itself. The order of
  operations is fixed: line discounts → membership → bill discount → tax.

- **`src/features/billing/`** — the point of sale. Item picker on the left, cart always visible on
  the right, a sticky bottom sheet on phones. The cart is persisted, so a refresh mid-sale loses
  nothing. Products cannot be oversold; the tile disables itself at zero stock.

- **`src/services/reportService.ts`** — every figure in the dashboards and reports, computed live
  from the tables. Nothing is cached or hard-coded.

### Connected behaviour

These are wired through, not faked:

- A new customer appears immediately in Customers, the booking form and the till.
- A new appointment appears in the calendar, both dashboards, the staff schedule and the customer's
  history, and raises a notification.
- Completing a sale updates revenue, the dashboards, every report, the customer's spend and visit
  history, stock levels, the movement log and the bills list, and raises a notification.
- A sale's product lines decrement stock; dropping to or below the minimum raises a low-stock alert.
- Refunding a bill reverses the revenue and puts the products back on the shelf.
- Editing a service's price changes what booking and billing charge from that moment on, while past
  appointments keep the price they were booked at.
- Changing a stylist's rota or booking them leave immediately changes which slots are offered.
- Editing a shop's profile changes the header and the next receipt.

---

## Folder structure

```
src/
  app/               Router, layouts, role-based route guards, navigation config
  components/ui/     The component library — everything is built from these
  components/shared/ App shell: sidebar, top bar, shop switcher, notification bell
  features/          One folder per domain area; pages and their local components
    auth/ dashboard/ shops/ appointments/ customers/ staff/ services/
    packages/ memberships/ products/ inventory/ billing/ expenses/
    reports/ notifications/ settings/ misc/
  services/          The ONLY place data is read or written. One module per entity.
  store/             Zustand stores: data, auth, UI/toasts, shop scope, cart
  mock/              Seed data generators (deterministic)
  types/             Domain types — one file per entity, re-exported from index.ts
  hooks/             useDb, useShopScope, useTableState, useAsyncAction, useConfirm, …
  utils/             Formatting, dates, money, CSV export, storage, status rules
```

Rules the codebase follows:

- Components never import from `src/mock/` — they go through `src/services/`.
- Every record has `id`, `createdAt`, `updatedAt`, and `shopId` where it belongs to a branch.
- Money is a plain number rounded to two decimals at every boundary; all display goes through
  `formatCurrency`.
- TypeScript is strict, with `noUncheckedIndexedAccess`. There is no `any` in the codebase.

---

## Design

- **Palette** — drawn from the *Aura by HS* logo: bridal maroon (`#7A181C`) as the brand colour
  with an antique-gold accent, on white cards over a warm ivory canvas. Dark mode is the logo
  itself — near-black maroon with the gold on top. Defined as CSS custom properties in
  `src/index.css` and exposed to Tailwind as semantic names (`brand`, `accent`, `ink`, `muted`,
  `line`, `canvas`, `surface`), so no component hard-codes a hex value — re-theming the whole app
  means editing that one block.
- **Contrast** — all 54 text/background token pairs clear WCAG AA (4.5:1) in both themes,
  verified programmatically against the running app. Where a fill is light in one theme and dark
  in the other — gold, and the rose used for `danger` in dark mode — the text on it comes from a
  paired `*-ink` token rather than a hard-coded `text-white`, which is what keeps a destructive
  button legible after the theme flips.
- **Brand assets** — the supplied logo is used directly: `public/aura-mark.jpg` (the ring
  monogram, cropped square for the sidebar, the topbar and the favicon) and `public/aura-brand.jpg`
  (the full poster, blurred behind the login panel as texture). The poster bakes in its own
  wordmark at a fixed position, so the login identity is redrawn from the mark plus live type —
  that keeps it sharp and stops it colliding with the headline at any window size.
- **Scrollbars and selection** follow the theme rather than the operating system: a brand-tinted
  pill on a transparent track, in both WebKit and Firefox.
- **Type** — Inter for the interface, Fraunces for headings and figures.
- **Dark mode** is included and remembered; toggle it from the account menu.
- **Responsive** — the admin portal is desktop-first, the shop portal works on a tablet or a phone.
  The sidebar collapses to a drawer, tables become cards, the billing cart becomes a bottom sheet,
  and the shop portal gets a bottom nav bar for the four things the front desk does all day.
  Every route is checked for horizontal overflow at 360, 390, 768, 1024 and 1280 px wide; the
  narrowest of those is the one that catches real bugs, such as native date inputs refusing to
  shrink below their intrinsic width.
- **Accessibility** — labelled controls, visible focus rings, focus-trapped and escape-closable
  overlays, `aria-sort` on sortable columns, a skip link, and `prefers-reduced-motion` respected.

---

## How the online mode works

- `supabase/schema.sql` — one table per entity (`id`, `data jsonb`, generated `shop_id`), row-level
  security on all of them, a database trigger that refuses double-bookings, a unique receipt
  number per bill, and `claim_owner()` for first-run setup.
- `src/services/cloud/sync.ts` — loads everything the signed-in account may see, then diffs every
  store mutation by row identity and sends only the changed rows. Other tills' changes arrive over
  Supabase Realtime. A write the database refuses (permission, double-booking) is reported to the
  user and the local copy is reloaded, so the screen never shows something that was not saved.
- `src/services/authService.ts` — Google OAuth, password sign-in, create-password, reset links.
  A login is only let in when the owner has created a profile for that email.
- The services, pages and components are the same in both modes.

## Known limits

- Data lives in `localStorage` under the `aura:` namespace (about 1.2 MB at the seeded volume). Clearing site data or using a
  private window starts you fresh. If the browser refuses the write, the app keeps working in
  memory and logs a warning rather than failing mid-transaction.
- Bills download as a real PDF ("Download PDF" on any receipt). Reports print via the print
  stylesheet. Excel export is CSV, which Excel opens directly (a BOM is included so accented
  names survive).
- In demo mode password change and reset are placeholders; online they send real reset emails.
- No email, SMS or WhatsApp is sent anywhere. Notifications are in-app only.

---

## A note on `_reference/`

This directory was created during setup: it holds the copy of the `aspire-skin-aesthetic` template
that was previously sitting in this folder, moved aside rather than deleted so nothing was lost.
It is excluded from git and from the build, and can be deleted whenever you are ready.
