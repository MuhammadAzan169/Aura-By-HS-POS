# Lovable prompt — Aura by HS client booking app (UI/UX only)

Paste everything inside the fence below into Lovable as the first message.

> Heads-up: Lovable's own generator is built around React + TypeScript. The prompt insists on
> vanilla JavaScript; if Lovable still scaffolds React, reply with the "follow-up if it uses React"
> message at the bottom. The output is only a **visual reference** for the Flutter app — no code
> from it ships to the store.

```text
ROLE: You are designing the UI/UX prototype of a customer mobile app for "Aura by HS", a premium
bridal make-up, salon and photography-studio brand in Pakistan with 4–5 branches owned by one
admin. This prototype is ONLY a clickable design reference; the real app will be rebuilt in
Flutter. Do NOT build a backend, database, auth provider, Supabase integration or real payment.

STRICT TECH RULES (do not break):
- Plain HTML5 + CSS3 + VANILLA JAVASCRIPT (ES modules). NO React, NO Next.js, NO TypeScript,
  NO Vue, NO Tailwind build step, NO npm frameworks. One index.html, /css/styles.css,
  /js/app.js plus one JS file per screen, a tiny hash router (#/home, #/book …).
- All data is mocked in /js/mock-data.js. State kept in a small store object + localStorage.
- Mobile-first, designed inside a 390×844 phone frame; must also work at 360px wide.
- Icons: inline SVG (Lucide style). Fonts: Google Fonts "Fraunces" (headings) + "Inter" (body).

BRAND / LOOK:
- Palette: bridal maroon #7A181C (primary), antique gold #C9A45C (accent), warm ivory #FBF7F2
  canvas, white cards, ink #1F1A17 text. Dark mode: near-black maroon #1A0B0C background with
  gold accents. Define every colour as a CSS variable; include a dark-mode toggle.
- Elegant, feminine, luxurious but calm. 16px radius cards, soft shadows, generous spacing,
  large tap targets (min 44px), bottom tab bar, smooth 200ms transitions, skeleton loaders,
  friendly empty states, prefers-reduced-motion respected. Prices in PKR ("Rs 4,500").
- Support English UI with an Urdu toggle placeholder (RTL-ready layout).

SCREENS (build every one, all clickable):
1. Splash + 3-slide onboarding (bridal, salon, photography).
2. Auth: "Continue with Google" button (mock), phone number + OTP screen (mock), guest browse.
3. Home: greeting, upcoming appointment card with countdown, branch selector, search,
   categories (Hair, Make-up, Bridal, Nails, Skin/Facial, Waxing, Mehndi, Photography),
   offers/banner carousel, "Book again" from history, top stylists, packages.
4. Branches: list + map placeholder, address, timings, open/closed badge, call & WhatsApp buttons,
   directions button.
5. Service catalogue: by category, service detail (photos, duration, price, "from" price for
   variable services, description, add-on suggestions), add multiple services to a booking.
6. Packages & Bridal: bridal packages (Barat, Walima, Mehndi, engagement), trial session,
   photography add-on, comparison table, "Request consultation" form.
7. BOOKING FLOW (the core, make it perfect, stepper at top):
   a) choose branch → b) services (multi-select, live total & duration)
   → c) stylist (any available / specific, rating, specialties)
   → d) date (horizontal 14-day strip + calendar) and time slots (available / taken greyed with
      reason) → e) notes + reference photo upload (mock) → f) review summary with promo code,
      membership discount, advance/deposit amount (e.g. 30% for bridal) → g) payment
   → h) confirmation screen with booking ID, add-to-calendar, share, directions.
8. Payment screen (UI only): JazzCash, Easypaisa, Debit/Credit card, Pay at salon. Show mobile
   wallet number + MPIN/OTP style mock, card form with validation, processing state,
   success / failed / pending states and a downloadable receipt view.
9. My Appointments: Upcoming / Past / Cancelled tabs, reschedule (re-uses slot picker),
   cancel with policy text and reason, rate & review after visit, rebook.
10. Wallet & Loyalty: loyalty points, membership tier card (Silver/Gold/Platinum), gift cards,
    referral code with share, transaction history, saved payment methods.
11. Offers: coupons list, apply to booking, expiry badges.
12. Notifications: reminders (24h & 2h before), booking confirmed, offer alerts, settings toggles.
13. Gallery / Lookbook: before-after and bridal portfolio grid, filter by stylist and category.
14. Profile: personal info, skin/hair preferences & allergies, saved branches, favourites
    stylists & services, language, dark mode, help & support (FAQ, WhatsApp chat, call),
    privacy policy, terms, delete account, logout.
15. Invoices: list of past bills, bill detail (services, discount, tax, paid by), "Download PDF"
    button (mock).

UX RULES:
- Never more than 3 taps to start a booking from Home. Sticky "Continue" button with running
  total in the booking flow. Back keeps the user's selections. Validation messages inline.
- Every list has loading, empty and error states. Toasts for success/failure.
- Accessibility: labels on every input, visible focus rings, AA contrast in both themes.

DELIVERABLE: a polished, fully clickable vanilla-JS prototype of all screens above, plus a
/design-notes.md listing colours, type scale, spacing scale, components (buttons, chips, cards,
slot picker, stepper, bottom sheet, tab bar) so a Flutter developer can rebuild it 1:1.
```

### Follow-up if it uses React anyway

```text
Please rewrite this prototype as plain HTML, CSS and vanilla JavaScript ES modules only — no
React, no JSX, no TypeScript, no Tailwind. Keep every screen, style and interaction identical.
```
