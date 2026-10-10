import type { Settings } from '@/types';

export const defaultSettings: Settings = {
  business: {
    name: 'Aura by HS',
    tagline: 'Bridal · Salon · Photography',
    logoUrl: '/aura-mark.jpg',
    phone: '042 3577 1420',
    email: 'hello@aurabyhs.pk',
    addressLine: '14-C, MM Alam Road, Gulberg III',
    city: 'Lahore',
  },
  loyalty: {
    enabled: true,
    pointsPer100: 1,
    pointValue: 1,
    minRedeemPoints: 100,
  },
  appointments: {
    defaultDurationMin: 45,
    slotIntervalMin: 15,
    minAdvanceBookingMin: 30,
    cancellationWindowHours: 4,
    bufferMin: 0,
  },
  billing: {
    currency: 'Rs',
    currencyCode: 'PKR',
    locale: 'en-PK',
    taxRatePct: 5,
    receiptHeader: 'Aura by HS',
    receiptFooter: 'Prices include all applicable taxes. No refunds on completed services.',
    maxShopDiscountPct: 15,
  },
  notifications: {
    'appointment-created': true,
    'appointment-reminder': true,
    'appointment-cancelled': true,
    'appointment-rescheduled': true,
    'appointment-no-show': true,
    'payment-completed': true,
    refund: true,
    'low-stock': true,
    'out-of-stock': true,
    'customer-created': true,
    'membership-expiring': true,
  },
  updatedAt: '2026-01-05T09:00:00.000Z',
};
