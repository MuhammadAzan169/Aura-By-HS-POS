import type { MoneyMethod } from '@/types';
import type { Database } from '@/mock/seed';
import type { Coupon, CustomerCredit, LoyaltySettings, Sale, User, Voucher } from '@/types';
import { uid } from '@/utils/id';
import { formatCurrency, round2 } from '@/utils/money';
import { toISODate } from '@/utils/date';
import { commit, nowISO, read, requireRow, ServiceError, stamped } from './db';

/**
 * Everything a customer can pay with besides money in hand: promotion codes,
 * gift vouchers, loyalty points and advances held on account. Balances are
 * derived from the bills wherever possible, so a refund puts points and
 * coupon uses back automatically.
 */

const DEFAULT_LOYALTY: LoyaltySettings = { enabled: false, pointsPer100: 0, pointValue: 0, minRedeemPoints: 0 };

export function loyaltySettings(db: Database = read()): LoyaltySettings {
  return db.settings.loyalty ?? DEFAULT_LOYALTY;
}

const today = (): string => toISODate(new Date());

// ------------------------------------------------------------------ coupons

export function couponUses(code: string, db: Database = read()): number {
  const c = code.toUpperCase();
  return db.sales.filter((s) => s.status === 'completed' && s.couponCode?.toUpperCase() === c).length;
}

/** The coupon for `code` if it may be used on this bill right now, or a reason why not. */
export function validateCoupon(code: string, shopId: string, subtotal: number, db: Database = read()): Coupon {
  const c = code.trim().toUpperCase();
  const coupon = db.coupons.find((x) => x.code.toUpperCase() === c);
  if (!coupon || !coupon.active) throw new ServiceError(`"${code}" is not a valid coupon.`, 'validation');
  if (coupon.shopId && coupon.shopId !== shopId) {
    throw new ServiceError('That coupon is for a different branch.', 'validation');
  }
  const d = today();
  if (coupon.startsOn && d < coupon.startsOn) throw new ServiceError(`That coupon starts on ${coupon.startsOn}.`, 'validation');
  if (coupon.endsOn && d > coupon.endsOn) throw new ServiceError('That coupon has expired.', 'validation');
  if (coupon.maxUses > 0 && couponUses(coupon.code, db) >= coupon.maxUses) {
    throw new ServiceError('That coupon has been used up.', 'validation');
  }
  if (subtotal < coupon.minSpend) {
    throw new ServiceError(`That coupon needs a bill of at least ${formatCurrency(coupon.minSpend)}.`, 'validation');
  }
  return coupon;
}

export type CouponInput = Omit<Coupon, 'id' | 'createdAt' | 'updatedAt'>;

function checkCoupon(input: CouponInput, id: string | null): void {
  if (!/^[A-Z0-9-]{3,20}$/.test(input.code)) {
    throw new ServiceError('Codes are 3–20 letters, numbers or dashes, e.g. EID25.', 'validation');
  }
  if (read().coupons.some((c) => c.code === input.code && c.id !== id)) {
    throw new ServiceError('Another coupon already uses that code.', 'conflict');
  }
  if (!(input.value > 0)) throw new ServiceError('Enter a discount greater than zero.', 'validation');
  if (input.mode === 'percent' && input.value > 100) throw new ServiceError('A percentage cannot exceed 100.', 'validation');
}

export async function saveCoupon(input: CouponInput, id: string | null = null): Promise<Coupon> {
  const clean = { ...input, code: input.code.trim().toUpperCase(), name: input.name.trim() };
  checkCoupon(clean, id);
  return commit((db) => {
    if (id) {
      const existing = requireRow(db.coupons.find((c) => c.id === id), 'That coupon');
      const next = { ...existing, ...clean, updatedAt: nowISO() };
      db.coupons = db.coupons.map((c) => (c.id === id ? next : c));
      return next;
    }
    const row: Coupon = stamped({ id: uid('cpn'), ...clean });
    db.coupons = [row, ...db.coupons];
    return row;
  });
}

export async function deleteCoupon(id: string): Promise<void> {
  await commit((db) => {
    db.coupons = db.coupons.filter((c) => c.id !== id);
  });
}

// ----------------------------------------------------------------- vouchers

