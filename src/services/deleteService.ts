import type { Database } from '@/mock/seed';
import { commit, read, requireRow, ServiceError } from './db';

/**
 * Deleting for good. Anything that appears on a bill or a booking is history
 * the reports depend on, so those records can only be switched off — the
 * error says so and points to the switch. Everything else really goes.
 */

function refuse(what: string, why: string): never {
  throw new ServiceError(`${what} ${why} — switch it off instead, so past bills and reports stay correct.`, 'conflict');
}

const usedOnBill = (db: Database, kind: string, id: string): boolean =>
  db.sales.some((s) => s.items.some((i) => i.kind === kind && i.refId === id));

export async function deleteCustomer(id: string): Promise<void> {
  const db = read();
  const c = requireRow(db.customers.find((x) => x.id === id), 'That customer');
  if (db.sales.some((s) => s.customerId === id)) refuse(c.name, 'has bills');
  if (db.appointments.some((a) => a.customerId === id)) refuse(c.name, 'has appointments');
  if (db.customerCredits.some((x) => x.customerId === id)) refuse(c.name, 'has advance payments');
  await commit((next) => {
    next.customers = next.customers.filter((x) => x.id !== id);
    next.customerMemberships = next.customerMemberships.filter((m) => m.customerId !== id);
    next.feedback = next.feedback.filter((f) => f.customerId !== id);
  });
}

export async function deleteProduct(id: string): Promise<void> {
  const db = read();
  const p = requireRow(db.products.find((x) => x.id === id), 'That product');
  if (usedOnBill(db, 'product', id)) refuse(p.name, 'has been sold');
  await commit((next) => {
    next.products = next.products.filter((x) => x.id !== id);
    next.inventoryMovements = next.inventoryMovements.filter((m) => m.productId !== id);
  });
}

export async function deleteService(id: string): Promise<void> {
  const db = read();
  const s = requireRow(db.services.find((x) => x.id === id), 'That service');
  if (usedOnBill(db, 'service', id)) refuse(s.name, 'has been billed');
  if (db.appointments.some((a) => a.services.some((x) => x.serviceId === id))) refuse(s.name, 'has been booked');
  if (db.packages.some((p) => p.items.some((i) => i.serviceId === id))) {
    throw new ServiceError(`${s.name} is part of a package. Remove it from the package first.`, 'conflict');
  }
  await commit((next) => {
    next.services = next.services.filter((x) => x.id !== id);
    next.staff = next.staff.map((m) =>
      m.specializations.includes(id) ? { ...m, specializations: m.specializations.filter((x) => x !== id) } : m,
    );
  });
}

export async function deletePackage(id: string): Promise<void> {
  const db = read();
  const p = requireRow(db.packages.find((x) => x.id === id), 'That package');
  if (usedOnBill(db, 'package', id)) refuse(p.name, 'has been sold');
  await commit((next) => {
    next.packages = next.packages.filter((x) => x.id !== id);
  });
}

export async function deleteMembership(id: string): Promise<void> {
  const db = read();
  const m = requireRow(db.memberships.find((x) => x.id === id), 'That membership');
  if (db.customerMemberships.some((x) => x.membershipId === id)) refuse(m.name, 'has members');
  await commit((next) => {
    next.memberships = next.memberships.filter((x) => x.id !== id);
  });
}

export async function deleteStaff(id: string): Promise<void> {
  const db = read();
  const s = requireRow(db.staff.find((x) => x.id === id), 'That staff member');
  if (db.appointments.some((a) => a.staffId === id)) refuse(s.name, 'has appointments');
  if (db.sales.some((x) => x.staffId === id || x.items.some((i) => i.staffId === id))) refuse(s.name, 'has bills');
  if (db.payrollRuns.some((r) => r.staffId === id)) refuse(s.name, 'has salary records');
  await commit((next) => {
    next.staff = next.staff.filter((x) => x.id !== id);
    next.attendance = next.attendance.filter((a) => a.staffId !== id);
  });
}

export async function deleteShop(id: string): Promise<void> {
  const db = read();
  const s = requireRow(db.shops.find((x) => x.id === id), 'That branch');
  if (db.sales.some((x) => x.shopId === id)) refuse(s.name, 'has bills');
  if (db.appointments.some((x) => x.shopId === id)) refuse(s.name, 'has appointments');
  if (db.customers.some((x) => x.shopId === id)) refuse(s.name, 'has customers');
  if (db.users.some((u) => u.shopId === id)) {
    throw new ServiceError(`Delete ${s.name}'s logins first (Users & logins).`, 'conflict');
  }
  await commit((next) => {
    next.shops = next.shops.filter((x) => x.id !== id);
    next.staff = next.staff.filter((x) => x.shopId !== id);
    next.products = next.products.filter((x) => x.shopId !== id);
    next.inventoryMovements = next.inventoryMovements.filter((x) => x.shopId !== id);
    next.expenses = next.expenses.filter((x) => x.shopId !== id);
  });
}

export async function deleteVoucher(id: string): Promise<void> {
  const db = read();
  const v = requireRow(db.vouchers.find((x) => x.id === id), 'That voucher');
  if (v.balance !== v.initialValue) refuse(`Voucher ${v.code}`, 'has been partly used');
  await commit((next) => {
    next.vouchers = next.vouchers.filter((x) => x.id !== id);
  });
}

export async function deleteFeedback(id: string): Promise<void> {
  await commit((next) => {
    next.feedback = next.feedback.filter((x) => x.id !== id);
  });
}

export async function deleteAttendance(id: string): Promise<void> {
  await commit((next) => {
    next.attendance = next.attendance.filter((x) => x.id !== id);
  });
}

export async function deleteCredit(id: string): Promise<void> {
  const db = read();
  const c = requireRow(db.customerCredits.find((x) => x.id === id), 'That entry');
  if (c.saleId) throw new ServiceError('This entry belongs to a bill; refund the bill instead.', 'conflict');
  await commit((next) => {
    next.customerCredits = next.customerCredits.filter((x) => x.id !== id);
  });
}
