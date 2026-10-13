# Website changes — connect aurabyhs.pk to the POS and the app

Everything the website needs to become part of the same system as the POS and the customer app.
Do these in the **website repository**; nothing here changes the POS or the app.

After these changes:

| On the website | Lands in |
| --- | --- |
| A customer books a service and time | POS → **Appointments** (branch diary), marked *Online*, status *Pending* |
| She pays an advance online (optional) | POS → **Online payments**; the advance sits on her account and the till uses it at checkout |
| Someone fills the bridal / contact form | POS → **Enquiries** |
| Prices, services, branches, offers | Always the live menu from the POS — edit once in POS → Services |
| "Download our app" buttons | The Play Store / App Store links from POS → Settings → Online & app |

All of it goes through the **Aura API** (the Python server in the `Aura-App` repo, `backend/`). The website
never holds a secret key.

---

## 0. Before you start

1. The API is deployed (see `Aura-App/docs/GO_LIVE.md`). Note its address, e.g. `https://aura-api.onrender.com`.
2. On Render, add the website's address to **CORS_ORIGINS**, e.g.
   `https://aurabyhs.pk,https://www.aurabyhs.pk` (keep the POS address in the list too if you set one).
3. Put this once in the website (a config file, `.env` → `VITE_AURA_API`, or a `<script>` tag):

```js
const AURA_API = 'https://aura-api.onrender.com';
```

> The free Render plan sleeps after 15 minutes without visitors; the first request then takes 30–60 s.
> Call `fetch(AURA_API + '/health')` when the page loads so the server is awake by the time someone
> presses "Book" (shown in step 1).

---

## 1. One small helper (paste once)

```js
// aura.js — talks to the Aura API. Every error comes back as a sentence you can show.
const AURA_API = window.AURA_API || 'https://aura-api.onrender.com';

export async function aura(path, { method = 'GET', body } = {}) {
  const res = await fetch(AURA_API + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please call or WhatsApp us.');
  return data;
}

// Wake the free server as soon as someone opens the site.
fetch(AURA_API + '/health').catch(() => {});
```

---

## 2. Services, prices and branches from the POS

Replace hard-coded prices with the live menu (`GET /v1/catalog`). One call returns everything:

```js
const cat = await aura('/v1/catalog');
// cat.shops       → [{ id, name, addressLine, city, phone, businessHours, isOpenNow }]
// cat.categories  → [{ id, name, description, sortOrder }]
// cat.services    → [{ id, name, categoryId, durationMin, price, discountPct, description }]
// cat.packages    → [{ id, name, price, description }]       (Bride Essential, Signature, Royal, Premium)
// cat.staff       → [{ id, name, role, shopId, specializations, rating, reviews }]
// cat.offers      → [{ code, name, mode: 'percent'|'amount', value, minSpend, endsOn }]
// cat.payments    → { methods: ['jazzcash','easypaisa','card','bank-transfer'], advancePct, bridalAdvancePct, bank }
// cat.app         → { playStoreUrl, appStoreUrl, websiteUrl, whatsapp }
```

Example — the services grid:

```js
const price = (s) => Math.round(s.price * (1 - (s.discountPct || 0) / 100));
for (const c of cat.categories) {
  const list = cat.services.filter((s) => s.categoryId === c.id);
  if (!list.length) continue;
  const from = Math.min(...list.map(price));
  // render: c.name, c.description, "from Rs " + from.toLocaleString()
}
```

Bridal packages (the four cards): use `cat.packages` — the description holds the text after
"—" as the list of inclusions, exactly as typed in POS → Packages.

Cache the catalogue for a few minutes (e.g. `sessionStorage`) so pages stay fast.

---

## 3. "Book appointment" form → straight into the branch diary

Replace the current booking form with this flow: **branch → service(s) → date → time → name & phone**.

### 3a. Free times

```js
// date is "YYYY-MM-DD" (Pakistan time). staffId is optional ("any" artist).
const { slots } = await aura(`/v1/availability?shopId=${shopId}&date=${date}&serviceIds=${serviceIds.join(',')}`);
// slots → [{ time: "11:00", startAt: "2026-12-20T11:00:00+05:00", available: true, reasonLabel: null }, …]
// Show only available ones (or show the rest greyed out with reasonLabel as the tooltip).
```

These are the POS's own rules: opening hours, each artist's rota and breaks, leave, existing bookings
and the minimum notice set in POS → Settings → Appointments. A time offered here is a time the front desk
can actually do.

### 3b. Book

