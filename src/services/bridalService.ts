import { getYear } from 'date-fns';
import type { Database } from '@/mock/seed';
import type {
  Appointment,
  BridalBooking,
  BridalEvent,
  BridalExtra,
  BridalPayment,
  BridalStatus,
  Sale,
  User,
} from '@/types';
import { uid } from '@/utils/id';
import { formatCurrency, round2 } from '@/utils/money';
import { commit, nowISO, read, requireRow, ServiceError, stamped } from './db';
import { nextReceiptNo } from './saleService';
import { raise } from './notificationService';

/**
 * Weddings. One booking holds the package, every event (trial, mehndi, barat,
 * walima…), the artist for each, and every rupee paid against it. Each event
 * is written into the diary as an appointment so the artist's time is blocked
 * and the calendar shows it; the database refuses a double-booking.
 */

export const paidOf = (b: Pick<BridalBooking, 'payments'>): number =>
  round2(b.payments.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0));
export const balanceOf = (b: Pick<BridalBooking, 'payments' | 'total'>): number => round2(b.total - paidOf(b));

export function computeTotal(packagePrice: number, extras: BridalExtra[], travel: number, discount: number): number {
  const gross = packagePrice + extras.reduce((s, e) => s + e.price, 0) + travel;
  return round2(Math.max(0, gross - discount));
}

