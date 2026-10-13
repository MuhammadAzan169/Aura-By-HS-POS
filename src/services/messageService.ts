import type { Announcement, ChatMessage, User } from '@/types';
import type { Database } from '@/mock/seed';
import { uid } from '@/utils/id';
import { commit, nowISO, read, requireRow, ServiceError, stamped } from './db';
import { isCloud, supabase } from './cloud/client';

/**
 * Chats with app customers. A thread is one customer and one desk: head office
 * (the "Aura Concierge", owner only) or a branch. Customers write from the app
 * through the API; staff answer here, and the app shows the reply within seconds.
 */

export interface Thread {
  id: string;
  shopId: string | null;
  accountId: string;
  customerName: string;
  customerPhone: string;
  lastText: string;
  lastAt: string;
  lastFrom: ChatMessage['from'];
  unread: number;
  messages: ChatMessage[];
}

/** Threads this login may see, newest first. Admin sees every desk; a branch its own. */
export function threads(shopId: string | null, db: Database = read()): Thread[] {
  const map = new Map<string, ChatMessage[]>();
  for (const m of db.messages) {
    if (shopId !== null && m.shopId !== shopId) continue;
    const list = map.get(m.threadId) ?? [];
    list.push(m);
    map.set(m.threadId, list);
  }
  const out: Thread[] = [];
  for (const [id, list] of map) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    const last = list[list.length - 1] as ChatMessage;
    const firstCustomer = list.find((m) => m.from === 'customer') ?? last;
    out.push({
      id,
      shopId: last.shopId,
      accountId: last.accountId,
      customerName: firstCustomer.customerName,
      customerPhone: firstCustomer.customerPhone,
      lastText: last.text || (last.imagePath ? '📷 Photo' : ''),
      lastAt: last.at,
      lastFrom: last.from,
      unread: list.filter((m) => m.from === 'customer' && !m.readByStaff).length,
      messages: list,
    });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function unreadCount(shopId: string | null, db: Database = read()): number {
  return db.messages.filter((m) => m.from === 'customer' && !m.readByStaff && (shopId === null || m.shopId === shopId)).length;
}

export async function reply(threadId: string, text: string, actor: User): Promise<ChatMessage> {
  const body = text.trim();
  if (!body) throw new ServiceError('Type a reply first.', 'validation');
  if (body.length > 2000) throw new ServiceError('Keep the reply under 2,000 characters.', 'validation');
  const db = read();
  const first = requireRow(db.messages.find((m) => m.threadId === threadId), 'That conversation');
  if (actor.role === 'shop' && first.shopId !== actor.shopId) throw new ServiceError('This conversation belongs to another desk.', 'forbidden');
  const at = nowISO();
  const row: ChatMessage = stamped({
    id: uid('msg'),
    threadId,
    shopId: first.shopId,
    accountId: first.accountId,
    customerName: first.customerName,
    customerPhone: first.customerPhone,
    from: 'staff' as const,
    authorName: actor.name,
    text: body,
    imagePath: null,
    at,
    readByStaff: true,
    readByCustomer: false,
  });
  return commit((d) => {
    d.messages = [
      ...d.messages.map((m) => (m.threadId === threadId && m.from === 'customer' && !m.readByStaff ? { ...m, readByStaff: true, updatedAt: at } : m)),
      row,
    ];
    return row;
  });
}

export async function markRead(threadId: string): Promise<void> {
  const db = read();
  if (!db.messages.some((m) => m.threadId === threadId && m.from === 'customer' && !m.readByStaff)) return;
  const at = nowISO();
  await commit((d) => {
    d.messages = d.messages.map((m) => (m.threadId === threadId && m.from === 'customer' && !m.readByStaff ? { ...m, readByStaff: true, updatedAt: at } : m));
  });
}

export async function imageUrl(path: string | null): Promise<string | null> {
  if (!path || !isCloud || !supabase) return null;
  const { data } = await supabase.storage.from('chat-images').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

// ------------------------------------------------------------ announcements

export async function saveAnnouncement(input: Pick<Announcement, 'title' | 'body' | 'imageUrl' | 'active'>, id: string | null, actor: User): Promise<Announcement> {
  if (actor.role !== 'admin') throw new ServiceError('Only the owner posts announcements.', 'forbidden');
  if (!input.title.trim()) throw new ServiceError('Give the announcement a title.', 'validation');
  if (input.body.length > 1000) throw new ServiceError('Keep it under 1,000 characters.', 'validation');
  return commit((db) => {
    if (id) {
      const existing = requireRow(db.announcements.find((a) => a.id === id), 'That announcement');
      const next = { ...existing, ...input, title: input.title.trim(), body: input.body.trim(), updatedAt: nowISO() };
      db.announcements = db.announcements.map((a) => (a.id === id ? next : a));
      return next;
    }
    const row: Announcement = stamped({ id: uid('ann'), ...input, title: input.title.trim(), body: input.body.trim(), byUserName: actor.name });
    db.announcements = [row, ...db.announcements];
    return row;
  });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await commit((db) => {
    db.announcements = db.announcements.filter((a) => a.id !== id);
  });
}
