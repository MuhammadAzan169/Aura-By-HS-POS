import type { Settings } from '@/types';
import { defaultSettings } from '@/mock/settings';
import { DEFAULT_BILL_DESIGN } from './billDesign';

/**
 * Settings a brand-new live project starts with. Same rules and tax as the
 * demo, but no invented address, phone or email — those print on real bills,
 * so they stay blank until the owner fills them in.
 */
export const liveDefaultSettings: Settings = {
  ...defaultSettings,
  business: {
    name: 'Aura by HS',
    tagline: 'Bridal · Salon · Photography',
    logoUrl: '/aura-mark.jpg',
    phone: '',
    email: '',
    addressLine: '',
    city: '',
  },
  billDesign: DEFAULT_BILL_DESIGN,
};
