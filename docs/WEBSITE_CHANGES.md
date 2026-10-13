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
