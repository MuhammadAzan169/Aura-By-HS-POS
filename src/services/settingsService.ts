import type { AppointmentRules, BillingSettings, BusinessProfile, LoyaltySettings, NotificationType, Settings } from '@/types';
import { configureCurrency } from '@/utils/money';
import { commit, delay, nowISO, read } from './db';

export async function get(): Promise<Settings> {
  return delay(read().settings);
}

export function getSync(): Settings {
  return read().settings;
}

/** Keeps `formatCurrency` in step with whatever the owner chose. */
export function applyCurrency(settings: Settings = read().settings): void {
  configureCurrency({
    currencyCode: settings.billing.currencyCode,
    locale: settings.billing.locale,
    symbol: settings.billing.currency,
  });
}

export async function updateBusiness(input: BusinessProfile): Promise<Settings> {
  return commit((db) => {
    db.settings = { ...db.settings, business: input, updatedAt: nowISO() };
    return db.settings;
  });
}

export async function updateAppointmentRules(input: AppointmentRules): Promise<Settings> {
  return commit((db) => {
    db.settings = { ...db.settings, appointments: input, updatedAt: nowISO() };
    return db.settings;
  });
}

export async function updateBilling(input: BillingSettings): Promise<Settings> {
  const next = await commit((db) => {
    db.settings = { ...db.settings, billing: input, updatedAt: nowISO() };
    return db.settings;
  });
  applyCurrency(next);
  return next;
}

export async function updateNotificationPrefs(
  prefs: Record<NotificationType, boolean>,
): Promise<Settings> {
  return commit((db) => {
    db.settings = { ...db.settings, notifications: prefs, updatedAt: nowISO() };
    return db.settings;
  });
}

/**
 * Reads a chosen image into a data URL so the logo survives a refresh without
 * a file server. Real uploads belong in Supabase Storage.
 */
export function readImageAsDataUrl(file: File, maxBytes = 512_000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choose an image file (PNG, JPG or SVG).'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error(`That image is too large. Keep it under ${Math.round(maxBytes / 1024)} KB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

export async function updateLoyalty(input: LoyaltySettings): Promise<Settings> {
  return commit((db) => {
    db.settings = { ...db.settings, loyalty: input, updatedAt: nowISO() };
    return db.settings;
  });
}
