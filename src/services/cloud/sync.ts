import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@/mock/seed';
import type { Enquiry, Settings } from '@/types';
import { liveDefaultSettings as defaultSettings } from '@/services/defaults';
import { SCHEMA_VERSION } from '@/mock/seed';
import { applyRemote, getDb, replaceDb, setMutationListener } from '@/store/dataStore';
import { requireSupabase } from './client';

/**
 * Keeps the in-memory database and Supabase in step.
 *
 * The services keep working exactly as they do in demo mode — they mutate the
 * store by swapping in new arrays and new row objects. After each mutation this
 * module diffs the tables by object identity, so only the rows that actually
 * changed are sent: an upsert for every new or replaced row, a delete for every
 * row that disappeared. Changes made at other tills arrive over Realtime and
 * are applied without being echoed back.
 */

type RowTable = Exclude<keyof Database, 'settings' | 'schemaVersion' | 'credentials'>;

/** Store table → Postgres table. */
export const TABLES: Record<RowTable, string> = {
  users: 'profiles',
  shops: 'shops',
  staff: 'staff',
  customers: 'customers',
  serviceCategories: 'service_categories',
  services: 'services',
  packages: 'packages',
  memberships: 'memberships',
  customerMemberships: 'customer_memberships',
  products: 'products',
  inventoryMovements: 'inventory_movements',
  appointments: 'appointments',
  sales: 'sales',
  expenses: 'expenses',
  notifications: 'notifications',
  vouchers: 'vouchers',
  coupons: 'coupons',
  customerCredits: 'customer_credits',
  registerSessions: 'register_sessions',
  attendance: 'attendance',
  feedback: 'feedback',
  payrollRuns: 'payroll_runs',
  activity: 'activity_log',
  bridalBookings: 'bridal_bookings',
  enquiries: 'enquiries',
  onlinePayments: 'online_payments',
  messages: 'messages',
  announcements: 'announcements',
};

const SETTINGS_TABLE = 'app_settings';
const UPDATE_ONLY = new Set<RowTable>(['users', 'shops', 'vouchers']);
/** Never deleted from the database by the app, and only recent rows are loaded. */
const APPEND_ONLY = new Set<RowTable>(['activity']);
const RECENT_DAYS = 90;
const SETTINGS_ID = 'global';
const PAGE = 1000;

interface Row {
  id: string;
  data: unknown;
}

type Op =
  | { kind: 'upsert'; table: string; rows: Row[] }
  | { kind: 'update'; table: string; rows: Row[] }
  | { kind: 'delete'; table: string; ids: string[] };

export function emptyDatabase(): Database {
  const tables = Object.fromEntries(Object.keys(TABLES).map((k) => [k, []])) as unknown as Omit<
    Database,
    'settings' | 'schemaVersion' | 'credentials'
  >;
  return {
    ...tables,
    credentials: [],
    settings: { ...defaultSettings },
    schemaVersion: SCHEMA_VERSION,
  };
}

