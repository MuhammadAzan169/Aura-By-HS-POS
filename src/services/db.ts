import type { Database } from '@/mock/seed';
import { getDb, mutateDb } from '@/store/dataStore';
import { isCloud } from './cloud/client';
import { flush } from './cloud/sync';

/**
 * Thin seam between the service layer and wherever the data actually lives.
 *
 * Today that is a Zustand store backed by localStorage. To move to Supabase,
 * the service modules change their bodies to issue queries — this file and the
 * mock store are what disappear, not the components above them.
 */

/** Simulated network latency in demo mode, so loading states are real and visible. */
const LATENCY_MS = isCloud ? 0 : 140;

export function delay<T>(value: T, ms: number = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function read(): Database {
  return getDb();
}

export function write(recipe: (db: Database) => void): void {
  mutateDb(recipe);
}

/** Read, mutate and resolve with a value, in one call. */
export async function commit<T>(recipe: (db: Database) => T): Promise<T> {
  let result!: T;
  write((db) => {
    result = recipe(db);
  });
  if (isCloud) {
    // Online, a write only counts once the database has accepted it.
    try {
      await flush();
    } catch (error) {
      throw new ServiceError(error instanceof Error ? error.message : 'The change was not saved.', 'conflict');
    }
    return result;
  }
  return delay(result);
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** Stamp fields common to every new record. */
export function stamped<T extends object>(row: T): T & { createdAt: string; updatedAt: string } {
  const at = nowISO();
  return { ...row, createdAt: at, updatedAt: at };
}

/** Raised by services when a write is rejected; the UI shows `message` verbatim. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not-found'
      | 'conflict'
      | 'validation'
      | 'forbidden'
      | 'insufficient-stock' = 'validation',
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new ServiceError(`${label} could not be found.`, 'not-found');
  return row;
}

/**
 * Enforces the tenant boundary. A shop user may only ever touch rows carrying
 * their own shopId; admins pass through.
 */
export function assertShopAccess(rowShopId: string, scopeShopId: string | null): void {
  if (scopeShopId !== null && rowShopId !== scopeShopId) {
    throw new ServiceError('You do not have access to this record.', 'forbidden');
  }
}

/** Narrow a table to a shop, or return it whole for an admin (`null` scope). */
export function scopeTo<T extends { shopId: string }>(rows: T[], shopId: string | null): T[] {
  return shopId === null ? rows : rows.filter((r) => r.shopId === shopId);
}
