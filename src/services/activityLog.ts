import type { Database } from '@/mock/seed';
import type { ActivityEntry, User } from '@/types';
import { uid } from '@/utils/id';

/**
 * The audit trail writes itself: every store mutation is compared with the
 * one before it, and each created, edited or deleted record becomes one line —
 * who, what, when. No service has to remember to log anything.
 */

let actor: Pick<User, 'id' | 'name'> | null = null;

export function setActivityActor(user: Pick<User, 'id' | 'name'> | null): void {
  actor = user;
}

/** Tables worth auditing, with a human name and how to label a row. */
const AUDITED: Partial<Record<keyof Database, { entity: string; label: (row: never) => string }>> = {
  shops: { entity: 'Branch', label: (r: { name: string }) => r.name },
  staff: { entity: 'Staff member', label: (r: { name: string }) => r.name },
  customers: { entity: 'Customer', label: (r: { name: string }) => r.name },
  services: { entity: 'Service', label: (r: { name: string; price: number }) => `${r.name} (${r.price})` },
  serviceCategories: { entity: 'Category', label: (r: { name: string }) => r.name },
  packages: { entity: 'Package', label: (r: { name: string }) => r.name },
  memberships: { entity: 'Membership', label: (r: { name: string }) => r.name },
  products: { entity: 'Product', label: (r: { name: string; stock: number }) => `${r.name} (stock ${r.stock})` },
  appointments: {
    entity: 'Appointment',
    label: (r: { startAt: string; status: string }) => `${r.startAt.slice(0, 16).replace('T', ' ')} · ${r.status}`,
  },
  sales: { entity: 'Bill', label: (r: { receiptNo: string; total: number; status: string }) => `${r.receiptNo} · ${r.total} · ${r.status}` },
  expenses: { entity: 'Expense', label: (r: { title: string; amount: number }) => `${r.title} (${r.amount})` },
  vouchers: { entity: 'Gift voucher', label: (r: { code: string; balance: number }) => `${r.code} (balance ${r.balance})` },
  coupons: { entity: 'Coupon', label: (r: { code: string }) => r.code },
  customerCredits: { entity: 'Customer advance', label: (r: { amount: number; kind: string }) => `${r.kind} ${r.amount}` },
  registerSessions: { entity: 'Cash register', label: (r: { closedAt: string | null }) => (r.closedAt ? 'closed' : 'open') },
  attendance: { entity: 'Attendance', label: (r: { date: string; status: string }) => `${r.date} · ${r.status}` },
  payrollRuns: { entity: 'Salary payment', label: (r: { month: string; netPay: number }) => `${r.month} · ${r.netPay}` },
  feedback: { entity: 'Feedback', label: (r: { rating: number; customerName: string }) => `${r.customerName} · ${r.rating}★` },
};

export function recordActivity(prev: Database, next: Database): void {
  const at = new Date().toISOString();
  const entries: ActivityEntry[] = [];
  for (const [key, spec] of Object.entries(AUDITED) as Array<[keyof Database, NonNullable<(typeof AUDITED)[keyof Database]>]>) {
    const before = prev[key] as unknown as Array<{ id: string; shopId?: string | null }>;
    const after = next[key] as unknown as Array<{ id: string; shopId?: string | null }>;
    if (before === after || !Array.isArray(after)) continue;
    const old = new Map(before.map((r) => [r.id, r]));
    const push = (row: { id: string; shopId?: string | null }, action: ActivityEntry['action']): void => {
      entries.push({
        id: uid('act'),
        createdAt: at,
        updatedAt: at,
        at,
        // Catalogue rows have no branch; they are filed under the owner's log.
        shopId: row.shopId ?? (key === 'shops' ? row.id : 'global'),
        userId: actor?.id ?? null,
        userName: actor?.name ?? 'System',
        action,
        entity: spec.entity,
        label: String(spec.label(row as never)).slice(0, 160),
      });
    };
    for (const row of after) {
      const was = old.get(row.id);
      if (!was) push(row, 'created');
      else if (was !== row) push(row, 'updated');
      old.delete(row.id);
    }
    for (const row of old.values()) push(row, 'deleted');
  }
  if (entries.length) next.activity = [...entries, ...next.activity];
}