async function fetchAll(table: string, sinceDays?: number): Promise<unknown[]> {
  const sb = requireSupabase();
  const out: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = sb.from(table).select('data');
    if (sinceDays) {
      query = query.gte('updated_at', new Date(Date.now() - sinceDays * 86_400_000).toISOString());
    }
    const { data, error } = await query.order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load ${table}: ${error.message}`);
    out.push(...(data ?? []).map((r: { data: unknown }) => r.data));
    if (!data || data.length < PAGE) return out;
  }
}

/** Everything this account is allowed to see. Row-level security does the filtering. */
export async function loadAll(): Promise<Database> {
  const db = emptyDatabase();
  const keys = Object.keys(TABLES) as RowTable[];
  const [rows, settingsRows] = await Promise.all([
    Promise.all(keys.map((k) => fetchAll(TABLES[k], APPEND_ONLY.has(k) ? RECENT_DAYS : undefined))),
    fetchAll(SETTINGS_TABLE),
  ]);
  keys.forEach((k, i) => {
    (db as unknown as Record<string, unknown[]>)[k] = rows[i] ?? [];
  });
  db.enquiries = db.enquiries.map(normaliseEnquiry);
  const stored = settingsRows[0] as Partial<Settings> | undefined;
  // Merge over the defaults so a setting added in a later version is never missing.
  if (stored) db.settings = { ...defaultSettings, ...stored } as Settings;
  return db;
}

/**
 * Enquiries can be written by the public website, so a row may be missing
 * fields or carry the wrong types. Fill and coerce them so the screen never
 * breaks on someone else's form.
 */
function normaliseEnquiry(raw: unknown): Enquiry {
  const r = (raw ?? {}) as Partial<Enquiry> & Record<string, unknown>;
  const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.slice(0, max) : '');
  const at = typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString();
  return {
    id: str(r.id, 80),
    createdAt: at,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : at,
    shopId: typeof r.shopId === 'string' ? r.shopId : null,
    name: str(r.name, 120) || 'Unknown',
    phone: str(r.phone, 30),
    email: str(r.email, 120),
    interest: str(r.interest, 200),
    preferredDate: typeof r.preferredDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.preferredDate) ? r.preferredDate : null,
    message: str(r.message, 2000),
    source: (['website', 'instagram', 'facebook', 'whatsapp', 'phone', 'walk-in', 'referral'] as const).includes(r.source as never) ? (r.source as Enquiry['source']) : 'website',
    status: (['new', 'contacted', 'booked', 'lost'] as const).includes(r.status as never) ? (r.status as Enquiry['status']) : 'new',
    notes: str(r.notes, 5000),
    followUpOn: typeof r.followUpOn === 'string' ? r.followUpOn : null,
    customerId: typeof r.customerId === 'string' ? r.customerId : null,
    bookingId: typeof r.bookingId === 'string' ? r.bookingId : null,
  };
}

function diff(prev: Database, next: Database): Op[] {
  const ops: Op[] = [];
  for (const key of Object.keys(TABLES) as RowTable[]) {
    const before = prev[key] as Array<{ id: string }>;
    const after = next[key] as Array<{ id: string }>;
    if (before === after) continue;

    const old = new Map(before.map((r) => [r.id, r]));
    const upserts: Row[] = [];
    const updates: Row[] = [];
    for (const row of after) {
      const was = old.get(row.id);
      if (was !== row) {
        // A branch may edit its own profile and shop but never create one, and an
        // upsert counts as a create to the security rules — so those go as updates.
        (was && UPDATE_ONLY.has(key) ? updates : upserts).push({ id: row.id, data: row });
      }
      old.delete(row.id);
    }
    if (upserts.length) ops.push({ kind: 'upsert', table: TABLES[key], rows: upserts });
    if (updates.length) ops.push({ kind: 'update', table: TABLES[key], rows: updates });
    if (old.size && !APPEND_ONLY.has(key)) ops.push({ kind: 'delete', table: TABLES[key], ids: [...old.keys()] });
  }
  if (prev.settings !== next.settings) {
    ops.push({ kind: 'upsert', table: SETTINGS_TABLE, rows: [{ id: SETTINGS_ID, data: next.settings }] });
  }
  return ops;
}

/** Postgres messages are written for people where we raise them ourselves (see schema.sql). */
function friendly(message: string): string {
  if (/row-level security/i.test(message)) return 'You do not have permission to make that change.';
  if (/sales_receipt_no_key/.test(message))
    return 'Another till took that receipt number a moment ago. Press complete again to use the next one.';
  if (/Failed to fetch|NetworkError/i.test(message))
    return 'No internet connection — the change was not saved. Check the connection and try again.';
  return message;
}

async function run(ops: Op[]): Promise<void> {
  const sb = requireSupabase();
  for (const op of ops) {
    if (op.kind === 'upsert') {
      for (let i = 0; i < op.rows.length; i += 500) {
        const { error } = await sb.from(op.table).upsert(op.rows.slice(i, i + 500));
        if (error) throw new Error(friendly(error.message));
      }
    } else if (op.kind === 'update') {
      for (const row of op.rows) {
        const { error } = await sb.from(op.table).update({ data: row.data }).eq('id', row.id);
        if (error) throw new Error(friendly(error.message));
      }
    } else {
      const { error } = await sb.from(op.table).delete().in('id', op.ids);
      if (error) throw new Error(friendly(error.message));
    }
  }
}

let chain: Promise<void> = Promise.resolve();
let last: Promise<void> = Promise.resolve();

let pending = 0;

/** Closing the tab mid-save would lose the change, so the browser asks first. */
function guardUnload(event: BeforeUnloadEvent): void {
  if (pending > 0) event.preventDefault();
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', guardUnload);

function enqueue(ops: Op[]): void {
  if (!ops.length) return;
  pending += 1;
  const p = chain.then(() => run(ops)).finally(() => {
    pending -= 1;
  });
  chain = p.catch(() => undefined);
  last = p;
  p.catch(async (error: unknown) => {
    console.error('[Aura] Save failed, reloading from the server.', error);
    // The local copy now holds a change the server refused: put it back.
    try {
      replaceDb(await loadAll());
    } catch (reloadError) {
      console.error('[Aura] Reload failed.', reloadError);
    }
  });
}

/** Resolves once every change made so far is saved; rejects with a readable message if one was refused. */
export function flush(): Promise<void> {
  return last;
}

let channel: RealtimeChannel | null = null;

function storeKeyFor(table: string): RowTable | null {
  const hit = (Object.keys(TABLES) as RowTable[]).find((k) => TABLES[k] === table);
  return hit ?? null;
}

function subscribe(): void {
  const sb = requireSupabase();
  channel = sb
    .channel('aura-db')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      const table = payload.table;
      if (table === SETTINGS_TABLE) {
        const data = (payload.new as Row | undefined)?.data as Settings | undefined;
        if (data && JSON.stringify(data) !== JSON.stringify(getDb().settings)) {
          applyRemote((db) => {
            db.settings = { ...defaultSettings, ...data };
          });
        }
        return;
      }
      const key = storeKeyFor(table);
      if (!key) return;

      if (payload.eventType === 'DELETE') {
        const id = (payload.old as Partial<Row>).id;
        if (!id) return;
        applyRemote((db) => {
          const rows = db[key] as Array<{ id: string }>;
          if (rows.some((r) => r.id === id)) {
            (db as unknown as Record<string, unknown[]>)[key] = rows.filter((r) => r.id !== id);
          }
        });
        return;
      }

      const raw = (payload.new as Row).data;
      const data = (key === 'enquiries' ? normaliseEnquiry(raw) : raw) as { id: string };
      applyRemote((db) => {
        const rows = db[key] as Array<{ id: string }>;
        const index = rows.findIndex((r) => r.id === data.id);
        if (index >= 0 && JSON.stringify(rows[index]) === JSON.stringify(data)) return; // our own echo
        const next = index >= 0 ? rows.map((r, i) => (i === index ? data : r)) : [...rows, data];
        (db as unknown as Record<string, unknown[]>)[key] = next;
      });
    })
    .subscribe();
}

/** Loads this account's data, then keeps it saved and live. */
export async function startSync(): Promise<void> {
  stopSync();
  replaceDb(await loadAll());
  setMutationListener((prev, next) => enqueue(diff(prev, next)));
  subscribe();
}

export function stopSync(): void {
  setMutationListener(null);
  if (channel) void requireSupabase().removeChannel(channel);
  channel = null;
  replaceDb(emptyDatabase());
}

/** First-run helper: writes a whole dataset (e.g. the starter catalogue) through the normal path. */
export function pushAll(prev: Database, next: Database): Promise<void> {
  enqueue(diff(prev, next));
  return flush();
}
