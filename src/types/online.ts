import type { BaseRecord } from './common';

/**
 * Shared with the customer app's Python API (aura-app/backend). Both sides read
 * and write these rows, so field names must stay in step.
 */

export type OnlineMethod = 'jazzcash' | 'easypaisa' | 'card' | 'bank-transfer';

export type OnlinePaymentStatus =
  /** Created; the customer has not paid yet. */
  | 'pending'
  /** With the gateway, waiting for its answer. */
  | 'processing'
  /** Bank transfer receipt uploaded; a branch must check it. */
  | 'verifying'
  | 'paid'
  | 'failed'
  /** The branch looked at the receipt and refused it. */
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type OnlinePurpose = 'appointment' | 'bridal' | 'sale' | 'voucher';
export type OnlinePlan = 'advance' | 'full' | 'partial' | 'balance' | 'custom';

export interface OnlineAttempt {
  at: string;
  method?: OnlineMethod | null;
  gateway?: string | null;
  status?: string | null;
  gatewayRef?: string | null;
  gatewayMessage?: string | null;
}

/** A request for money — from the app, the website, or a link the POS shared. */
export interface OnlinePayment extends BaseRecord {
  paymentNo: string;
  shopId: string;
  purpose: OnlinePurpose;
  /** The appointment, bridal booking or bill; null for a gift voucher. */
  refId: string | null;
  refLabel: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  /** The customer's app login, when paid from the app. */
  accountId: string | null;
  plan: OnlinePlan;
  amount: number;
  /** How the customer chose to pay (null until they choose on a link). */
  method: OnlineMethod | null;
  status: OnlinePaymentStatus;
  /** Secret part of the pay link: <api>/pay/<token>. */
  token: string;
  gateway: 'jazzcash' | 'easypaisa' | 'simulator' | 'manual' | null;
  gatewayRef: string | null;
  gatewayMessage: string | null;
  /** Storage path of the bank-transfer receipt (bucket "payment-slips"). */
  slipPath: string | null;
  payerNote: string;
  paidAt: string | null;
  verifiedBy: string | null;
  rejectReason: string | null;
  /** "app", "website" or the staff member who made the link. */
  createdBy: string;
  channel: 'app' | 'website' | 'link';
  expiresAt: string | null;
  /** Set once the money has been put on the booking / bill / voucher. */
  appliedAt: string | null;
  voucher?: { value?: number; recipientName?: string; recipientPhone?: string; code?: string; voucherId?: string } | null;
  attempts: OnlineAttempt[];
}

/** One chat line between a customer (app) and head office or a branch. */
export interface ChatMessage extends BaseRecord {
  /** `<accountId>:hq` or `<accountId>:<shopId>`. */
  threadId: string;
  /** Null for head-office ("Aura Concierge") chats. */
  shopId: string | null;
  accountId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  from: 'customer' | 'staff' | 'system';
  authorName: string;
  text: string;
  /** Storage path in the "chat-images" bucket. */
  imagePath: string | null;
  at: string;
  readByStaff: boolean;
  readByCustomer: boolean;
}

/** Shown to every app user under "Aura Updates". */
export interface Announcement extends BaseRecord {
  title: string;
  body: string;
  imageUrl: string | null;
  active: boolean;
  byUserName: string;
}

export interface OnlinePaymentSettings {
  enabled: boolean;
  /** Percent of the price asked as an advance when booking services. */
  advancePct: number;
  bridalAdvancePct: number;
  /** Smallest part payment accepted online. */
  minPartial: number;
  methods: Record<OnlineMethod, boolean>;
  bank: { bankName: string; accountTitle: string; accountNumber: string; iban: string; raastId: string };
  /** Public address of the payments API, e.g. https://aura-api.onrender.com. */
  apiUrl: string;
  /** Shop's own wallet numbers, printed for in-store JazzCash / Easypaisa transfers. */
  jazzcashWallet?: string;
  easypaisaWallet?: string;
}

export interface CustomerAppSettings {
  playStoreUrl: string;
  appStoreUrl: string;
  websiteUrl: string;
  whatsapp: string;
}
