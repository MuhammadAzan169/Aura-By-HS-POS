# Connecting the website's "Book appointment" form to the POS

Requests from the website land in **POS → Enquiries** within a second, for free — the website
writes straight into the same Supabase database. The public key can only *add* a new website
enquiry; it cannot read, change or delete anything (see `enquiries_public` in
`supabase/schema.sql`).

Paste this into the website (replace the two values with the ones from Supabase → Project
Settings → API — the same two the POS uses):

```html
<script>
  const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
  const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

  /**
   * Call with the form's values. Returns true when the enquiry was received.
   * interest: e.g. "Bride Signature package" or "Hair Styling"
   * preferredDate: "2026-12-20" or null
   */
  async function sendEnquiry({ name, phone, email = '', interest = '', preferredDate = null, message = '' }) {
    const id = 'enq_web_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();
    const res = await fetch(SUPABASE_URL + '/rest/v1/enquiries', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        id,
        data: {
          id, createdAt: now, updatedAt: now,
          shopId: null, name, phone, email, interest, preferredDate, message,
          source: 'website', status: 'new', notes: '', followUpOn: null,
          customerId: null, bookingId: null,
        },
      }),
    });
    return res.ok;
  }
</script>
```

Example wiring for a form with fields `name`, `phone`, `service`, `date`, `message`:

```html
<script>
  document.querySelector('#booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const ok = await sendEnquiry({
      name: f.get('name'), phone: f.get('phone'), interest: f.get('service'),
      preferredDate: f.get('date') || null, message: f.get('message') || '',
    });
    alert(ok ? 'Thank you! We will call you shortly.' : 'Sorry, please call or WhatsApp us.');
  });
</script>
```

The owner assigns each website enquiry to a branch (or a branch picks it up), follows up from
the Enquiries screen, and converts it to a customer, appointment or bridal booking in one click.
The same Supabase project will serve the Flutter client app later.
