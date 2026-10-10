import type { Customer, CustomerMembership, CustomerStats } from '@/types';
import { uid } from '@/utils/id';
import { digitsOnly } from '@/utils/text';
import { round2 } from '@/utils/money';
import { commit, delay, nowISO, read, requireRow, scopeTo, ServiceError, stamped } from './db';
import { raise } from './notificationService';

export type CustomerInput = Pick<
  Customer,
  'name' | 'phone' | 'email' | 'gender' | 'preferredStaffId' | 'preferredServiceIds' | 'sensitivities' | 'notes'
> & { shopId: string; birthday?: string | null; anniversary?: string | null };

export async function list(shopId: string | null): Promise<Customer[]> {
  return delay(scopeTo(read().customers, shopId));
}

export function listSync(shopId: string | null): Customer[] {
  return scopeTo(read().customers, shopId);
}

export async function getById(id: string): Promise<Customer> {
  const row = read().customers.find((c) => c.id === id);
  return delay(requireRow(row, 'That customer'));
}

/**
 * Phone numbers identify a customer at the front desk, so they must be unique
 * within a shop. Two branches may legitimately both know the same person.
 */
function assertPhoneFree(phone: string, shopId: string, exceptId?: string): void {
  const target = digitsOnly(phone);
  const clash = read().customers.find(
    (c) => c.shopId === shopId && c.id !== exceptId && digitsOnly(c.phone) === target,
  );
  if (clash) {
    throw new ServiceError(
      `${clash.name} is already registered at this branch with that phone number.`,
      'conflict',
    );
  }
}

export async function create(input: CustomerInput): Promise<Customer> {
  assertPhoneFree(input.phone, input.shopId);

  const row: Customer = stamped({
    id: uid('cus'),
    shopId: input.shopId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || null,
    gender: input.gender,
    preferredStaffId: input.preferredStaffId,
    preferredServiceIds: input.preferredServiceIds,
    sensitivities: input.sensitivities.trim(),
    notes: input.notes.trim(),
    active: true,
    firstVisitOn: null,
    birthday: input.birthday ?? null,
    anniversary: input.anniversary ?? null,
  });

  const saved = await commit((db) => {
    db.customers = [row, ...db.customers];
    return row;
  });

  raise({
    shopId: saved.shopId,
    type: 'customer-created',
    title: 'New customer added',
    message: `${saved.name} was added to the customer book.`,
    link: `/customers/${saved.id}`,
  });

  return saved;
}

export async function update(id: string, input: Partial<CustomerInput>): Promise<Customer> {
  const existing = requireRow(read().customers.find((c) => c.id === id), 'That customer');
  if (input.phone) assertPhoneFree(input.phone, input.shopId ?? existing.shopId, id);

  return commit((db) => {
    const next: Customer = {
      ...existing,
      ...input,
      email: input.email !== undefined ? input.email?.trim() || null : existing.email,
      updatedAt: nowISO(),
    };
    db.customers = db.customers.map((c) => (c.id === id ? next : c));
    return next;
  });
}

export async function setActive(id: string, active: boolean): Promise<Customer> {
  const existing = requireRow(read().customers.find((c) => c.id === id), 'That customer');
  return commit((db) => {
    const next = { ...existing, active, updatedAt: nowISO() };
    db.customers = db.customers.map((c) => (c.id === id ? next : c));
    return next;
  });
}

/**
 * Visits and spend are always derived, never stored, so a refunded bill or a
 * cancelled appointment corrects the totals without a migration.
 */
export function statsFor(customerId: string): CustomerStats {
  const db = read();
  const now = Date.now();

  const visits = db.appointments.filter(
    (a) => a.customerId === customerId && a.status === 'completed',
  );
  const bills = db.sales.filter((s) => s.customerId === customerId && s.status === 'completed');

  const lastVisit = visits
    .map((a) => a.startAt)
    .sort()
    .at(-1);

  const upcoming = db.appointments
    .filter(
      (a) =>
        a.customerId === customerId &&
        new Date(a.startAt).getTime() > now &&
        a.status !== 'cancelled' &&
        a.status !== 'no-show',
    )
    .map((a) => a.startAt)
    .sort()
    .at(0);

  const held = activeMembershipFor(customerId);
  const tier = held ? db.memberships.find((m) => m.id === held.membershipId) : undefined;

  return {
    totalVisits: visits.length,
    totalSpent: round2(bills.reduce((sum, s) => sum + s.total, 0)),
    lastVisitAt: lastVisit ?? null,
    upcomingAppointmentAt: upcoming ?? null,
    membershipLabel: tier?.name ?? null,
  };
}

export function activeMembershipFor(customerId: string): CustomerMembership | null {
  const today = new Date().toISOString().slice(0, 10);
  return (
    read().customerMemberships.find(
      (m) =>
        m.customerId === customerId &&
        m.status === 'active' &&
        m.startsOn <= today &&
        m.expiresOn >= today,
    ) ?? null
  );
}

/** Discount percentage the customer's active tier grants, or 0. */
export function discountPctFor(customerId: string | null): number {
  if (!customerId) return 0;
  const held = activeMembershipFor(customerId);
  if (!held) return 0;
  const tier = read().memberships.find((m) => m.id === held.membershipId);
  return tier?.active ? tier.discountPct : 0;
}

export async function assignMembership(
  customerId: string,
  membershipId: string,
  startsOn: string,
): Promise<CustomerMembership> {
  const db = read();
  const customer = requireRow(db.customers.find((c) => c.id === customerId), 'That customer');
  const tier = requireRow(db.memberships.find((m) => m.id === membershipId), 'That membership');

  const start = new Date(startsOn);
  const expires = new Date(start.getTime() + tier.validityDays * 86400000);

  const row: CustomerMembership = stamped({
    id: uid('cmem'),
    customerId,
    membershipId,
    shopId: customer.shopId,
    startsOn,
    expiresOn: expires.toISOString().slice(0, 10),
    status: 'active' as const,
  });

  return commit((current) => {
    // Only one active tier at a time; the new one supersedes the old.
    current.customerMemberships = [
      row,
      ...current.customerMemberships.map((m) =>
        m.customerId === customerId && m.status === 'active'
          ? { ...m, status: 'cancelled' as const, updatedAt: nowISO() }
          : m,
      ),
    ];
    return row;
  });
}

export async function cancelMembership(id: string): Promise<void> {
  await commit((db) => {
    db.customerMemberships = db.customerMemberships.map((m) =>
      m.id === id ? { ...m, status: 'cancelled' as const, updatedAt: nowISO() } : m,
    );
  });
}
