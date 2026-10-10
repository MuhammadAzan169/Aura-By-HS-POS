import type { Membership, Service, ServiceCategory, ServicePackage } from '@/types';

/**
 * The Aura by HS menu as published on the website: eight disciplines and the
 * four bridal packages. Loaded once from Settings → Data → "Add Aura menu";
 * the owner then edits names, prices and durations under Services.
 *
 * Prices marked "from" on the website are the starting price of the cheapest
 * service in that discipline.
 */

const AT = '2026-01-01T00:00:00.000Z';
const base = (id: string) => ({ id, createdAt: AT, updatedAt: AT });

const CATS: Array<[string, string, string, string]> = [
  ['cat_aura_bridal', 'Bridal Make-Up', 'Signature HD bridal artistry crafted for your biggest day.', 'crown'],
  ['cat_aura_party', 'Party & Event Make-Up', 'Engagements, mehndi guests, dinners and photoshoots.', 'sparkles'],
  ['cat_aura_salon', 'Salon Services', 'Everyday luxury — grooming, threading, waxing and polish.', 'scissors'],
  ['cat_aura_hair', 'Hair Styling', 'Editorial updos, blowouts and event-ready styling.', 'wind'],
  ['cat_aura_skin', 'Skin & Facial', 'Glow protocols and facials for flawless bridal skin.', 'droplet'],
  ['cat_aura_nails', 'Nails', 'Manicures, pedicures, gel and nail art.', 'hand'],
  ['cat_aura_mehndi', 'Mehndi', 'Bridal and guest mehndi artistry.', 'flower'],
  ['cat_aura_photo', 'Photography Studio', 'Bridal portraits and studio sessions.', 'camera'],
];

export const auraCategories: ServiceCategory[] = CATS.map(([id, name, description, icon], i) => ({
  ...base(id),
  name,
  description,
  icon,
  sortOrder: i + 1,
  active: true,
}));

const S: Array<[string, string, string, number, number, string]> = [
  // id, category, name, minutes, price, description
  ['svc_aura_bridal_sig', 'cat_aura_bridal', 'Signature Bridal Make-Up', 240, 45000, 'Full bridal look with lashes and draping.'],
  ['svc_aura_bridal_hd', 'cat_aura_bridal', 'HD Bridal Make-Up', 240, 60000, 'High-definition finish for close-up photography.'],
  ['svc_aura_bridal_air', 'cat_aura_bridal', 'Airbrush Bridal Make-Up', 270, 75000, 'Long-wear airbrush finish.'],
  ['svc_aura_bridal_trial', 'cat_aura_bridal', 'Bridal Trial', 120, 10000, 'Look trial before the wedding.'],
  ['svc_aura_party_mu', 'cat_aura_party', 'Party Make-Up', 90, 12000, 'Glam for events and dinners.'],
  ['svc_aura_party_eng', 'cat_aura_party', 'Engagement / Nikah Make-Up', 150, 25000, 'Soft-glam look for engagement or nikah.'],
  ['svc_aura_party_fam', 'cat_aura_party', 'Family Member Make-Up', 75, 8000, 'Make-up for the bride’s family.'],
  ['svc_aura_salon_thread', 'cat_aura_salon', 'Threading (Full Face)', 20, 1200, 'Eyebrows, upper lip and face.'],
  ['svc_aura_salon_wax', 'cat_aura_salon', 'Full Body Waxing', 90, 6500, 'Rica or honey wax.'],
  ['svc_aura_salon_groom', 'cat_aura_salon', 'Grooming & Polish', 60, 3500, 'Cleanup, threading and polish.'],
  ['svc_aura_salon_cut', 'cat_aura_salon', 'Haircut & Blow-Dry', 60, 3500, 'Cut, wash and blow-dry.'],
  ['svc_aura_hair_style', 'cat_aura_hair', 'Event Hair Styling', 60, 8000, 'Curls, waves or sleek styling.'],
  ['svc_aura_hair_updo', 'cat_aura_hair', 'Bridal Updo & Draping', 90, 12000, 'Editorial updo with dupatta draping.'],
  ['svc_aura_hair_colour', 'cat_aura_hair', 'Hair Colour', 150, 15000, 'Global colour or highlights.'],
  ['svc_aura_hair_treat', 'cat_aura_hair', 'Keratin / Protein Treatment', 180, 25000, 'Smoothing treatment.'],
  ['svc_aura_skin_glow', 'cat_aura_skin', 'Glow Facial', 60, 6500, 'Brightening facial.'],
  ['svc_aura_skin_hydra', 'cat_aura_skin', 'Hydra Facial', 75, 12000, 'Deep cleanse and hydration.'],
  ['svc_aura_skin_prebridal', 'cat_aura_skin', 'Pre-Bridal Facial (per session)', 90, 15000, 'Part of the pre-bridal skin programme.'],
  ['svc_aura_nails_mani', 'cat_aura_nails', 'Manicure', 45, 3000, 'Classic manicure.'],
  ['svc_aura_nails_pedi', 'cat_aura_nails', 'Pedicure', 60, 3500, 'Classic pedicure.'],
  ['svc_aura_nails_gel', 'cat_aura_nails', 'Gel Polish / Nail Art', 60, 4500, 'Gel colour or nail art.'],
  ['svc_aura_mehndi_bridal', 'cat_aura_mehndi', 'Bridal Mehndi (hands & feet)', 240, 25000, 'Full bridal mehndi.'],
  ['svc_aura_mehndi_guest', 'cat_aura_mehndi', 'Guest Mehndi (per hand)', 30, 2500, 'Simple guest design.'],
  ['svc_aura_photo_portrait', 'cat_aura_photo', 'Bridal Studio Portraits', 120, 30000, 'Studio session with edited portraits.'],
  ['svc_aura_photo_mini', 'cat_aura_photo', 'Mini Studio Session', 45, 10000, 'Short portrait session.'],
];

