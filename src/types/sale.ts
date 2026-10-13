import type { BaseRecord, ShopScoped } from './common';

export type SaleItemKind = 'service' | 'package' | 'product';

export interface SaleItem {
  id: string;
  kind: SaleItemKind;
  refId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  /** Per-line discount in currency units, already resolved from any percentage entry. */
  discount: number;
  /** Who performed or sold this line, for commission attribution. */
  staffId: string | null;
  lineTotal: number;
}

/** Ways money is taken at the counter or online. */
export type MoneyMethod = 'cash' | 'card' | 'bank-transfer' | 'jazzcash' | 'easypaisa' | 'other';

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'bank-transfer'
  /** Mobile wallets — paid to the shop's wallet number or through the app. */
  | 'jazzcash'
  | 'easypaisa'
  | 'other'
  /** Gift voucher; `reference` holds the voucher code. */
  | 'voucher'
  /** Loyalty points converted to money. */
  | 'points'
  /** The customer's advance / credit balance. */
  | 'wallet';

export interface Payment {
  id: string;
  method: PaymentMethod;
  amount: number;
  /** Cash only: what the customer handed over, used to compute change. */
  tendered: number | null;
  reference: string | null;
  /** When this payment was taken, for balances collected after the bill. */
  at?: string;
  byUserName?: string;
}

export type SaleStatus = 'completed' | 'refunded';

export interface Sale extends BaseRecord, ShopScoped {
  receiptNo: string;
  customerId: string | null;
  /** Retained for walk-ins who have no customer record. */
  customerName: string;
  staffId: string | null;
  appointmentId: string | null;
  items: SaleItem[];
  subtotal: number;
  itemDiscountTotal: number;
  billDiscount: number;
  membershipDiscount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  payments: Payment[];
  changeGiven: number;
  status: SaleStatus;
  refundReason: string | null;
  refundedAt: string | null;
  soldAt: string;
  notes: string;
  /** Coupon applied to the bill discount, if any. */
  couponCode?: string | null;
  /** Gratuity on top of the bill; not revenue, owed to the stylist. */
  tip?: number;
  tipStaffId?: string | null;
  /** Left to pay when the customer settles later ("udhaar"). */
  balanceDue?: number;
  /** The bridal booking this bill closed; its payments were counted when taken. */
  bridalBookingId?: string | null;
  /** Loyalty points this bill earned. */
  pointsEarned?: number;
}
