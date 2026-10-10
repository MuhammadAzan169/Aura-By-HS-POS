import type { BaseRecord, ShopScoped } from './common';

/** A prepaid gift voucher. Sold at one branch, redeemable at any. */
export interface Voucher extends BaseRecord, ShopScoped {
  code: string;
  initialValue: number;
  balance: number;
  /** Who it was bought for (the recipient), shown on the voucher. */
  recipientName: string;
  recipientPhone: string;
  purchasedBy: string;
  /** How the buyer paid, for the day's cash count. */
  paidBy?: 'cash' | 'card' | 'bank-transfer' | 'other';
  /** yyyy-MM-dd, or null for no expiry. */
  expiresOn: string | null;
  active: boolean;
  notes: string;
}

/** A promotion code that discounts a bill. Uses are counted from sales. */
export interface Coupon extends BaseRecord {
  code: string;
  name: string;
  mode: 'percent' | 'amount';
  value: number;
  minSpend: number;
  /** yyyy-MM-dd bounds, inclusive; null means open-ended. */
  startsOn: string | null;
  endsOn: string | null;
  /** 0 = unlimited. */
  maxUses: number;
  /** Restrict to one branch, or null for all. */
  shopId: string | null;
  active: boolean;
}

/**
 * Money a customer holds with the salon: advances paid for future bookings
 * (e.g. a bridal deposit) and credit. Positive adds, negative spends.
 */
export interface CustomerCredit extends BaseRecord, ShopScoped {
  customerId: string;
  amount: number;
  kind: 'advance' | 'used' | 'refund' | 'adjustment';
  method: 'cash' | 'card' | 'bank-transfer' | 'other' | null;
  appointmentId: string | null;
  saleId: string | null;
  note: string;
  byUserName: string;
}

export interface CashMovement {
  id: string;
  type: 'in' | 'out';
  amount: number;
  reason: string;
  at: string;
  byUserName: string;
}

/** One till session: opened with a float in the morning, counted at close. */
export interface RegisterSession extends BaseRecord, ShopScoped {
  openedAt: string;
  openedBy: string;
  openingFloat: number;
  movements: CashMovement[];
  closedAt: string | null;
  closedBy: string | null;
  /** Calculated when closed, kept so the report never changes afterwards. */
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  closingNotes: string;
}

export type AttendanceStatus = 'present' | 'late' | 'half-day' | 'absent' | 'leave';

export interface Attendance extends BaseRecord, ShopScoped {
  staffId: string;
  /** yyyy-MM-dd */
  date: string;
  status: AttendanceStatus;
  clockIn: string | null;
  clockOut: string | null;
  note: string;
}

/** A customer's rating of a visit. */
export interface Feedback extends BaseRecord, ShopScoped {
  customerId: string | null;
  customerName: string;
  saleId: string | null;
  staffId: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
}

/** Salary paid to a staff member for one month, recorded so it is never paid twice. */
export interface PayrollRun extends BaseRecord, ShopScoped {
  staffId: string;
  /** yyyy-MM */
  month: string;
  baseSalary: number;
  commission: number;
  tips: number;
  bonus: number;
  deductions: number;
  netPay: number;
  paidOn: string;
  expenseId: string | null;
  note: string;
}

/** Who did what, when. Written automatically for every change. */
export interface ActivityEntry extends BaseRecord, ShopScoped {
  at: string;
  userId: string | null;
  userName: string;
  action: 'created' | 'updated' | 'deleted';
  entity: string;
  label: string;
}