```js
const result = await aura('/v1/public/bookings', {
  method: 'POST',
  body: {
    name: form.name,                 // 2–120 characters
    phone: form.phone,               // Pakistani mobile, 03XXXXXXXXX
    email: form.email || '',
    shopId,
    serviceIds,                      // one or more service ids from the catalogue
    staffId: 'any',                  // or a staff id if the customer picked an artist
    startAt: chosenSlot.startAt,     // exactly as returned by /v1/availability
    notes: form.notes || '',
    couponCode: form.promo || null,  // e.g. "AURA15"; refused with a reason if not valid
    payPlan: wantsToPayNow ? 'advance' : null,   // 'advance' | 'full' | null (pay at the salon)
    returnUrl: 'https://aurabyhs.pk/thank-you',   // where "Back to the website" goes after paying
  },
});
// result → { ok, bookingId, total, startAt, staffId, payUrl?, payAmount? }
if (result.payUrl) window.location.href = result.payUrl;   // JazzCash / Easypaisa / card / bank transfer page
else showThankYou(`Booked! We'll confirm by phone. Total Rs ${result.total.toLocaleString()}.`);
```

What happens:

* The customer is matched to the branch's customer book by phone, or added as a new customer.
* The booking appears in **POS → Appointments** as *Pending*, source *Online*, with a bell notification.
* If two people take the same last slot at once, the second gets a clear error — show it and reload the times.
* With `payPlan`, the customer is taken to the secure payment page. Paying confirms the booking
  automatically; a bank transfer waits for the branch to check the receipt in **POS → Online payments**.
* The API limits each visitor to 10 bookings an hour, so the form cannot be flooded.

### 3c. After paying

The payment page ends on a result screen with a **"Back to the website"** button that opens your
`returnUrl` with `?payment=PAY-…&status=paid` (or `verifying` for a bank transfer, `failed` if it did not go
through). Make the thank-you page read `status` and say "Payment received — see you soon!",
"We'll confirm your transfer shortly" or "The payment did not go through — you can pay at the salon".
Only `https://` addresses are accepted.

---

## 4. Bridal / contact form → POS Enquiries

Keep a short form for brides who want to talk first (and for "Contact us"):

```js
await aura('/v1/public/enquiries', {
  method: 'POST',
  body: {
    name, phone, email,
    interest: 'Bride Royal package',      // or the service they clicked
    preferredDate: '2026-12-20',          // optional, YYYY-MM-DD
    message,
    shopId: null,                         // or a branch id if they chose one
    source: 'website',
  },
});
```

It lands in **POS → Enquiries** within a second; the owner assigns it to a branch and converts it into a
customer, appointment or bridal booking in one click.

> This replaces the older direct-to-Supabase snippet in `docs/WEBSITE.md`. Both work; the API version adds
> flood protection and keeps all website traffic in one place. Use one of them, not both.

---

## 5. Download-the-app section

Show store badges only when the links exist (they are filled in POS → Settings → Online & app once the app
is published):

```js
const links = await aura('/v1/public/app-links');
// { playStoreUrl, appStoreUrl, websiteUrl, whatsapp }
if (links.playStoreUrl) showBadge('google-play', links.playStoreUrl);
if (links.appStoreUrl) showBadge('app-store', links.appStoreUrl);
if (!links.playStoreUrl && !links.appStoreUrl) showText('Our app is coming soon to Google Play and the App Store.');
```

