import { getYear } from 'date-fns';
import type { Payment, Sale, SaleItem, User } from '@/types';
import { uid } from '@/utils/id';
import { formatCurrency, round2 } from '@/utils/money';
import { commit, delay, nowISO, read, requireRow, scopeTo, ServiceError, stamped } from './db';
import { calculateBill, changeFor, formatReceiptNo, paidTotal, type BillDiscountInput } from './pricing';
import { applyMovementSync, notifyStockThresholds } from './inventoryService';
import { attachSale } from './appointmentService';
import { discountPctFor } from './customerService';
import { raise } from './notificationService';
import { applyTenders, pointsFor, reverseTenders, validateCoupon, validateTenders } from './rewardsService';

export interface CheckoutInput {
  shopId: string;
  customerId: string | null;
  customerName: string;
  staffId: string | null;
  appointmentId: string | null;
  items: SaleItem[];
  billDiscount: BillDiscountInput;
  payments: Payment[];
  notes: string;
  /** Promotion code; replaces any manual bill discount. */
  couponCode?: string | null;
  tip?: number;
  tipStaffId?: string | null;
  /** Let a known customer leave part of the bill to pay later. */
  payLater?: boolean;
}

export async function list(shopId: string | null): Promise<Sale[]> {
  return delay(scopeTo(read().sales, shopId));
}

export function listSync(shopId: string | null): Sale[] {
  return scopeTo(read().sales, shopId);
}

export async function getById(id: string): Promise<Sale> {
  return delay(requireRow(read().sales.find((s) => s.id === id), 'That bill'));
}

export function getByReceiptNo(receiptNo: string): Sale | undefined {
  return read().sales.find((s) => s.receiptNo === receiptNo);
}

