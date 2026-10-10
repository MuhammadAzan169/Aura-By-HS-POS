import type { Session, User } from '@/types';
import { readJSON, removeKey, writeJSON } from '@/utils/storage';
import { delay, read, ServiceError, write } from './db';
import { isCloud, requireSupabase } from './cloud/client';
import { startSync, stopSync } from './cloud/sync';

/**
 * Mock authentication. This is the ONLY file that knows how a user is
 * identified — swapping in Supabase Auth means reimplementing these five
 * functions against `supabase.auth`, and nothing else in the app changes.
 *
 * Supabase equivalents, for whoever picks this up:
 *   login()          -> supabase.auth.signInWithPassword({ email, password })
 *   logout()         -> supabase.auth.signOut()
 *   getCurrentUser() -> supabase.auth.getUser() + a profiles row for role/shopId
 *   onAuthChange()   -> supabase.auth.onAuthStateChange()
 */

const SESSION_KEY = 'session';
const SESSION_HOURS = 12;

export interface LoginInput {
  email: string;
  password: string;
}

function makeSession(user: User): Session {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + SESSION_HOURS * 3600 * 1000);
  return {
    user,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

// ------------------------------------------------------------------ online

/** Email of the Supabase account currently signed in (online mode only). */
let cloudEmail: string | null = null;

/** Where Supabase sends people back to after Google or an emailed link. */
function returnUrl(path = '/login'): string {
  return `${window.location.origin}${path}`;
}

/**
 * Turns a Supabase session into an app user.
 *
 * Signing in only proves who someone is. Whether they get in is decided by a
 * profile row the owner created for that email — an uninvited Google account
 * is signed straight back out. On a brand-new project the first person to sign
 * in becomes the owner (see claim_owner in supabase/schema.sql).
 */
async function resolveCloudUser(): Promise<User | null> {
  const sb = requireSupabase();
  const { data } = await sb.auth.getSession();
  const account = data.session?.user;
  if (!account?.email) return null;
  const email = account.email.toLowerCase();

  const findProfile = async (): Promise<User | null> => {
    const { data: row, error } = await sb.from('profiles').select('data').eq('email', email).maybeSingle();
    if (error) throw new ServiceError(`Could not check your access: ${error.message}`, 'forbidden');
    return (row?.data as User | undefined) ?? null;
  };

  let profile = await findProfile();
  if (!profile) {
    const { data: needsOwner } = await sb.rpc('needs_owner');
    if (needsOwner === true) {
      const meta = account.user_metadata as { full_name?: string; name?: string } | undefined;
      await sb.rpc('claim_owner', { owner_name: meta?.full_name ?? meta?.name ?? 'Owner' });
      profile = await findProfile();
    }
  }

  if (!profile) {
    await sb.auth.signOut();
    throw new ServiceError(
      `${email} has not been given access. Ask the owner to add this email to a branch.`,
      'forbidden',
    );
  }
  if (!profile.active) {
    await sb.auth.signOut();
    throw new ServiceError('This account has been deactivated. Contact the owner.', 'forbidden');
  }

  cloudEmail = email;
  await startSync();
  const fresh = read().users.find((u) => u.id === profile.id) ?? profile;
  const loggedIn: User = { ...fresh, lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  write((current) => {
    current.users = current.users.some((u) => u.id === loggedIn.id)
      ? current.users.map((u) => (u.id === loggedIn.id ? loggedIn : u))
      : [...current.users, loggedIn];
  });
  return loggedIn;
}

/** Restores the signed-in user after a refresh or a Google redirect. */
export async function restoreSession(): Promise<User | null> {
  if (!isCloud) return getCurrentUser();
  return resolveCloudUser();
}

/** Opens Google's sign-in page; the browser comes back to /login signed in. */
export async function loginWithGoogle(): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: returnUrl('/login'), queryParams: { prompt: 'select_account' } },
  });
  if (error) throw new ServiceError(error.message, 'forbidden');
}

