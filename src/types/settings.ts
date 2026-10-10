import type { NotificationType } from './notification';

export interface BusinessProfile {
  name: string;
  tagline: string;
  logoUrl: string | null;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
}

export interface AppointmentRules {
  defaultDurationMin: number;
  /** Granularity of generated slots, in minutes. */
  slotIntervalMin: number;
  minAdvanceBookingMin: number;
  cancellationWindowHours: number;
  /** Buffer kept between two appointments for the same stylist, in minutes. */
  bufferMin: number;
}

export interface BillingSettings {
  currency: string;
  currencyCode: string;
  locale: string;
  taxRatePct: number;
  receiptHeader: string;
  receiptFooter: string;
  /** Ceiling on the bill-level discount a shop user may apply. */
  maxShopDiscountPct: number;
}

export interface LoyaltySettings {
  enabled: boolean;
  /** Points earned per 100 of bill value. */
  pointsPer100: number;
  /** Money one point is worth when redeemed. */
  pointValue: number;
  minRedeemPoints: number;
}

export interface BillDesign {
  paperSize: 'A4' | 'A5' | '80mm';
  /** Printed at the top, e.g. "INVOICE", "BILL", "RECEIPT". */
  title: string;
  /** Hex colour for the header band and totals. */
  accentColor: string;
  fontScale: 'sm' | 'md' | 'lg';
  showLogo: boolean;
  showBusinessName: boolean;
  showBranchAddress: boolean;
  showBranchPhone: boolean;
  showTaxNumber: boolean;
  /** NTN / STRN printed under the header when shown. */
  taxNumber: string;
  showCustomerPhone: boolean;
  showServedBy: boolean;
  showLineDiscounts: boolean;
  showTax: boolean;
  showPayments: boolean;
  showAmountInWords: boolean;
  showLoyaltyPoints: boolean;
  showSignature: boolean;
  signatureLabel: string;
  showTerms: boolean;
  terms: string;
  /** Last line, e.g. social handles or "Follow us @aurabyhs". */
  footerNote: string;
}

export interface Settings {
  billDesign?: BillDesign;
  loyalty?: LoyaltySettings;
  business: BusinessProfile;
  appointments: AppointmentRules;
  billing: BillingSettings;
  notifications: Record<NotificationType, boolean>;
  updatedAt: string;
}