/** Next sequential receipt number for a shop in the current year. */
function nextReceiptNo(shopId: string): string {
  const db = read();
  const shop = requireRow(db.shops.find((s) => s.id === shopId), 'That branch');
  const year = getYear(new Date());
  const prefix = `${shop.code}-${year}-`;

  const highest = db.sales
    .filter((s) => s.receiptNo.startsWith(prefix))
    .reduce((max, s) => {
      const n = Number(s.receiptNo.slice(prefix.length));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);

  return formatReceiptNo(shop.code, year, highest + 1);
}

/**
 * Takes payment. This is the transaction the whole app hangs off: it writes the
 * bill, decrements stock for every product line, links the appointment and
 * raises the notification — all in one write, so nothing can land half-done.
 */
export async function checkout(input: CheckoutInput, actor: User): Promise<Sale> {
  if (input.items.length === 0) {
    throw new ServiceError('Add at least one item before taking payment.', 'validation');
  }

  const db = read();
  const settings = db.settings;

  const couponCode = input.couponCode?.trim().toUpperCase() || null;
  let billDiscount = input.billDiscount;
  if (couponCode) {
    const preview = calculateBill({
      items: input.items,
      billDiscount: { mode: 'percent', value: 0 },
      membershipDiscountPct: discountPctFor(input.customerId),
      taxRatePct: settings.billing.taxRatePct,
    });
    const coupon = validateCoupon(couponCode, input.shopId, preview.subtotal, db);
    billDiscount = { mode: coupon.mode, value: coupon.value };
  }

  // A shop user may not exceed the ceiling the owner set (a coupon was approved by them already).
  if (!couponCode && actor.role === 'shop' && input.billDiscount.mode === 'percent') {
    if (input.billDiscount.value > settings.billing.maxShopDiscountPct) {
      throw new ServiceError(
        `Discounts above ${settings.billing.maxShopDiscountPct}% need the owner's approval.`,
        'forbidden',
      );
    }
  }

  // Stock check before anything is written, so the error names the real problem.
  for (const item of input.items) {
    if (item.kind !== 'product') continue;
    const product = db.products.find((p) => p.id === item.refId);
    if (!product) throw new ServiceError(`${item.name} is no longer in the catalogue.`, 'not-found');
    if (product.stock < item.quantity) {
      throw new ServiceError(
        `Only ${product.stock} ${product.unit}${product.stock === 1 ? '' : 's'} of ${product.name} left in stock.`,
        'insufficient-stock',
      );
    }
  }

  const membershipPct = discountPctFor(input.customerId);
  const totals = calculateBill({
    items: input.items,
    billDiscount,
    membershipDiscountPct: membershipPct,
    taxRatePct: settings.billing.taxRatePct,
  });

  const tip = round2(Math.max(0, input.tip ?? 0));
  const payable = round2(totals.total + tip);
  const paid = paidTotal(input.payments);
  let balanceDue = 0;
  if (round2(paid) < payable) {
    if (!input.payLater) {
      throw new ServiceError(`Payment is short by ${formatCurrency(payable - paid)}.`, 'validation');
    }
    if (!input.customerId) {
      throw new ServiceError('Pick a saved customer to leave a balance to pay later.', 'validation');
    }
    balanceDue = round2(payable - paid);
  }
  validateTenders({ customerId: input.customerId, payments: input.payments }, db);

  // Points are earned on what was paid in money, not on points themselves.
  const paidWithPoints = input.payments.filter((p) => p.method === 'points').reduce((s, p) => s + p.amount, 0);
  const pointsEarned = input.customerId ? pointsFor(Math.max(0, totals.total - paidWithPoints - balanceDue), db) : 0;
  const at = nowISO();

  const sale: Sale = stamped({
    id: uid('sal'),
    shopId: input.shopId,
    receiptNo: nextReceiptNo(input.shopId),
    customerId: input.customerId,
    customerName: input.customerName.trim() || 'Walk-in customer',
    staffId: input.staffId,
    appointmentId: input.appointmentId,
    items: input.items,
    subtotal: totals.subtotal,
    itemDiscountTotal: totals.itemDiscountTotal,
    billDiscount: totals.billDiscount,
    membershipDiscount: totals.membershipDiscount,
    taxRate: settings.billing.taxRatePct,
    taxAmount: totals.taxAmount,
    total: totals.total,
    payments: input.payments.map((p) => ({ ...p, at, byUserName: actor.name })),
    changeGiven: changeFor(input.payments),
    couponCode,
    tip,
    tipStaffId: tip > 0 ? (input.tipStaffId ?? input.staffId) : null,
    balanceDue,
    pointsEarned,
    status: 'completed' as const,
    refundReason: null,
    refundedAt: null,
    soldAt: nowISO(),
    notes: input.notes.trim(),
  });

  const productIds: string[] = [];

  const saved = await commit((current) => {
    current.sales = [sale, ...current.sales];
    applyTenders(current, sale, actor);

    for (const item of sale.items) {
      if (item.kind !== 'product') continue;
      productIds.push(item.refId);
      applyMovementSync(
        current,
        {
          productId: item.refId,
          type: 'sale',
          quantity: -item.quantity,
          reason: `Sold on receipt ${sale.receiptNo}`,
          referenceId: sale.id,
        },
        actor,
      );
    }

    // First completed bill doubles as the customer's first visit.
    if (sale.customerId) {
      current.customers = current.customers.map((c) =>
        c.id === sale.customerId && c.firstVisitOn === null
          ? { ...c, firstVisitOn: sale.soldAt.slice(0, 10), updatedAt: nowISO() }
          : c,
      );
    }

    return sale;
  });

  if (saved.appointmentId) attachSale(saved.appointmentId, saved.id);
  notifyStockThresholds(productIds);

  raise({
    shopId: saved.shopId,
    type: 'payment-completed',
    title: 'Payment received',
    message: `${formatCurrency(saved.total)} taken on ${saved.receiptNo} from ${saved.customerName}.`,
    link: `/billing/bills?receipt=${encodeURIComponent(saved.receiptNo)}`,
  });

  return saved;
}

/**
 * Refunds a bill and puts every product line back on the shelf. Services cannot
 * be un-performed, so only stock is restored.
 */
export async function refund(id: string, reason: string, actor: User): Promise<Sale> {
  const existing = requireRow(read().sales.find((s) => s.id === id), 'That bill');

  if (existing.status === 'refunded') {
    throw new ServiceError('This bill has already been refunded.', 'conflict');
  }
  if (!reason.trim()) {
    throw new ServiceError('A reason is required when refunding a bill.', 'validation');
  }

  const productIds: string[] = [];

  const refunded = await commit((db) => {
    const next: Sale = {
      ...existing,
      status: 'refunded' as const,
      refundReason: reason.trim(),
      refundedAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.sales = db.sales.map((s) => (s.id === id ? next : s));
    reverseTenders(db, existing, actor);

    for (const item of existing.items) {
      if (item.kind !== 'product') continue;
      productIds.push(item.refId);
      applyMovementSync(
        db,
        {
          productId: item.refId,
          type: 'refund',
          quantity: item.quantity,
          reason: `Returned to stock — ${existing.receiptNo} refunded`,
          referenceId: existing.id,
        },
        actor,
      );
    }

    return next;
  });

  notifyStockThresholds(productIds);

  raise({
    shopId: refunded.shopId,
    type: 'refund',
    title: 'Sale refunded',
    message: `${refunded.receiptNo} was refunded (${formatCurrency(refunded.total)}). ${reason.trim()}`,
    link: `/billing/bills?receipt=${encodeURIComponent(refunded.receiptNo)}`,
  });

  return refunded;
}

/** Bills raised against a customer, newest first. */
export function salesForCustomer(customerId: string): Sale[] {
  return read()
    .sales.filter((s) => s.customerId === customerId)
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

/** Only completed bills count towards revenue; refunds are excluded everywhere. */
export function revenueOf(sales: Sale[]): number {
  return round2(
    sales.filter((s) => s.status === 'completed').reduce((sum, s) => sum + s.total, 0),
  );
}

/** Bills with money still owed, oldest first. */
export function unpaidSales(shopId: string | null): Sale[] {
  return scopeTo(read().sales, shopId)
    .filter((s) => s.status === 'completed' && (s.balanceDue ?? 0) > 0)
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt));
}

export function customerBalanceDue(customerId: string): number {
  return round2(
    read()
      .sales.filter((s) => s.customerId === customerId && s.status === 'completed')
      .reduce((sum, s) => sum + (s.balanceDue ?? 0), 0),
  );
}

/** Settles some or all of what is still owed on a bill. */
export async function collectBalance(
  id: string,
  payment: Pick<Payment, 'method' | 'amount' | 'reference'>,
  actor: User,
): Promise<Sale> {
  const existing = requireRow(read().sales.find((s) => s.id === id), 'That bill');
  const due = existing.balanceDue ?? 0;
  if (existing.status !== 'completed' || due <= 0) throw new ServiceError('Nothing is owed on this bill.', 'conflict');
  const amount = round2(payment.amount);
  if (!(amount > 0)) throw new ServiceError('Enter the amount received.', 'validation');
  if (amount > due + 0.001) throw new ServiceError(`Only ${formatCurrency(due)} is owed.`, 'validation');
  if (['voucher', 'points', 'wallet'].includes(payment.method)) {
    throw new ServiceError('Collect balances in cash, card or transfer.', 'validation');
  }
  return commit((db) => {
    const next: Sale = {
      ...existing,
      payments: [
        ...existing.payments,
        { id: uid('pay'), method: payment.method, amount, tendered: null, reference: payment.reference, at: nowISO(), byUserName: actor.name },
      ],
      balanceDue: round2(due - amount),
      updatedAt: nowISO(),
    };
    db.sales = db.sales.map((s) => (s.id === id ? next : s));
    return next;
  });
}
