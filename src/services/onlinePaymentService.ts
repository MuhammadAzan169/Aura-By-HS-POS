import type {
  Appointment,
  BridalBooking,
  MoneyMethod,
  OnlineMethod,
  OnlinePayment,
  OnlinePaymentSettings,
  OnlinePlan,
  OnlinePurpose,
  Sale,
  User,
} from '@/types';
import type { Database } from '@/mock/seed';
import { uid } from '@/utils/id';
import { formatCurrency, round2 } from '@/utils/money';
import { commit, nowISO, read, requireRow, ServiceError, stamped } from './db';
import { isCloud, supabase } from './cloud/client';
import { raise } from './notificationService';

/**
 * Online payments — from the customer app, the website, and links the front
 * desk sends on WhatsApp. The customer pays on JazzCash's or Easypaisa's own page
 * through the payments API (aura-app/backend); this module creates links,
 * checks bank-transfer receipts, and reports money by platform.
 *
 * `applyPaid` puts the money exactly where the API does when a gateway confirms
 * a payment (backend/app/payments/service.py) — keep the two in step.
 */

export const METHOD_LABEL: Record<OnlineMethod, string> = {
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  card: 'Card',
  'bank-transfer': 'Bank transfer',
};

export const DEFAULT_ONLINE: OnlinePaymentSettings = {
  enabled: true,
  advancePct: 20,
  bridalAdvancePct: 30,
  minPartial: 500,
  methods: { jazzcash: true, easypaisa: true, card: true, 'bank-transfer': true },
  bank: { bankName: '', accountTitle: '', accountNumber: '', iban: '', raastId: '' },
  apiUrl: '',
  jazzcashWallet: '',
  easypaisaWallet: '',
};

export function onlineSettings(db: Database = read()): OnlinePaymentSettings {
  const s = db.settings.onlinePayments;
  return {
    ...DEFAULT_ONLINE,
    ...(s ?? {}),
    methods: { ...DEFAULT_ONLINE.methods, ...(s?.methods ?? {}) },
    bank: { ...DEFAULT_ONLINE.bank, ...(s?.bank ?? {}) },
  };
}

/**
 * True once Settings → Online payments has a real API address. Until then no
 * pay link can be built, because the customer pays on the API's own page.
 */
export function payLinkReady(db: Database = read()): boolean {
  return /^https?:\/\/.+/i.test(onlineSettings(db).apiUrl.trim());
}

/**
 * The link the customer opens to pay. Empty when the API address is not set —
 * the caller must check `payLinkReady` and refuse to send rather than putting a
 * made-up address in front of a customer.
 */
export function payUrl(p: Pick<OnlinePayment, 'token'>, db: Database = read()): string {
  if (!payLinkReady(db)) return '';
  return `${onlineSettings(db).apiUrl.trim().replace(/\/+$/, '')}/pay/${p.token}`;
}

// ------------------------------------------------------------- money owed

export interface Owed {
  total: number;
  paid: number;
  left: number;
}

export function owedOn(purpose: OnlinePurpose, refId: string, db: Database = read()): Owed {
  if (purpose === 'appointment') {
    const a = requireRow(db.appointments.find((x) => x.id === refId), 'That appointment');
    if (a.saleId) {
      const s = db.sales.find((x) => x.id === a.saleId);
      if (s) return { total: s.total, paid: round2(s.total - (s.balanceDue ?? 0)), left: s.balanceDue ?? 0 };
    }
    const total = appointmentTotal(a);
    const paid = round2(
      db.customerCredits.filter((c) => c.appointmentId === a.id && c.kind === 'advance').reduce((s, c) => s + c.amount, 0),
    );
    return { total, paid, left: Math.max(0, round2(total - paid)) };
  }
  if (purpose === 'bridal') {
    const b = requireRow(db.bridalBookings.find((x) => x.id === refId), 'That bridal booking');
    const paid = round2(b.payments.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0));
    return { total: b.total, paid, left: Math.max(0, round2(b.total - paid)) };
  }
  if (purpose === 'sale') {
    const s = requireRow(db.sales.find((x) => x.id === refId), 'That bill');
    const due = s.balanceDue ?? 0;
    return { total: s.total, paid: round2(s.total - due), left: due };
  }
  throw new ServiceError('Pick what the payment is for.', 'validation');
}

