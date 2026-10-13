# Going live — step by step (Rs 0 hosting)

About 30 minutes, once. You need a Google account and a GitHub account.

## 1. Supabase (database + login) — free

1. Go to <https://supabase.com> → **New project**. Region: **Singapore** (closest to Pakistan).
   Save the database password somewhere safe.
2. **SQL Editor → New query** → paste all of [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.
   Run it again after every update of the app — it only adds what is missing and never deletes data.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

## 2. Google sign-in — free

1. <https://console.cloud.google.com> → create a project → **APIs & Services → OAuth consent screen**
   → External → fill the app name ("Aura by HS"), support email → Publish.
2. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   Authorised redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
   (Supabase shows this exact URL under **Authentication → Providers → Google**).
3. Paste the Client ID and Client secret into **Supabase → Authentication → Providers → Google** → Enable.
4. **Supabase → Authentication → URL Configuration**: Site URL = your domain
   (e.g. `https://pos.aurabyhs.pk`), and add it plus `http://localhost:5173` to Redirect URLs.

Email + password sign-in works out of the box too (Supabase sends the confirmation and
reset emails for free; for more than a few per hour add free SMTP such as Brevo under
**Authentication → SMTP**).

## 3. Hosting

**Recommended: Cloudflare Pages** (free, commercial use allowed, unlimited bandwidth).

1. <https://dash.cloudflare.com> → Workers & Pages → Create → Pages → connect this GitHub repo.
2. Build command `npm run build`, output directory `dist`.
3. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (from step 1.3).
4. Custom domains → add your domain. If the domain is on Cloudflare DNS it is automatic.

**Vercel** works identically (`vercel.json` is included) — but its free Hobby plan is for
non-commercial use, so a paying client's POS should be on Cloudflare Pages or Vercel Pro.

## 4. First sign-in — becoming the owner

Open the site and **Continue with Google** with the owner's Gmail. On an empty project the
first account to sign in becomes the owner (admin); after that nobody else can claim it.

Then, as owner:

1. **Settings → Data → Add starter menu** (optional) and edit prices under **Services**.
2. **Settings → Business / Billing**: name, logo, tax %, receipt footer.
3. **Shops → Add a shop** for each branch, with a **login username and password** for it.
   Add more logins (receptionist, manager) under **Users & logins**. Branch staff sign in with
   the username and password you give them; they cannot change it — only you can, from
   Users & logins or the branch page.
4. **Keep sign-ups ON.** Customers create their own accounts in the Aura app (Google or email), so
   Supabase → Authentication → *Allow new users to sign up* must stay on. That does not open the POS
   to them: a login only sees POS data if you added it under Users & logins (row-level security in
   `supabase/schema.sql`), and the first-owner claim only works on an empty project. A customer who
   tries the POS with her app login is told the email "has not been given access" and sees nothing.
   Turn on **Confirm email** (Authentication → Sign In / Providers → Email) so app accounts verify
   their address.
5. **Settings → Bill design**: paper size (A4, A5 or 80 mm receipt printer), title, colour, terms.
6. Per branch: add **Staff** with rotas and monthly salary, **Products** with opening stock.

## 5. Customer app, online payments and the website

The Flutter app, its Python API and the website use **this same Supabase project** — one database for
everything. Follow `Aura-App/docs/GO_LIVE.md` (deploy the API on Render free, Google sign-in for the
app, JazzCash / Easypaisa merchant keys, building the app for the stores). Then, in the POS as owner:

1. **Settings → Online & app**: payments server address (the Render URL), advance percentages, which
   methods customers may use, the bank account shown for transfers, your shop JazzCash/Easypaisa
   numbers, and the Play Store / App Store links once the app is published.
2. **Messages**: post a first announcement (it shows in every customer's app under Aura Updates).
3. Website: hand [`WEBSITE_CHANGES.md`](WEBSITE_CHANGES.md) to whoever edits the website.

Day to day, branches use **Online Payments** (check bank-transfer receipts, send payment links,
see money by platform — cash, card, bank, JazzCash, Easypaisa) and **Messages** (chats from the app).
Every appointment, bridal booking and unpaid bill has an **Online payment link** button that makes a
JazzCash / Easypaisa / card / bank-transfer link for an advance, the full amount or a part payment.

## 6. Nightly backup — free

1. Supabase → **Project Settings → Database → Connection string → URI** (Session pooler),
   with your database password filled in.
2. GitHub repo → **Settings → Secrets and variables → Actions → New secret**
   `SUPABASE_DB_URL` = that string.
3. Actions tab → *Nightly backup* → **Run workflow** once to check it is green.

A full SQL dump — POS, app accounts, online payments and chats alike — is then kept for 90 days, every night at 02:00 Pakistan time. Restore with
`psql "$SUPABASE_DB_URL" -f aura-backup-YYYY-MM-DD.sql`. The owner can also download a
JSON copy any time from **Settings → Data**.

## Limits to keep in mind

| Free tier | Limit | What happens |
| --- | --- | --- |
| Supabase DB | 500 MB | Years of salon data. Upgrade to Pro ($25/mo) only if it fills. |
| Supabase pause | after 7 days with no use | Daily use prevents it; un-pause from the dashboard if it ever happens. |
| Cloudflare Pages | 500 builds / month | Far more than needed. |
| Domain | — | ~Rs 3–4k / year, the only real cost. |

## Running locally

```bash
cp .env.example .env.local   # fill in the two values, or leave empty for the offline demo
npm install
npm run dev
```
