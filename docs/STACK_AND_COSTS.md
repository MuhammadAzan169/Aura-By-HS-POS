# Aura by HS — free / cheapest stack plan

Two products share **one Supabase project** (one database = one source of truth):

| Piece | Tech | Host | Cost |
| --- | --- | --- | --- |
| POS / admin + shop portal (this repo) | React + TypeScript + Vite | Vercel Hobby **or** Cloudflare Pages | Rs 0 |
| Database, auth, file storage, realtime | Supabase (Postgres + RLS) | Supabase Free | Rs 0 |
| Google login | Supabase Auth → Google provider (Google Cloud OAuth client) | — | Rs 0 |
| Customer app | Flutter (Android first) | Play Store | one-time $25 |
| Customer app backend (payments, webhooks) | Python FastAPI | Render Free | Rs 0 |
| Nightly backup | GitHub Actions `pg_dump` → private repo / Google Drive | GitHub | Rs 0 |
| PDF bills | generated in the browser (`@react-pdf/renderer` or print CSS) | — | Rs 0 |
| Domain | `.com` / `.pk` | Namecheap / PKNIC | ~Rs 3–4k / year |

## Things to know before going live (the real limits)

1. **Vercel Hobby is for non-commercial use** in its terms. A paying client's POS is commercial.
   Zero-cost alternative with no such rule: **Cloudflare Pages** (unlimited bandwidth, custom
   domain, free). The app is a static Vite build, so it deploys to either unchanged.
2. **Supabase Free pauses a project after ~7 days with no activity** and has 500 MB DB, 1 GB
   storage, no point-in-time backups. A salon uses it daily so pausing is unlikely; the GitHub
   Actions nightly `pg_dump` covers backups. Upgrade to Pro ($25/mo) only when the DB nears 500 MB.
3. **Render Free sleeps after 15 min idle** (~30–60 s cold start) and its free Postgres expires —
   so do **not** put the database on Render; Render only runs the Python payment API, talking to
   Supabase. Flutter reads/writes bookings directly through Supabase (with RLS), so the cold start
   only affects the payment step. (Even simpler: Supabase Edge Functions instead of Render — no
   sleep, but TypeScript not Python.)
4. **JazzCash / Easypaisa need a merchant account** registered to the business (NTN/CNIC, bank
   account). Sandbox is free; live has per-transaction fees (~1.5–3%). Cards are handled by the
   same gateways (or Safepay / PayFast). Card numbers must never touch our server — use the
   gateway's hosted page.
5. **Google login is free** with Supabase Auth. Staff accounts: admin invites by email, the
   `profiles` table holds `role` (`admin` | `shop`) and `shop_id`; Postgres **row-level security**
   enforces that a shop user only sees its own branch — not just the UI.

## Roles

- **Admin (owner)**: all branches, add/remove shops and staff, prices, services, packages,
  memberships, inventory transfers, expenses, all reports, refunds, settings, backups.
- **Shop (branch login)**: own branch only — appointments, customers, billing/PDF bills, stock
  use, staff schedule, notifications. Cannot change prices, see other branches or delete bills.
- **Customer (Flutter app)**: own profile, bookings, payments, invoices, loyalty.

## Build order

1. Supabase schema + RLS + seed migration (mirrors `src/types/`).
2. Swap `src/services/*` from the mock store to Supabase (UI untouched — see README).
3. Google login + email invites; real PDF bills; storage for logos/photos.
4. Backup workflow; deploy to Cloudflare Pages/Vercel; connect domain.
5. Lovable UI prototype → Flutter app on the same Supabase project; Python payment API on Render.
