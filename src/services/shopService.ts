import { createLogin, loginEmail, loginLabel } from './loginService';
import { isSameDay, parseISO } from 'date-fns';
import type { BusinessHours, Shop, User } from '@/types';
import { uid } from '@/utils/id';
import { round2 } from '@/utils/money';
import { toISODate } from '@/utils/date';
import { commit, delay, nowISO, read, requireRow, ServiceError, stamped } from './db';

export interface ShopInput {
  name: string;
  code: string;
  addressLine: string;
  city: string;
  phone: string;
  email: string;
  managerName: string;
  businessHours: BusinessHours;
  receiptFooter: string;
  logoUrl: string | null;
  billOverride?: Shop['billOverride'];
}

export interface ShopWithAccount extends ShopInput {
  /** Username (or email) for the branch login created alongside the shop. */
  accountEmail: string;
  accountName: string;
  accountPassword: string;
}

export async function list(): Promise<Shop[]> {
  return delay(read().shops);
}

export function listSync(): Shop[] {
  return read().shops;
}

export async function getById(id: string): Promise<Shop> {
  return delay(requireRow(read().shops.find((s) => s.id === id), 'That branch'));
}

export function getSync(id: string | null): Shop | undefined {
  if (!id) return undefined;
  return read().shops.find((s) => s.id === id);
}

export function nameOf(id: string | null): string {
  if (!id) return 'All shops';
  return read().shops.find((s) => s.id === id)?.name ?? 'Unknown branch';
}

function assertCodeFree(code: string, exceptId?: string): void {
  const clash = read().shops.find(
    (s) => s.id !== exceptId && s.code.toLowerCase() === code.trim().toLowerCase(),
  );
  if (clash) {
    throw new ServiceError(
      `The code ${code} is already used by ${clash.name}. Receipt numbers must stay unique.`,
      'conflict',
    );
  }
}

/** Creating a branch also creates the login the branch will sign in with. */
export async function create(input: ShopWithAccount): Promise<Shop> {
  assertCodeFree(input.code);
  if (!input.name.trim()) throw new ServiceError('Enter the branch name.', 'validation');
  const email = loginEmail(input.accountEmail);
  if (read().users.some((u) => u.email.toLowerCase() === email)) {
    throw new ServiceError(`The username "${loginLabel(email)}" is already taken.`, 'conflict');
  }
  if (input.accountPassword.length < 6) {
    throw new ServiceError('Give the branch login a password of at least 6 characters.', 'validation');
  }

  const shop: Shop = stamped({
    id: uid('shop'),
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    addressLine: input.addressLine.trim(),
    city: input.city.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    managerName: input.managerName.trim(),
    logoUrl: input.logoUrl,
    businessHours: input.businessHours,
    receiptFooter: input.receiptFooter.trim(),
    active: true,
    openedOn: toISODate(new Date()),
  });

  const saved = await commit((db) => {
    db.shops = [...db.shops, shop];
    return shop;
  });
  await createLogin({
    name: input.accountName.trim() || `${shop.name} desk`,
    username: input.accountEmail,
    password: input.accountPassword,
    shopId: shop.id,
    phone: input.phone,
  });
  return saved;
}

export async function update(id: string, input: Partial<ShopInput>): Promise<Shop> {
  const existing = requireRow(read().shops.find((s) => s.id === id), 'That branch');
  if (input.code) assertCodeFree(input.code, id);

  return commit((db) => {
    const next: Shop = {
      ...existing,
      ...input,
      code: input.code ? input.code.trim().toUpperCase() : existing.code,
      updatedAt: nowISO(),
    };
    db.shops = db.shops.map((s) => (s.id === id ? next : s));
    return next;
  });
}

/** Deactivating a branch also suspends its login, so nobody can sign back in. */
export async function setActive(id: string, active: boolean): Promise<Shop> {
  const existing = requireRow(read().shops.find((s) => s.id === id), 'That branch');
  return commit((db) => {
    const next = { ...existing, active, updatedAt: nowISO() };
    db.shops = db.shops.map((s) => (s.id === id ? next : s));
    db.users = db.users.map((u) => (u.shopId === id ? { ...u, active, updatedAt: nowISO() } : u));
    return next;
  });
}

export function accountFor(shopId: string): User | undefined {
  return read().users.find((u) => u.shopId === shopId && u.role === 'shop');
}

export interface ShopSummary {
  shop: Shop;
  todayRevenue: number;
  todayAppointments: number;
  staffCount: number;
  customerCount: number;
  monthRevenue: number;
}

export function summarise(today = new Date()): ShopSummary[] {
  const db = read();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();

  return db.shops.map((shop) => {
    const sales = db.sales.filter((s) => s.shopId === shop.id && s.status === 'completed');
    return {
      shop,
      todayRevenue: round2(
        sales.filter((s) => isSameDay(parseISO(s.soldAt), today)).reduce((sum, s) => sum + s.total, 0),
      ),
      monthRevenue: round2(
        sales
          .filter((s) => parseISO(s.soldAt).getTime() >= monthStart)
          .reduce((sum, s) => sum + s.total, 0),
      ),
      todayAppointments: db.appointments.filter(
        (a) => a.shopId === shop.id && isSameDay(parseISO(a.startAt), today),
      ).length,
      staffCount: db.staff.filter((s) => s.shopId === shop.id && s.active).length,
      customerCount: db.customers.filter((c) => c.shopId === shop.id).length,
    };
  });
}