Suggested places: the header ("Get the app"), the booking thank-you page ("Track your booking, pay and
chat with us in the Aura app"), and the footer. Official badge images:
Google Play — <https://play.google.com/intl/en_us/badges/>, App Store — <https://developer.apple.com/app-store/marketing/guidelines/>.

On phones you can also add a smart banner for iPhone users once the App Store id is known:
`<meta name="apple-itunes-app" content="app-id=YOUR_APP_ID">`.

---

## 6. Offers, branches and WhatsApp

* **Offers strip**: `cat.offers` → show `code`, `name`, and "until {endsOn}". Codes are the POS coupons, so
  a code typed at the till, in the app or on the website gives the same discount.
* **Branches page**: `cat.shops` → name, address, phone, today's hours from `businessHours`
  (`weekday` 0 = Sunday … 6 = Saturday) and `isOpenNow`. Directions:
  `https://www.google.com/maps/dir/?api=1&destination=` + encoded "name, address".
* **WhatsApp button**: `https://wa.me/92XXXXXXXXXX` using `cat.app.whatsapp` (drop the leading 0, add 92).

---

## 7. Pages that must exist (stores require them)

Google Play and the App Store need public pages for the app listing — host them on the website:

| Page | Address (suggested) | Content |
| --- | --- | --- |
| Privacy policy | `/privacy` | What is collected (name, mobile, email, bookings, receipts), why, who it is shared with (the branch, JazzCash/Easypaisa), how to delete the account (in the app: Profile → Delete account) |
| Terms | `/terms` | Booking, advance, reschedule (up to 4 h before) and cancellation rules, gift vouchers |
| Account deletion | `/delete-account` | Required by Google Play: "Open the app → Profile → Delete account, or WhatsApp us at … to delete it for you." |
| Support | `/contact` | Phone, WhatsApp, email |

The same wording is in the app under Profile → Privacy policy / Terms of service; keep them identical.

---

## 8. Checklist

- [ ] `AURA_API` set; website domain added to CORS_ORIGINS on Render
- [ ] Services, prices and packages read from `/v1/catalog` (no hard-coded prices left)
- [ ] Booking form uses `/v1/availability` + `/v1/public/bookings`; tested a booking shows in POS → Appointments
- [ ] Optional advance: tested in test mode (the payment page says TEST MODE until merchant keys are added)
- [ ] Contact / bridal form uses `/v1/public/enquiries`; tested it shows in POS → Enquiries
- [ ] "Get the app" badges read from `/v1/public/app-links`
- [ ] Privacy, terms, account-deletion and contact pages published and linked in the footer
- [ ] WhatsApp and phone numbers match POS → Settings
- [ ] The four things in section 9 sent back for checking

---

## 9. Send this back so the work can be checked

When the changes are done, send these four things to whoever is checking the work (the developer who
built the POS and the app). With them, every point above can be verified properly instead of assumed.

**1. The website address** — the live site, or a preview/staging link if it is not published yet:

```
Website:  https://aurabyhs.pk            (or https://preview-xyz.vercel.app)
API used: https://aura-api.onrender.com
```

If the site is not online anywhere yet, send the repository instead (add the checker as a collaborator
on GitHub/GitLab) or zip the changed files. Three files usually cover it: the helper, the booking page
and the contact page.

**2. A test booking and a test enquiry, made on the website.** Use an obvious fake name so the salon can
tell it apart, and write down what you used:

```
Test booking   — name "Test Website", phone 03001112233, branch …, service …, date & time …
Test enquiry   — name "Test Enquiry", phone 03001112233, interest "Bride Royal"
Test payment   — (if the advance step is on) amount shown … , approved on the TEST MODE page: yes/no
```

The checker opens the POS and confirms the booking is in **Appointments** (source *Online*, status
*Pending*), the enquiry is in **Enquiries**, and the payment is in **Online payments**. Delete the test
rows afterwards from the POS.

**3. Four screenshots** (phone width is fine):

* the services section, showing prices that came from the POS;
* the booking form with the times list open;
* the thank-you page after booking;
* the footer with the "Get the app" area and the privacy / terms links.

**4. Answers to these five questions** — they are the things that cannot be seen from outside:

1. Is there any price, service name or branch address still typed into the website by hand? (There
   should be none — all of it comes from `/v1/catalog`.)
2. Does the booking form send `startAt` exactly as `/v1/availability` returned it, without reformatting
   the date?
3. What does the page show when the API is slow or asleep (the first request can take 30–60 seconds),
   and what does it show when a booking is refused — the server's own message, or a generic one?
   (It must show the server's message: it says things like "That time is no longer free.")
4. Is the Supabase anon key, service key or any password anywhere in the website's code? (There must be
   none — the website only ever calls the API.)
5. Which addresses are in `CORS_ORIGINS` on Render?

### What "perfectly done" means

The checker will confirm all of this; it is the same list the website developer can run through first:

| Check | How it is confirmed |
| --- | --- |
| Live menu | Change a service price in the POS → reload the website → the new price shows |
| Booking really lands | The test booking appears in POS → Appointments within a second, with the right branch, artist, service and time |
| Times are real | A slot that the POS has already booked is not offered on the website |
| Double booking | Two people taking the last slot: the second sees a clear message, not a silent failure |
| Payment (test mode) | The test payment appears in POS → Online payments and the booking turns *Confirmed* |
| Enquiries | The test enquiry appears in POS → Enquiries |
| App links | Empty in the POS → the badges are hidden; filled in → they appear without touching the website again |
| Phone layout | The booking form is usable on a phone, with no sideways scrolling |
| Nothing secret | No keys or passwords in the website's source |
| Nothing broken | The browser console shows no red errors on the home, services, booking and contact pages |

Anything that fails gets sent back with the exact message or screenshot, and this guide is the reference
for fixing it.