export const auraServices: Service[] = S.map(([id, categoryId, name, durationMin, price, description]) => ({
  ...base(id),
  name,
  categoryId,
  description,
  durationMin,
  price,
  discountPct: 0,
  imageUrl: null,
  active: true,
}));

const pkg = (id: string, name: string, description: string, price: number, items: string[]): ServicePackage => ({
  ...base(id),
  name,
  description,
  price,
  items: items.map((serviceId) => ({ serviceId, quantity: 1 })),
  imageUrl: null,
  active: true,
});

export const auraPackages: ServicePackage[] = [
  pkg('pkg_aura_essential', 'Bride Essential', 'Single event · 4 hrs — signature bridal make-up, hair styling & draping, basic skin prep, lashes included.', 55000, [
    'svc_aura_bridal_sig', 'svc_aura_hair_updo', 'svc_aura_skin_glow',
  ]),
  pkg('pkg_aura_signature', 'Bride Signature', 'Two events · 1 day — HD bridal make-up, advanced hair styling, pre-bridal facial, manicure & pedicure, trial session.', 95000, [
    'svc_aura_bridal_hd', 'svc_aura_hair_updo', 'svc_aura_skin_prebridal', 'svc_aura_nails_mani', 'svc_aura_nails_pedi', 'svc_aura_bridal_trial',
  ]),
  pkg('pkg_aura_royal', 'Bride Royal', 'Three events · 2 days — airbrush bridal make-up, mehndi & baraat looks, bridal mehndi artistry, 3-session skin programme, nails & grooming.', 165000, [
    'svc_aura_bridal_air', 'svc_aura_party_eng', 'svc_aura_mehndi_bridal', 'svc_aura_skin_prebridal', 'svc_aura_nails_gel', 'svc_aura_salon_groom',
  ]),
  pkg('pkg_aura_premium', 'Aura Premium', 'Full wedding week — all four events, lead artist personally, full pre-bridal programme, bridal mehndi & nails, studio portrait session, dedicated coordinator.', 245000, [
    'svc_aura_bridal_air', 'svc_aura_bridal_hd', 'svc_aura_party_eng', 'svc_aura_mehndi_bridal', 'svc_aura_skin_prebridal', 'svc_aura_nails_gel', 'svc_aura_photo_portrait',
  ]),
];

export const auraMemberships: Membership[] = [];
