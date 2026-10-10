import { isSameDay, parseISO } from 'date-fns';
import type { Staff, StaffRole, StaffShift } from '@/types';
import { uid } from '@/utils/id';
import { round2 } from '@/utils/money';
import { toISODate } from '@/utils/date';
import { commit, delay, nowISO, read, requireRow, scopeTo, ServiceError, stamped } from './db';

export const STAFF_ROLES: StaffRole[] = [
  'Senior Stylist',
  'Stylist',
  'Colour Specialist',
  'Beauty Therapist',
  'Nail Technician',
  'Makeup Artist',
  'Salon Manager',
  'Receptionist',
];

export interface StaffInput {
  shopId: string;
  name: string;
  role: StaffRole;
  phone: string;
  email: string;
  specializations: string[];
  schedule: StaffShift[];
  timeOff: string[];
  commissionRate: number;
  monthlySalary?: number;
  photoUrl: string | null;
}

export async function list(shopId: string | null): Promise<Staff[]> {
  return delay(scopeTo(read().staff, shopId));
}

export function listSync(shopId: string | null): Staff[] {
  return scopeTo(read().staff, shopId);
}

export async function getById(id: string): Promise<Staff> {
  return delay(requireRow(read().staff.find((s) => s.id === id), 'That team member'));
}

export function nameOf(id: string | null): string {
  if (!id) return 'Unassigned';
  return read().staff.find((s) => s.id === id)?.name ?? 'Unknown';
}

/** Members who can actually be booked — active, and qualified for something. */
export function bookable(shopId: string | null): Staff[] {
  return scopeTo(read().staff, shopId).filter((s) => s.active && s.specializations.length > 0);
}

export async function create(input: StaffInput): Promise<Staff> {
  const row: Staff = stamped({
    id: uid('stf'),
    shopId: input.shopId,
    name: input.name.trim(),
    role: input.role,
    phone: input.phone.trim(),
    email: input.email.trim(),
    photoUrl: input.photoUrl,
    specializations: input.specializations,
    schedule: input.schedule,
    timeOff: input.timeOff,
    commissionRate: input.commissionRate,
    monthlySalary: input.monthlySalary ?? 0,
    active: true,
    joinedOn: toISODate(new Date()),
  });
  return commit((db) => {
    db.staff = [row, ...db.staff];
    return row;
  });
}

/**
 * A schedule change takes effect the moment it is saved — the availability
 * engine reads the rota live, so tomorrow's slot grid reflects it immediately.
 */
export async function update(id: string, input: Partial<StaffInput>): Promise<Staff> {
  const existing = requireRow(read().staff.find((s) => s.id === id), 'That team member');
  return commit((db) => {
    const next: Staff = { ...existing, ...input, updatedAt: nowISO() };
    db.staff = db.staff.map((s) => (s.id === id ? next : s));
    return next;
  });
}

/**
 * Deactivating frees the diary going forward, so we refuse while future
 * appointments are still on the books rather than silently orphaning them.
 */
export async function setActive(id: string, active: boolean): Promise<Staff> {
  const existing = requireRow(read().staff.find((s) => s.id === id), 'That team member');

  if (!active) {
    const upcoming = read().appointments.filter(
      (a) =>
        a.staffId === id &&
        parseISO(a.startAt).getTime() > Date.now() &&
        a.status !== 'cancelled' &&
        a.status !== 'no-show',
    );
    if (upcoming.length > 0) {
      throw new ServiceError(
        `${existing.name} still has ${upcoming.length} upcoming appointment${
          upcoming.length === 1 ? '' : 's'
        }. Reassign or cancel them first.`,
        'conflict',
      );
    }
  }

  return commit((db) => {
    const next = { ...existing, active, updatedAt: nowISO() };
    db.staff = db.staff.map((s) => (s.id === id ? next : s));
    return next;
  });
}

