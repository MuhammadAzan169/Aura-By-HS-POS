import type { Database } from '@/mock/seed';
import type { PaymentMethod, RegisterSession, User } from '@/types';
import { uid } from '@/utils/id';
import { round2 } from '@/utils/money';
import { toISODate } from '@/utils/date';
import { commit, nowISO, read, requireRow, ServiceError, stamped } from './db';

/**
 * The cash drawer. A session opens with the morning float and closes with a
 * count; the difference between what should be in the drawer and what is,
 * is the one number an owner checks every night.
 */

export function openSession(shopId: string, db: Database = read()): RegisterSession | null {
  return db.registerSessions.find((s) => s.shopId === shopId && s.closedAt === null) ?? null;
}

export function sessionsFor(shopId: string | null, db: Database = read()): RegisterSession[] {
  return db.registerSessions
    .filter((s) => shopId === null || s.shopId === shopId)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

const between = (iso: string, from: string, to: string): boolean => iso >= from && iso <= to;

export interface RegisterSummary {
  bills: number;
  refunds: number;
  grossSales: number;
  discounts: number;
  tax: number;
  tips: number;
  refundedValue: number;
  /** Money taken by method during the session (bills, balances, vouchers, advances). */
  byMethod: Record<PaymentMethod, number>;
  cashSales: number;
  changeGiven: number;
  voucherSalesCash: number;
  advancesCash: number;
  advanceRefundsCash: number;
  refundCash: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
}

/** Everything that moved through the till between open and close (or now). */
export function summarise(session: RegisterSession, db: Database = read()): RegisterSummary {
  const from = session.openedAt;
  const to = session.closedAt ?? nowISO();
  const byMethod: Record<PaymentMethod, number> = {
    cash: 0, card: 0, 'bank-transfer': 0, other: 0, voucher: 0, points: 0, wallet: 0,
  };
  let refundCash = 0;
  let bills = 0, refunds = 0, grossSales = 0, discounts = 0, tax = 0, tips = 0, refundedValue = 0, changeGiven = 0;

  for (const sale of db.sales) {
    if (sale.shopId !== session.shopId) continue;
    if (between(sale.soldAt, from, to)) {
      if (sale.status === 'completed') {
        bills += 1;
        grossSales += sale.total;
        discounts += sale.itemDiscountTotal + sale.billDiscount + sale.membershipDiscount;
        tax += sale.taxAmount;
        tips += sale.tip ?? 0;
      }
      changeGiven += sale.changeGiven;
    }
    if (sale.status === 'refunded' && sale.refundedAt && between(sale.refundedAt, from, to)) {
      refunds += 1;
      refundedValue += sale.total;
      // The customer is handed back what they paid in cash.
      refundCash += sale.payments.filter((p) => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0);
    }
    for (const p of sale.payments) {
      const at = p.at ?? sale.soldAt;
      if (between(at, from, to)) byMethod[p.method] += p.amount;
    }
  }

  let voucherSalesCash = 0;
  for (const v of db.vouchers) {
    if (v.shopId !== session.shopId || !between(v.createdAt, from, to)) continue;
    byMethod[v.paidBy ?? 'cash'] += v.initialValue;
    if ((v.paidBy ?? 'cash') === 'cash') voucherSalesCash += v.initialValue;
  }

  let advancesCash = 0, advanceRefundsCash = 0;
  for (const c of db.customerCredits) {
    if (c.shopId !== session.shopId || !between(c.createdAt, from, to)) continue;
    if (c.kind === 'advance' && c.method) {
      byMethod[c.method] += c.amount;
      if (c.method === 'cash') advancesCash += c.amount;
    }
    if (c.kind === 'refund' && c.method === 'cash') advanceRefundsCash += -c.amount;
  }

  const cashIn = session.movements.filter((m) => m.type === 'in').reduce((s, m) => s + m.amount, 0);
  const cashOut = session.movements.filter((m) => m.type === 'out').reduce((s, m) => s + m.amount, 0);
  // Cash payments are recorded at what was owed, so change is already netted out.
  const cashSales = byMethod.cash - voucherSalesCash - advancesCash;

  const expectedCash = round2(
    session.openingFloat + cashSales + voucherSalesCash + advancesCash - advanceRefundsCash - refundCash + cashIn - cashOut,
  );

  const r = (n: number): number => round2(n);
  return {
    bills, refunds,
    grossSales: r(grossSales), discounts: r(discounts), tax: r(tax), tips: r(tips), refundedValue: r(refundedValue),
    byMethod: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, r(v)])) as Record<PaymentMethod, number>,
    cashSales: r(cashSales), changeGiven: r(changeGiven), voucherSalesCash: r(voucherSalesCash),
    advancesCash: r(advancesCash), advanceRefundsCash: r(advanceRefundsCash), refundCash: r(refundCash),
    cashIn: r(cashIn), cashOut: r(cashOut), expectedCash,
  };
}

export async function open(shopId: string, openingFloat: number, actor: User): Promise<RegisterSession> {
  if (openSession(shopId)) throw new ServiceError('The till is already open.', 'conflict');
  if (!(openingFloat >= 0)) throw new ServiceError('Enter the cash in the drawer (0 if empty).', 'validation');
  const at = nowISO();
  const row: RegisterSession = stamped({
    id: uid('reg'),
    shopId,
    openedAt: at,
    openedBy: actor.name,
    openingFloat: round2(openingFloat),
    movements: [],
    closedAt: null,
    closedBy: null,
    expectedCash: null,
    countedCash: null,
    difference: null,
    closingNotes: '',
  });
  return commit((db) => {
    db.registerSessions = [row, ...db.registerSessions];
    return row;
  });
}

/** Cash taken out (e.g. bought milk) or put in (more change) during the day. */
export async function addMovement(
  sessionId: string,
  type: 'in' | 'out',
  amount: number,
  reason: string,
  actor: User,
): Promise<RegisterSession> {
  const s = requireRow(read().registerSessions.find((x) => x.id === sessionId), 'That till session');
  if (s.closedAt) throw new ServiceError('This till is already closed.', 'conflict');
  if (!(amount > 0)) throw new ServiceError('Enter an amount.', 'validation');
  if (!reason.trim()) throw new ServiceError('Say what the cash was for.', 'validation');
  return commit((db) => {
    const next: RegisterSession = {
      ...s,
      movements: [
        ...s.movements,
        { id: uid('mov'), type, amount: round2(amount), reason: reason.trim(), at: nowISO(), byUserName: actor.name },
      ],
      updatedAt: nowISO(),
    };
    db.registerSessions = db.registerSessions.map((x) => (x.id === s.id ? next : x));
    return next;
  });
}

export async function close(sessionId: string, countedCash: number, notes: string, actor: User): Promise<RegisterSession> {
  const s = requireRow(read().registerSessions.find((x) => x.id === sessionId), 'That till session');
  if (s.closedAt) throw new ServiceError('This till is already closed.', 'conflict');
  if (!(countedCash >= 0)) throw new ServiceError('Enter the cash you counted.', 'validation');
  const closedAt = nowISO();
  const summary = summarise({ ...s, closedAt });
  return commit((db) => {
    const next: RegisterSession = {
      ...s,
      closedAt,
      closedBy: actor.name,
      expectedCash: summary.expectedCash,
      countedCash: round2(countedCash),
      difference: round2(countedCash - summary.expectedCash),
      closingNotes: notes.trim(),
      updatedAt: closedAt,
    };
    db.registerSessions = db.registerSessions.map((x) => (x.id === s.id ? next : x));
    return next;
  });
}

export const todayISO = (): string => toISODate(new Date());