function nextBookingNo(db: Database, shopId: string): string {
  const code = db.shops.find((s) => s.id === shopId)?.code ?? 'AUR';
  const prefix = `BR-${code}-${getYear(new Date())}-`;
  const n = db.bridalBookings
    .filter((b) => b.bookingNo.startsWith(prefix))
    .reduce((m, b) => Math.max(m, Number(b.bookingNo.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
}

/** The ISO start of an event: ready-by time minus the artist's working time. */
export function eventStart(e: Pick<BridalEvent, 'date' | 'readyBy' | 'durationMin'>): string {
  const ready = new Date(`${e.date}T${e.readyBy || '18:00'}:00`);
  return new Date(ready.getTime() - e.durationMin * 60_000).toISOString();
}

/** Keeps each event's diary entry in step with the event: create, move or cancel it. */
function syncAppointments(db: Database, booking: BridalBooking, actor: User): BridalBooking {
  const at = nowISO();
  const events = booking.events.map((e) => {
    const existing = e.appointmentId ? db.appointments.find((a) => a.id === e.appointmentId) : undefined;
    const wanted = booking.status !== 'cancelled' && e.status === 'scheduled' && e.artistId !== null;
    if (!wanted) {
      if (existing && existing.status !== 'cancelled') {
        db.appointments = db.appointments.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                status: 'cancelled' as const,
                cancelReason: 'Bridal event removed or cancelled',
                updatedAt: at,
                history: [...a.history, { status: 'cancelled' as const, at, byUserId: actor.id, byUserName: actor.name, note: null }],
              }
            : a,
        );
      }
      // The cancelled entry is let go; a fresh one is made if the event comes back.
      return e.status === 'done' ? e : { ...e, appointmentId: null };
    }
    const fields = {
      shopId: booking.shopId,
      customerId: booking.customerId,
      staffId: e.artistId as string,
      services: [],
      startAt: eventStart(e),
      durationMin: e.durationMin,
      notes: `${booking.bookingNo} · ${e.type}${e.location === 'on-location' ? ` · at ${e.venue}` : ''}${e.lookNotes ? ` · ${e.lookNotes}` : ''}`,
      bridalBookingId: booking.id,
    };
    if (existing && existing.status !== 'cancelled') {
      db.appointments = db.appointments.map((a) => (a.id === existing.id ? { ...a, ...fields, updatedAt: at } : a));
      return e;
    }
    const appt: Appointment = stamped({
      id: uid('apt'),
      ...fields,
      status: 'confirmed' as const,
      cancelReason: null,
      history: [{ status: 'confirmed' as const, at, byUserId: actor.id, byUserName: actor.name, note: `Bridal ${e.type}` }],
      saleId: null,
      source: 'front-desk' as const,
    });
    db.appointments = [...db.appointments, appt];
    return { ...e, appointmentId: appt.id };
  });
  return { ...booking, events };
}

export interface BookingInput {
  shopId: string;
  customerId: string;
  packageId: string | null;
  packageName: string;
  packagePrice: number;
  extras: BridalExtra[];
  travelCharge: number;
  discount: number;
  events: BridalEvent[];
  advanceRequired: number;
  notes: string;
  status: BridalStatus;
}

function validate(input: BookingInput, db: Database): void {
  if (!db.customers.some((c) => c.id === input.customerId)) throw new ServiceError('Pick the bride (customer).', 'validation');
  if (!input.packageName.trim()) throw new ServiceError('Pick a package or name the booking.', 'validation');
  if (input.events.length === 0) throw new ServiceError('Add at least one event (e.g. Barat).', 'validation');
  for (const e of input.events) {
    if (!e.date) throw new ServiceError(`Set a date for the ${e.type}.`, 'validation');
    if (!(e.durationMin > 0)) throw new ServiceError(`Set how long the ${e.type} takes.`, 'validation');
    if (e.location === 'on-location' && !e.venue.trim()) throw new ServiceError(`Add the venue for the ${e.type}.`, 'validation');
  }
  if (input.discount < 0 || input.travelCharge < 0) throw new ServiceError('Amounts cannot be negative.', 'validation');
}

export async function create(input: BookingInput, actor: User): Promise<BridalBooking> {
  const db0 = read();
  validate(input, db0);
  const customer = requireRow(db0.customers.find((c) => c.id === input.customerId), 'That customer');
  return commit((db) => {
    let booking: BridalBooking = stamped({
      id: uid('brd'),
      shopId: input.shopId,
      bookingNo: nextBookingNo(db, input.shopId),
      customerId: customer.id,
      brideName: customer.name,
      phone: customer.phone,
      packageId: input.packageId,
      packageName: input.packageName.trim(),
      packagePrice: round2(input.packagePrice),
      extras: input.extras,
      travelCharge: round2(input.travelCharge),
      discount: round2(input.discount),
      total: computeTotal(input.packagePrice, input.extras, input.travelCharge, input.discount),
      events: input.events,
      payments: [],
      status: input.status,
      advanceRequired: round2(input.advanceRequired),
      notes: input.notes.trim(),
      cancelReason: null,
      saleId: null,
    });
    booking = syncAppointments(db, booking, actor);
    db.bridalBookings = [booking, ...db.bridalBookings];
    return booking;
  });
}

export async function update(id: string, input: BookingInput, actor: User): Promise<BridalBooking> {
  const db0 = read();
  const existing = requireRow(db0.bridalBookings.find((b) => b.id === id), 'That booking');
  if (existing.status === 'completed') throw new ServiceError('A completed booking cannot be edited.', 'conflict');
  validate(input, db0);
  const total = computeTotal(input.packagePrice, input.extras, input.travelCharge, input.discount);
  if (total < paidOf(existing)) {
    throw new ServiceError(`The new total is below the ${formatCurrency(paidOf(existing))} already paid. Refund the difference first.`, 'validation');
  }
  return commit((db) => {
    let next: BridalBooking = {
      ...existing,
      ...input,
      packageName: input.packageName.trim(),
      notes: input.notes.trim(),
      total,
      updatedAt: nowISO(),
    };
    next = syncAppointments(db, next, actor);
    db.bridalBookings = db.bridalBookings.map((b) => (b.id === id ? next : b));
    return next;
  });
}

export async function takePayment(
  id: string,
  input: Pick<BridalPayment, 'amount' | 'method' | 'kind' | 'note'>,
  actor: User,
): Promise<BridalBooking> {
  const b = requireRow(read().bridalBookings.find((x) => x.id === id), 'That booking');
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new ServiceError('Enter the amount.', 'validation');
  if (b.status === 'cancelled' && input.kind !== 'refund') throw new ServiceError('This booking is cancelled.', 'conflict');
  if (input.kind === 'refund' && amount > paidOf(b)) throw new ServiceError(`Only ${formatCurrency(paidOf(b))} has been paid.`, 'validation');
  if (input.kind !== 'refund' && amount > balanceOf(b) + 0.001) {
    throw new ServiceError(`Only ${formatCurrency(balanceOf(b))} is left to pay.`, 'validation');
  }
  return commit((db) => {
    const payment: BridalPayment = { id: uid('bpy'), at: nowISO(), amount, method: input.method, kind: input.kind, note: input.note.trim(), byUserName: actor.name };
    let status = b.status;
    // Paying the advance is what holds the dates.
    if (status === 'tentative' && input.kind !== 'refund' && paidOf(b) + amount >= b.advanceRequired) status = 'confirmed';
    const next: BridalBooking = { ...b, payments: [...b.payments, payment], status, updatedAt: nowISO() };
    db.bridalBookings = db.bridalBookings.map((x) => (x.id === id ? next : x));
    return next;
  });
}

export async function setEventStatus(id: string, eventId: string, status: BridalEvent['status'], actor: User): Promise<void> {
  const b = requireRow(read().bridalBookings.find((x) => x.id === id), 'That booking');
  await commit((db) => {
    let next: BridalBooking = { ...b, events: b.events.map((e) => (e.id === eventId ? { ...e, status } : e)), updatedAt: nowISO() };
    if (status === 'done') {
      const e = b.events.find((x) => x.id === eventId);
      if (e?.appointmentId) {
        const at = nowISO();
        db.appointments = db.appointments.map((a) =>
          a.id === e.appointmentId
            ? { ...a, status: 'completed' as const, updatedAt: at, history: [...a.history, { status: 'completed' as const, at, byUserId: actor.id, byUserName: actor.name, note: null }] }
            : a,
        );
      }
    } else {
      next = syncAppointments(db, next, actor);
    }
    db.bridalBookings = db.bridalBookings.map((x) => (x.id === id ? next : x));
  });
}

export async function cancel(id: string, reason: string, actor: User): Promise<BridalBooking> {
  const b = requireRow(read().bridalBookings.find((x) => x.id === id), 'That booking');
  if (b.status === 'completed') throw new ServiceError('A completed booking cannot be cancelled.', 'conflict');
  if (!reason.trim()) throw new ServiceError('Give a reason for cancelling.', 'validation');
  return commit((db) => {
    let next: BridalBooking = { ...b, status: 'cancelled', cancelReason: reason.trim(), updatedAt: nowISO() };
    next = syncAppointments(db, next, actor);
    db.bridalBookings = db.bridalBookings.map((x) => (x.id === id ? next : x));
    return next;
  });
}

/**
 * Closes the booking with a bill, so the wedding shows in revenue, the
 * customer's history and the stylists' commission like any other sale.
 * The money was already counted at the till when each payment was taken.
 */
export async function complete(id: string, _actor?: User): Promise<BridalBooking> {
  const db0 = read();
  const b = requireRow(db0.bridalBookings.find((x) => x.id === id), 'That booking');
  if (b.status === 'completed') throw new ServiceError('Already completed.', 'conflict');
  if (b.status === 'cancelled') throw new ServiceError('This booking is cancelled.', 'conflict');
  const due = balanceOf(b);
  const leadArtist = b.events.find((e) => e.artistId)?.artistId ?? null;
  const items = [
    { id: uid('sit'), kind: 'package' as const, refId: b.packageId ?? b.id, name: `${b.packageName} (${b.bookingNo})`, unitPrice: b.packagePrice, quantity: 1, discount: 0, staffId: leadArtist, lineTotal: b.packagePrice },
    ...b.extras.map((x) => ({ id: uid('sit'), kind: 'service' as const, refId: x.id, name: x.name, unitPrice: x.price, quantity: 1, discount: 0, staffId: leadArtist, lineTotal: x.price })),
    ...(b.travelCharge > 0
      ? [{ id: uid('sit'), kind: 'service' as const, refId: 'travel', name: 'Travel / on-location charge', unitPrice: b.travelCharge, quantity: 1, discount: 0, staffId: null, lineTotal: b.travelCharge }]
      : []),
  ];
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const done = await commit((db) => {
    const sale: Sale = stamped({
      id: uid('sal'),
      shopId: b.shopId,
      receiptNo: nextReceiptNo(b.shopId),
      customerId: b.customerId,
      customerName: b.brideName,
      staffId: leadArtist,
      appointmentId: null,
      items,
      subtotal,
      itemDiscountTotal: 0,
      billDiscount: b.discount,
      membershipDiscount: 0,
      taxRate: 0,
      taxAmount: 0,
      total: b.total,
      payments: b.payments
        .filter((p) => p.kind !== 'refund')
        .map((p) => ({ id: p.id, method: p.method, amount: p.amount, tendered: null, reference: b.bookingNo, at: p.at, byUserName: p.byUserName })),
      changeGiven: 0,
      status: 'completed' as const,
      refundReason: null,
      refundedAt: null,
      soldAt: nowISO(),
      notes: `Bridal booking ${b.bookingNo}`,
      couponCode: null,
      tip: 0,
      tipStaffId: null,
      balanceDue: due,
      pointsEarned: 0,
      bridalBookingId: b.id,
    });
    db.sales = [sale, ...db.sales];
    const next: BridalBooking = {
      ...b,
      status: 'completed',
      saleId: sale.id,
      events: b.events.map((e) => (e.status === 'scheduled' ? { ...e, status: 'done' as const } : e)),
      updatedAt: nowISO(),
    };
    db.bridalBookings = db.bridalBookings.map((x) => (x.id === id ? next : x));
    return next;
  });
  raise({
    shopId: b.shopId,
    type: 'payment-completed',
    title: 'Bridal booking completed',
    message: `${b.bookingNo} for ${b.brideName} closed at ${formatCurrency(b.total)}${due > 0 ? `, ${formatCurrency(due)} still owed` : ''}.`,
    link: `/billing/bills/${done.saleId ?? ''}`,
  });
  return done;
}

export async function remove(id: string, actor: User): Promise<void> {
  const b = requireRow(read().bridalBookings.find((x) => x.id === id), 'That booking');
  if (b.payments.length > 0) throw new ServiceError('This booking has payments — cancel it instead, so the money stays on record.', 'conflict');
  await commit((db) => {
    syncAppointments(db, { ...b, status: 'cancelled' }, actor);
    db.appointments = db.appointments.filter((a) => a.bridalBookingId !== id);
    db.bridalBookings = db.bridalBookings.filter((x) => x.id !== id);
  });
}

export function newEvent(type: BridalEvent['type'] = 'Barat'): BridalEvent {
  return {
    id: uid('bev'),
    type,
    date: '',
    readyBy: '18:00',
    durationMin: type === 'Trial' ? 120 : 180,
    artistId: null,
    location: 'salon',
    venue: '',
    lookNotes: '',
    appointmentId: null,
    status: 'scheduled',
  };
}