export async function addTimeOff(id: string, date: string): Promise<Staff> {
  const existing = requireRow(read().staff.find((s) => s.id === id), 'That team member');
  if (existing.timeOff.includes(date)) return existing;

  const clashes = read().appointments.filter(
    (a) => a.staffId === id && a.startAt.slice(0, 10) === date && a.status !== 'cancelled',
  );
  if (clashes.length > 0) {
    throw new ServiceError(
      `${existing.name} has ${clashes.length} appointment${clashes.length === 1 ? '' : 's'} booked on ${date}.`,
      'conflict',
    );
  }

  return commit((db) => {
    const next = { ...existing, timeOff: [...existing.timeOff, date].sort(), updatedAt: nowISO() };
    db.staff = db.staff.map((s) => (s.id === id ? next : s));
    return next;
  });
}

export async function removeTimeOff(id: string, date: string): Promise<Staff> {
  const existing = requireRow(read().staff.find((s) => s.id === id), 'That team member');
  return commit((db) => {
    const next = { ...existing, timeOff: existing.timeOff.filter((d) => d !== date), updatedAt: nowISO() };
    db.staff = db.staff.map((s) => (s.id === id ? next : s));
    return next;
  });
}

export interface StaffPerformance {
  staffId: string;
  name: string;
  role: StaffRole;
  shopId: string;
  completed: number;
  cancelled: number;
  noShow: number;
  upcoming: number;
  revenue: number;
  commission: number;
  commissionRate: number;
}

/**
 * Performance is computed from completed bills, not from appointment prices, so
 * a discount given at the till is reflected in the commission.
 */
export function performance(shopId: string | null, from?: Date, to?: Date): StaffPerformance[] {
  const db = read();
  const members = scopeTo(db.staff, shopId);
  const now = Date.now();

  const inRange = (iso: string): boolean => {
    const t = parseISO(iso).getTime();
    if (from && t < from.getTime()) return false;
    if (to && t > to.getTime()) return false;
    return true;
  };

  return members.map((member) => {
    const theirs = db.appointments.filter((a) => a.staffId === member.id && inRange(a.startAt));

    // Revenue credited per line, so a bill split across stylists divides fairly.
    const revenue = db.sales
      .filter((s) => s.status === 'completed' && inRange(s.soldAt))
      .reduce((sum, sale) => {
        const theirLines = sale.items.filter((i) => i.staffId === member.id);
        if (theirLines.length === 0) return sum;
        const lineSum = theirLines.reduce((t, i) => t + i.lineTotal, 0);
        // Apply the bill's overall discount proportionally.
        const billSubtotal = sale.items.reduce((t, i) => t + i.lineTotal, 0);
        const ratio = billSubtotal > 0 ? lineSum / billSubtotal : 0;
        const discounted = lineSum - (sale.billDiscount + sale.membershipDiscount) * ratio;
        return sum + Math.max(0, discounted);
      }, 0);

    return {
      staffId: member.id,
      name: member.name,
      role: member.role,
      shopId: member.shopId,
      completed: theirs.filter((a) => a.status === 'completed').length,
      cancelled: theirs.filter((a) => a.status === 'cancelled').length,
      noShow: theirs.filter((a) => a.status === 'no-show').length,
      upcoming: theirs.filter(
        (a) => parseISO(a.startAt).getTime() > now && a.status !== 'cancelled' && a.status !== 'no-show',
      ).length,
      revenue: round2(revenue),
      commission: round2(revenue * member.commissionRate),
      commissionRate: member.commissionRate,
    };
  });
}

/** Who is rostered on today, for the dashboard's "on duty" panel. */
export function onDutyToday(shopId: string | null, today = new Date()): Staff[] {
  const weekday = today.getDay();
  const iso = toISODate(today);
  return scopeTo(read().staff, shopId).filter((member) => {
    if (!member.active) return false;
    if (member.timeOff.includes(iso)) return false;
    const shift = member.schedule.find((s) => s.weekday === weekday);
    return Boolean(shift?.working);
  });
}

/** A member's appointments on one day, in time order. */
export function scheduleFor(staffId: string, day: Date) {
  return read()
    .appointments.filter((a) => a.staffId === staffId && isSameDay(parseISO(a.startAt), day))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