export function appointmentTotal(a: Appointment & { quotedTotal?: number }): number {
  return typeof a.quotedTotal === 'number' ? a.quotedTotal : a.services.reduce((s, x) => s + x.price, 0);
}

function refLabel(purpose: OnlinePurpose, refId: string, db: Database): string {
  if (purpose === 'appointment') {
    const a = db.appointments.find((x) => x.id === refId);
    const names = (a?.services ?? []).map((s) => db.services.find((x) => x.id === s.serviceId)?.name ?? 'Service');
    return names.join(' + ') || 'Appointment';
  }
  if (purpose === 'bridal') {
    const b = db.bridalBookings.find((x) => x.id === refId);
    return b ? `${b.packageName} · ${b.bookingNo}` : 'Bridal booking';
  }
  const s = db.sales.find((x) => x.id === refId);
  return s ? `Bill ${s.receiptNo}` : 'Bill';
}

function randomToken(n = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function paymentNo(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `PAY-${ymd}-${randomToken(5).toUpperCase()}`;
}

/** The amount a plan asks for, with the same rules as the app. */
export function planAmount(purpose: OnlinePurpose, refId: string, plan: OnlinePlan, custom: number | null, db: Database = read()): number {
  const cfg = onlineSettings(db);
  const { total, paid, left } = owedOn(purpose, refId, db);
  if (left <= 0) throw new ServiceError('Nothing is left to pay on this.', 'conflict');
  if (plan === 'advance') {
    const target =
      purpose === 'bridal'
        ? (db.bridalBookings.find((b) => b.id === refId)?.advanceRequired ?? round2((total * cfg.bridalAdvancePct) / 100))
        : round2((total * cfg.advancePct) / 100);
    const want = round2(target - paid);
    if (want <= 0) throw new ServiceError('The advance is already paid — ask for the balance instead.', 'conflict');
    return Math.min(want, left);
  }
  if (plan === 'full' || plan === 'balance') return left;
  const amount = round2(custom ?? 0);
  if (!(amount > 0)) throw new ServiceError('Enter the amount to ask for.', 'validation');
  if (amount > left + 0.001) throw new ServiceError(`Only ${formatCurrency(left)} is left to pay.`, 'validation');
  return amount;
}

export interface LinkInput {
  purpose: Exclude<OnlinePurpose, 'voucher'>;
  refId: string;
  plan: OnlinePlan;
  amount: number | null;
}

/** A payment link for the customer, shared on WhatsApp or SMS. */
export async function createLink(input: LinkInput, actor: User): Promise<OnlinePayment> {
  const db = read();
  if (!onlineSettings(db).enabled) throw new ServiceError('Online payments are switched off in Settings.', 'validation');
  const amount = planAmount(input.purpose, input.refId, input.plan, input.amount, db);
  const ref =
    input.purpose === 'appointment'
      ? db.appointments.find((a) => a.id === input.refId)
      : input.purpose === 'bridal'
        ? db.bridalBookings.find((b) => b.id === input.refId)
        : db.sales.find((s) => s.id === input.refId);
  const shopId = (ref as { shopId: string }).shopId;
  const customerId = (ref as { customerId: string | null }).customerId ?? null;
  const customer = customerId ? db.customers.find((c) => c.id === customerId) : undefined;
  const row: OnlinePayment = stamped({
    id: uid('opy'),
    paymentNo: paymentNo(),
    shopId,
    purpose: input.purpose,
    refId: input.refId,
    refLabel: refLabel(input.purpose, input.refId, db),
    customerId,
    customerName: customer?.name ?? (ref as Sale).customerName ?? 'Customer',
    customerPhone: customer?.phone ?? (ref as BridalBooking).phone ?? '',
    accountId: null,
    plan: input.plan,
    amount,
    method: null,
    status: 'pending' as const,
    token: randomToken(),
    gateway: null,
    gatewayRef: null,
    gatewayMessage: null,
    slipPath: null,
    payerNote: '',
    paidAt: null,
    verifiedBy: null,
    rejectReason: null,
    createdBy: actor.name,
    channel: 'link' as const,
    expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    appliedAt: null,
    voucher: null,
    attempts: [],
  });
  return commit((d) => {
    d.onlinePayments = [row, ...d.onlinePayments];
    return row;
  });
}

function posMethod(m: OnlineMethod | null): MoneyMethod {
  return m ?? 'other';
}

/** Books a confirmed online payment onto the appointment, bridal booking, bill or voucher. */
export function applyPaid(db: Database, p: OnlinePayment, by: string): OnlinePayment {
  const at = nowISO();
  const method = posMethod(p.method);
  const note = `Online ${p.paymentNo} · ${p.method ? METHOD_LABEL[p.method] : 'online'}${p.gatewayRef ? ` · ref ${p.gatewayRef}` : ''}`;
  let next: OnlinePayment = { ...p };

  if (p.purpose === 'appointment' && p.refId) {
    const a = db.appointments.find((x) => x.id === p.refId);
    if (a) {
      db.customerCredits = [
        stamped({
          id: uid('crd'),
          shopId: a.shopId,
          customerId: a.customerId,
          amount: p.amount,
          kind: 'advance' as const,
          method,
          appointmentId: a.id,
          saleId: null,
          note,
          byUserName: by,
        }),
        ...db.customerCredits,
      ];
      if (a.status === 'pending') {
        db.appointments = db.appointments.map((x) =>
          x.id === a.id
            ? {
                ...x,
                status: 'confirmed' as const,
                updatedAt: at,
                history: [...x.history, { status: 'confirmed' as const, at, byUserId: 'online', byUserName: by, note: `${formatCurrency(p.amount)} paid online` }],
              }
            : x,
        );
      }
    }
  } else if (p.purpose === 'bridal' && p.refId) {
    db.bridalBookings = db.bridalBookings.map((b) => {
      if (b.id !== p.refId) return b;
      const paid = b.payments.reduce((s, x) => s + (x.kind === 'refund' ? -x.amount : x.amount), 0);
      const kind = paid === 0 ? 'advance' : paid + p.amount >= b.total - 0.001 ? 'final' : 'instalment';
      const status = b.status === 'tentative' && paid + p.amount >= b.advanceRequired ? 'confirmed' : b.status;
      return {
        ...b,
        status,
        updatedAt: at,
        payments: [...b.payments, { id: uid('bpy'), at, amount: p.amount, method, kind, note, byUserName: by }],
      };
    });
  } else if (p.purpose === 'sale' && p.refId) {
    db.sales = db.sales.map((s) => {
      if (s.id !== p.refId) return s;
      const due = s.balanceDue ?? 0;
      const amount = Math.min(p.amount, due);
      return {
        ...s,
        updatedAt: at,
        balanceDue: round2(due - amount),
        payments: [...s.payments, { id: uid('pay'), method, amount, tendered: null, reference: note, at, byUserName: by }],
      };
    });
  } else if (p.purpose === 'voucher') {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const taken = new Set(db.vouchers.map((v) => v.code.toUpperCase()));
    let code = '';
    do code = 'GV-' + Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    while (taken.has(code));
    const voucher = stamped({
      id: uid('vch'),
      shopId: p.shopId,
      code,
      initialValue: p.amount,
      balance: p.amount,
      recipientName: p.voucher?.recipientName ?? '',
      recipientPhone: p.voucher?.recipientPhone ?? '',
      purchasedBy: p.customerName,
      paidBy: method,
      expiresOn: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      active: true,
      notes: note,
    });
    db.vouchers = [voucher, ...db.vouchers];
    next = { ...next, voucher: { ...(p.voucher ?? {}), code, voucherId: voucher.id } };
  }

  next = { ...next, status: 'paid', paidAt: next.paidAt ?? at, appliedAt: at, verifiedBy: by, updatedAt: at };
  db.onlinePayments = db.onlinePayments.map((x) => (x.id === p.id ? next : x));
  return next;
}

/** A branch has seen the money arrive (bank receipt checked, or paid to the shop's wallet). */
export async function markReceived(id: string, input: { method: OnlineMethod; reference: string }, actor: User): Promise<OnlinePayment> {
  const p = requireRow(read().onlinePayments.find((x) => x.id === id), 'That payment');
  if (p.appliedAt || p.status === 'paid') throw new ServiceError('This payment is already recorded.', 'conflict');
  if (['cancelled', 'rejected'].includes(p.status)) throw new ServiceError('This payment was closed. Make a new link.', 'conflict');
  const saved = await commit((db) =>
    applyPaid(
      db,
      {
        ...p,
        method: input.method,
        gateway: p.gateway ?? 'manual',
        gatewayRef: input.reference.trim() || p.gatewayRef,
        attempts: [...p.attempts, { at: nowISO(), method: input.method, gateway: 'manual', status: 'paid', gatewayRef: input.reference.trim() || null, gatewayMessage: `Checked by ${actor.name}` }],
      },
      actor.name,
    ),
  );
  raise({
    shopId: saved.shopId,
    type: 'payment-completed',
    title: 'Online payment confirmed',
    message: `${saved.customerName}: ${formatCurrency(saved.amount)} by ${saved.method ? METHOD_LABEL[saved.method] : 'online'} — ${saved.refLabel}.`,
    link: `/online-payments?id=${saved.id}`,
  });
  return saved;
}

export async function reject(id: string, reason: string, actor: User): Promise<OnlinePayment> {
  const p = requireRow(read().onlinePayments.find((x) => x.id === id), 'That payment');
  if (p.appliedAt) throw new ServiceError('A recorded payment cannot be rejected — refund it instead.', 'conflict');
  if (!reason.trim()) throw new ServiceError('Say why, so the customer knows what to fix.', 'validation');
  return commit((db) => {
    const next: OnlinePayment = {
      ...p,
      status: 'rejected',
      rejectReason: reason.trim(),
      verifiedBy: actor.name,
      updatedAt: nowISO(),
      attempts: [...p.attempts, { at: nowISO(), status: 'rejected', gateway: 'manual', gatewayMessage: reason.trim() }],
    };
    db.onlinePayments = db.onlinePayments.map((x) => (x.id === id ? next : x));
    return next;
  });
}

export async function cancel(id: string): Promise<void> {
  const p = requireRow(read().onlinePayments.find((x) => x.id === id), 'That payment');
  if (p.appliedAt) throw new ServiceError('A recorded payment cannot be cancelled.', 'conflict');
  await commit((db) => {
    db.onlinePayments = db.onlinePayments.map((x) => (x.id === id ? { ...x, status: 'cancelled' as const, updatedAt: nowISO() } : x));
  });
}

/** A short-lived link to view the uploaded receipt. Null offline or when there is none. */
export async function slipUrl(p: OnlinePayment): Promise<string | null> {
  if (!p.slipPath || !isCloud || !supabase) return null;
  const { data } = await supabase.storage.from('payment-slips').createSignedUrl(p.slipPath, 600);
  return data?.signedUrl ?? null;
}

// --------------------------------------------------------- money by platform

export type LedgerChannel = 'counter' | 'online';
export type LedgerKind = 'bill' | 'balance' | 'advance' | 'bridal' | 'voucher';

export interface LedgerRow {
  id: string;
  at: string;
  shopId: string;
  customerId: string | null;
  customerName: string;
  method: MoneyMethod;
  amount: number;
  kind: LedgerKind;
  channel: LedgerChannel;
  reference: string;
}

const isOnlineNote = (s: string | null | undefined): boolean => Boolean(s && s.startsWith('Online PAY-'));

/**
 * Every rupee that came in, with who paid and how — counter and online alike.
 * Money spent from an advance, a voucher or points is not counted again.
 */
export function moneyLedger(shopId: string | null, from: string, to: string, db: Database = read()): LedgerRow[] {
  const inScope = (sid: string, at: string): boolean => (shopId === null || sid === shopId) && at.slice(0, 10) >= from && at.slice(0, 10) <= to;
  const name = (cid: string | null, fallback: string): string => (cid ? db.customers.find((c) => c.id === cid)?.name : undefined) ?? fallback;
  const rows: LedgerRow[] = [];
  for (const s of db.sales) {
    if (s.status !== 'completed') continue;
    for (const p of s.payments) {
      if (['voucher', 'points', 'wallet'].includes(p.method)) continue;
      const at = p.at ?? s.soldAt;
      if (!inScope(s.shopId, at)) continue;
      rows.push({
        id: `${s.id}:${p.id}`,
        at,
        shopId: s.shopId,
        customerId: s.customerId,
        customerName: name(s.customerId, s.customerName),
        method: p.method as MoneyMethod,
        amount: p.amount - (p.method === 'cash' ? (p.at ? 0 : s.changeGiven) : 0),
        kind: p.at && p.at !== s.soldAt ? 'balance' : 'bill',
        channel: isOnlineNote(p.reference) ? 'online' : 'counter',
        reference: s.receiptNo,
      });
    }
  }
  for (const c of db.customerCredits) {
    if (c.kind !== 'advance' || !inScope(c.shopId, c.createdAt)) continue;
    rows.push({
      id: c.id,
      at: c.createdAt,
      shopId: c.shopId,
      customerId: c.customerId,
      customerName: name(c.customerId, 'Customer'),
      method: c.method ?? 'other',
      amount: c.amount,
      kind: 'advance',
      channel: isOnlineNote(c.note) ? 'online' : 'counter',
      reference: c.note,
    });
  }
  for (const b of db.bridalBookings) {
    for (const p of b.payments) {
      if (p.kind === 'refund' || !inScope(b.shopId, p.at)) continue;
      rows.push({
        id: `${b.id}:${p.id}`,
        at: p.at,
        shopId: b.shopId,
        customerId: b.customerId,
        customerName: b.brideName,
        method: p.method,
        amount: p.amount,
        kind: 'bridal',
        channel: isOnlineNote(p.note) ? 'online' : 'counter',
        reference: b.bookingNo,
      });
    }
  }
  for (const v of db.vouchers) {
    if (!inScope(v.shopId, v.createdAt)) continue;
    rows.push({
      id: v.id,
      at: v.createdAt,
      shopId: v.shopId,
      customerId: null,
      customerName: v.purchasedBy,
      method: v.paidBy ?? 'cash',
      amount: v.initialValue,
      kind: 'voucher',
      channel: isOnlineNote(v.notes) ? 'online' : 'counter',
      reference: v.code,
    });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export function totalsByMethod(rows: LedgerRow[]): Record<MoneyMethod, number> {
  const out: Record<MoneyMethod, number> = { cash: 0, card: 0, 'bank-transfer': 0, jazzcash: 0, easypaisa: 0, other: 0 };
  for (const r of rows) out[r.method] = round2((out[r.method] ?? 0) + r.amount);
  return out;
}

export const MONEY_METHOD_LABEL: Record<MoneyMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  'bank-transfer': 'Bank transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  other: 'Other',
};