function voucherCode(db: Database): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let code = 'GV-';
    for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!db.vouchers.some((v) => v.code === code)) return code;
  }
}

export interface VoucherInput {
  shopId: string;
  value: number;
  recipientName: string;
  recipientPhone: string;
  purchasedBy: string;
  expiresOn: string | null;
  notes: string;
  /** How the buyer paid; recorded for the day's cash count. */
  paidBy: MoneyMethod;
}

/**
 * Selling a voucher takes money now and owes a service later, so it is not
 * revenue until it is redeemed — the bill it pays for is the revenue.
 */
export async function sellVoucher(input: VoucherInput, actor: User): Promise<Voucher> {
  if (!(input.value > 0)) throw new ServiceError('Enter the voucher value.', 'validation');
  if (!input.recipientName.trim()) throw new ServiceError('Enter who the voucher is for.', 'validation');
  return commit((db) => {
    const row: Voucher = stamped({
      id: uid('vch'),
      shopId: input.shopId,
      code: voucherCode(db),
      initialValue: round2(input.value),
      balance: round2(input.value),
      recipientName: input.recipientName.trim(),
      recipientPhone: input.recipientPhone.trim(),
      purchasedBy: input.purchasedBy.trim(),
      paidBy: input.paidBy,
      expiresOn: input.expiresOn,
      active: true,
      notes: `${input.notes.trim()}${input.notes.trim() ? ' · ' : ''}Sold by ${actor.name}`,
    });
    db.vouchers = [row, ...db.vouchers];
    return row;
  });
}

export function findVoucher(code: string, db: Database = read()): Voucher {
  const v = db.vouchers.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
  if (!v || !v.active) throw new ServiceError(`Voucher "${code}" was not found.`, 'not-found');
  if (v.expiresOn && today() > v.expiresOn) throw new ServiceError(`Voucher ${v.code} expired on ${v.expiresOn}.`, 'validation');
  if (v.balance <= 0) throw new ServiceError(`Voucher ${v.code} has been fully used.`, 'validation');
  return v;
}

export async function setVoucherActive(id: string, active: boolean): Promise<void> {
  await commit((db) => {
    db.vouchers = db.vouchers.map((v) => (v.id === id ? { ...v, active, updatedAt: nowISO() } : v));
  });
}

// ------------------------------------------------------- advances & credit

export function creditBalance(customerId: string, db: Database = read()): number {
  return round2(db.customerCredits.filter((c) => c.customerId === customerId).reduce((s, c) => s + c.amount, 0));
}

export interface AdvanceInput {
  shopId: string;
  customerId: string;
  amount: number;
  method: MoneyMethod;
  appointmentId: string | null;
  note: string;
}

/** Takes an advance (e.g. a bridal booking deposit) onto the customer's account. */
export async function takeAdvance(input: AdvanceInput, actor: User): Promise<CustomerCredit> {
  if (!(input.amount > 0)) throw new ServiceError('Enter the advance amount.', 'validation');
  return commit((db) => {
    const row: CustomerCredit = stamped({
      id: uid('crd'),
      shopId: input.shopId,
      customerId: input.customerId,
      amount: round2(input.amount),
      kind: 'advance' as const,
      method: input.method,
      appointmentId: input.appointmentId,
      saleId: null,
      note: input.note.trim(),
      byUserName: actor.name,
    });
    db.customerCredits = [row, ...db.customerCredits];
    return row;
  });
}

/** Gives back unused advance money in cash. */
export async function refundAdvance(customerId: string, shopId: string, amount: number, note: string, actor: User): Promise<void> {
  if (!(amount > 0)) throw new ServiceError('Enter the amount to give back.', 'validation');
  if (amount > creditBalance(customerId)) throw new ServiceError('That is more than the customer holds.', 'validation');
  await commit((db) => {
    db.customerCredits = [
      stamped({
        id: uid('crd'),
        shopId,
        customerId,
        amount: -round2(amount),
        kind: 'refund' as const,
        method: 'cash' as const,
        appointmentId: null,
        saleId: null,
        note: note.trim() || 'Advance returned',
        byUserName: actor.name,
      }),
      ...db.customerCredits,
    ];
  });
}

// ------------------------------------------------------------------ loyalty

/** Points redeemed on a payment line; stored in `reference` at the time. */
export function pointsOnPayment(reference: string | null): number {
  const n = Number(reference);
  return Number.isFinite(n) ? n : 0;
}