/** First-time password for an invited email. Supabase emails a confirmation link. */
export async function createPassword(email: string, password: string): Promise<string> {
  if (!isCloud) throw new ServiceError('Accounts can only be created when the database is connected.');
  if (password.length < 8) throw new ServiceError('Use at least 8 characters for the password.');
  const { error } = await requireSupabase().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: returnUrl('/login') },
  });
  if (error) throw new ServiceError(error.message);
  return `Check ${email} for a confirmation link, then sign in with this password.`;
}

/** Sets a new password for the signed-in account (after a reset link). */
export async function setNewPassword(password: string): Promise<void> {
  if (password.length < 8) throw new ServiceError('Use at least 8 characters for the password.');
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw new ServiceError(error.message);
}

export async function login({ email, password }: LoginInput): Promise<Session> {
  if (isCloud) {
    const { error } = await requireSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      throw new ServiceError(
        /confirm/i.test(error.message)
          ? 'Confirm your email first — open the link we sent you.'
          : 'That email and password combination is not recognised.',
        'forbidden',
      );
    }
    const user = await resolveCloudUser();
    if (!user) throw new ServiceError('Sign-in did not complete. Please try again.', 'forbidden');
    return makeSession(user);
  }

  // A touch of latency so the button's loading state is real.
  await delay(null, 320);

  const db = read();
  const normalized = email.trim().toLowerCase();
  const credential = db.credentials.find((c) => c.email.toLowerCase() === normalized);

  // Deliberately identical message for unknown email and wrong password.
  if (!credential || credential.password !== password) {
    throw new ServiceError('That email and password combination is not recognised.', 'forbidden');
  }

  const user = db.users.find((u) => u.id === credential.userId);
  if (!user) {
    throw new ServiceError('That email and password combination is not recognised.', 'forbidden');
  }
  if (!user.active) {
    throw new ServiceError('This account has been deactivated. Contact the owner.', 'forbidden');
  }

  const loggedIn: User = { ...user, lastLoginAt: new Date().toISOString() };
  write((current) => {
    current.users = current.users.map((u) => (u.id === user.id ? loggedIn : u));
  });

  const session = makeSession(loggedIn);
  writeJSON(SESSION_KEY, session);
  return session;
}

export async function logout(): Promise<void> {
  if (isCloud) {
    cloudEmail = null;
    stopSync();
    await requireSupabase().auth.signOut();
    return;
  }
  removeKey(SESSION_KEY);
  await delay(null, 120);
}

/** The stored session, or null when there is none or it has expired. */
export function getCurrentUser(): User | null {
  if (isCloud) {
    return cloudEmail ? (read().users.find((u) => u.email.toLowerCase() === cloudEmail) ?? null) : null;
  }
  const session = readJSON<Session | null>(SESSION_KEY, null);
  if (!session) return null;

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    removeKey(SESSION_KEY);
    return null;
  }

  // Re-read from the database so a role or shop change takes effect on reload.
  const fresh = read().users.find((u) => u.id === session.user.id);
  if (!fresh || !fresh.active) {
    removeKey(SESSION_KEY);
    return null;
  }
  return fresh;
}

export function getSession(): Session | null {
  const user = getCurrentUser();
  return user ? readJSON<Session | null>(SESSION_KEY, null) : null;
}

/** Emails the signed-in person a link to choose a new password. */
export async function changePassword(): Promise<string> {
  if (isCloud && cloudEmail) return sendPasswordReset(cloudEmail);
  await delay(null, 200);
  throw new ServiceError(
    'Password changes need the backend connected. This is a demo placeholder.',
    'forbidden',
  );
}

/** Emails a set-a-new-password link (online); a placeholder in demo mode. */
export async function sendPasswordReset(email: string): Promise<string> {
  if (isCloud) {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: returnUrl('/login?reset=1'),
    });
    if (error) throw new ServiceError(error.message);
    return `A link to set a new password has been emailed to ${email}.`;
  }
  await delay(null, 320);
  return `A reset link would be emailed to ${email} once the backend is connected.`;
}
