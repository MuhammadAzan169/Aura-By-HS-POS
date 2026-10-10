import type { User } from '@/types';
import { uid } from '@/utils/id';
import { commit, nowISO, read, requireRow, ServiceError, stamped } from './db';
import { isCloud, requireSupabase } from './cloud/client';

/**
 * Logins are the owner's to give out. Branch staff never sign themselves up
 * and cannot change their own password — the owner creates each login with a
 * username and password, and is the only one who can reset or remove it.
 */

/** Never receives mail; accounts here are created already confirmed. */
export const LOGIN_DOMAIN = 'staff.aurabyhs.pk';

/** "gulberg" → gulberg@staff.aurabyhs.pk; a real email address is kept as typed. */
export function loginEmail(id: string): string {
  const v = id.trim().toLowerCase();
  if (v.includes('@')) return v;
  return `${v.replace(/[^a-z0-9._-]/g, '')}@${LOGIN_DOMAIN}`;
}

/** What to show for a login: the username, or the email when it is a real one. */
export function loginLabel(email: string): string {
  const e = email.toLowerCase();
  return e.endsWith(`@${LOGIN_DOMAIN}`) ? e.split('@')[0] ?? e : e;
}

function checkUsername(id: string): void {
  const v = id.trim();
  if (!v) throw new ServiceError('Enter a username for the login.', 'validation');
  if (!v.includes('@') && !/^[a-zA-Z0-9._-]{3,30}$/.test(v)) {
    throw new ServiceError('Usernames are 3–30 letters or numbers (dots and dashes allowed), no spaces.', 'validation');
  }
}

function checkPassword(password: string): void {
  if (password.length < 6) throw new ServiceError('Use a password of at least 6 characters.', 'validation');
}

/** Sets (or creates) the password behind a login. Owner only. */
export async function setPassword(email: string, password: string): Promise<void> {
  checkPassword(password);
  if (isCloud) {
    const { error } = await requireSupabase().rpc('admin_set_login', { p_email: email, p_password: password });
    if (error) throw new ServiceError(error.message, 'forbidden');
    return;
  }
  await commit((db) => {
    const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new ServiceError('That login could not be found.', 'not-found');
    db.credentials = [
      ...db.credentials.filter((c) => c.email.toLowerCase() !== email.toLowerCase()),
      { userId: user.id, email: user.email, password },
    ];
  });
}

export interface NewLoginInput {
  name: string;
  username: string;
  password: string;
  shopId: string;
  phone: string;
}

/** A new branch login: the profile that grants access, then the password. */
export async function createLogin(input: NewLoginInput): Promise<User> {
  checkUsername(input.username);
  checkPassword(input.password);
  if (!input.name.trim()) throw new ServiceError('Enter the person’s name.', 'validation');
  const email = loginEmail(input.username);
  if (read().users.some((u) => u.email.toLowerCase() === email)) {
    throw new ServiceError(`The username "${loginLabel(email)}" is already taken.`, 'conflict');
  }
  const user: User = stamped({
    id: uid('usr'),
    email,
    name: input.name.trim(),
    role: 'shop' as const,
    shopId: input.shopId,
    avatarUrl: null,
    phone: input.phone.trim() || null,
    active: true,
    lastLoginAt: null,
  });
  await commit((db) => {
    db.users = [...db.users, user];
  });
  // The profile must exist first: it is what marks the login as a branch one.
  await setPassword(email, input.password);
  return user;
}

export async function updateLogin(id: string, patch: Partial<Pick<User, 'name' | 'phone' | 'shopId' | 'active'>>): Promise<User> {
  const existing = requireRow(read().users.find((u) => u.id === id), 'That login');
  if (existing.role === 'admin' && patch.active === false) {
    throw new ServiceError('The owner account cannot be switched off.', 'forbidden');
  }
  return commit((db) => {
    const next = { ...existing, ...patch, updatedAt: nowISO() };
    db.users = db.users.map((u) => (u.id === id ? next : u));
    return next;
  });
}

/** Removes the login and its access. Bills keep the name they were made under. */
export async function deleteLogin(id: string): Promise<void> {
  const existing = requireRow(read().users.find((u) => u.id === id), 'That login');
  if (existing.role === 'admin') throw new ServiceError('The owner account cannot be deleted.', 'forbidden');
  if (isCloud) {
    const { error } = await requireSupabase().rpc('admin_delete_login', { p_email: existing.email });
    if (error) throw new ServiceError(error.message, 'forbidden');
  }
  await commit((db) => {
    db.users = db.users.filter((u) => u.id !== id);
    db.credentials = db.credentials.filter((c) => c.userId !== id);
  });
}