/** Earned minus spent, over completed bills only — refunds give points back. */
export function pointsBalance(customerId: string, db: Database = read()): number {
  let points = 0;
  for (const s of db.sales) {
    if (s.customerId !== customerId || s.status !== 'completed') continue;
    points += s.pointsEarned ?? 0;
    for (const p of s.payments) if (p.method === 'points') points -= pointsOnPayment(p.reference);
  }
  return Math.max(0, Math.floor(points));
}

export function pointsFor(amount: number, db: Database = read()): number {
  const l = loyaltySettings(db);
  if (!l.enabled || l.pointsPer100 <= 0) return 0;
  return Math.floor((amount / 100) * l.pointsPer100);
}

// ------------------------------------------- applied inside checkout/refund

/**
 * Checks every voucher, points and advance payment on a bill against what the
 * customer actually holds. Runs before anything is written.
 */
export function validateTenders(sale: Pick<Sale, 'customerId' | 'payments'>, db: Database): void {
  const l = loyaltySettings(db);
  for (const p of sale.payments) {
    if (p.method === 'voucher') {
      const v = findVoucher(p.reference ?? '', db);
      if (p.amount > v.balance) {
        throw new ServiceError(`Voucher ${v.code} only has ${formatCurrency(v.balance)} left.`, 'validation');
      }
    } else if (p.method === 'points') {
      if (!sale.customerId) throw new ServiceError('Pick the customer to redeem their points.', 'validation');
      if (!l.enabled) throw new ServiceError('Loyalty points are switched off.', 'validation');
      const pts = pointsOnPayment(p.reference);
      if (pts < l.minRedeemPoints) throw new ServiceError(`At least ${l.minRedeemPoints} points must be redeemed at once.`, 'validation');
      if (pts > pointsBalance(sale.customerId, db)) throw new ServiceError('The customer does not have that many points.', 'validation');
    } else if (p.method === 'wallet') {
      if (!sale.customerId) throw new ServiceError('Pick the customer to use their advance.', 'validation');
      if (p.amount > creditBalance(sale.customerId, db) + 0.001) {
        throw new ServiceError(`The customer only holds ${formatCurrency(creditBalance(sale.customerId, db))} in advance.`, 'validation');
      }
    }
  }
}

/** Spends vouchers and advances for a new bill, inside its write. */
export function applyTenders(db: Database, sale: Sale, actor: User): void {
  for (const p of sale.payments) {
    if (p.method === 'voucher') {
      const code = (p.reference ?? '').toUpperCase();
      db.vouchers = db.vouchers.map((v) =>
        v.code.toUpperCase() === code ? { ...v, balance: round2(v.balance - p.amount), updatedAt: nowISO() } : v,
      );
    } else if (p.method === 'wallet' && sale.customerId) {
      db.customerCredits = [
        stamped({
          id: uid('crd'),
          shopId: sale.shopId,
          customerId: sale.customerId,
          amount: -round2(p.amount),
          kind: 'used' as const,
          method: null,
          appointmentId: sale.appointmentId,
          saleId: sale.id,
          note: `Used on ${sale.receiptNo}`,
          byUserName: actor.name,
        }),
        ...db.customerCredits,
      ];
    }
  }
}

/** Puts voucher value and advances back when a bill is refunded. */
export function reverseTenders(db: Database, sale: Sale, actor: User): void {
  for (const p of sale.payments) {
    if (p.method === 'voucher') {
      const code = (p.reference ?? '').toUpperCase();
      db.vouchers = db.vouchers.map((v) =>
        v.code.toUpperCase() === code ? { ...v, balance: round2(v.balance + p.amount), updatedAt: nowISO() } : v,
      );
    } else if (p.method === 'wallet' && sale.customerId) {
      db.customerCredits = [
        stamped({
          id: uid('crd'),
          shopId: sale.shopId,
          customerId: sale.customerId,
          amount: round2(p.amount),
          kind: 'adjustment' as const,
          method: null,
          appointmentId: null,
          saleId: sale.id,
          note: `Returned — ${sale.receiptNo} refunded`,
          byUserName: actor.name,
        }),
        ...db.customerCredits,
      ];
    }
  }
}
