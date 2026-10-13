import { useEffect, useMemo, useRef, useState } from 'react';
import { Megaphone, MessageCircle, MessagesSquare, Phone, Plus, Send, Trash2 } from 'lucide-react';
import type { Announcement, ChatMessage } from '@/types';
import { formatDateTime, formatRelative } from '@/utils/date';
import { matches } from '@/utils/text';
import { openWhatsApp } from '@/utils/whatsapp';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useToast } from '@/hooks/useToast';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { useAuthStore } from '@/store/authStore';
import * as chat from '@/services/messageService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/States';

/** Customers write from the Aura app; staff reply here. */
export function MessagesPage(): JSX.Element {
  const db = useDb();
  const { shopId } = useShopScope();
  const actor = useAuthStore((s) => s.user);
  const isAdmin = actor?.role === 'admin';
  const [tab, setTab] = useState<'chats' | 'announcements'>('chats');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useMemo(() => chat.threads(shopId, db), [shopId, db]);
  const shown = list.filter((t) => !search || matches(`${t.customerName} ${t.customerPhone} ${t.lastText}`, search));
  const current = list.find((t) => t.id === openId) ?? null;
  const desk = (sid: string | null): string => (sid === null ? 'Head office' : db.shops.find((s) => s.id === sid)?.name ?? 'Branch');

  useEffect(() => {
    if (current && current.unread > 0) void chat.markRead(current.id);
  }, [current?.id, current?.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader title="Messages" description="Chats from the Aura app — head office (Concierge) and every branch desk." />
      {isAdmin && (
        <Tabs
          className="mb-4"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'chats', label: 'Customer chats', count: chat.unreadCount(shopId, db) || undefined },
            { value: 'announcements', label: 'App announcements', count: db.announcements.filter((a) => a.active).length || undefined },
          ]}
        />
      )}
      {tab === 'announcements' && isAdmin ? (
        <Announcements />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card flush className={current ? 'hidden lg:block' : ''}>
            <div className="border-b border-line p-3">
              <SearchBar value={search} onChange={setSearch} placeholder="Search customer or message" />
            </div>
            {shown.length === 0 ? (
              <EmptyState icon={<MessagesSquare />} title="No chats yet" description="When a customer messages from the app, the conversation opens here." />
            ) : (
              <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
                {shown.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(t.id)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas ${openId === t.id ? 'bg-canvas' : ''}`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                        {t.customerName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-ink">{t.customerName}</span>
                          <span className="shrink-0 text-[11px] text-subtle">{formatRelative(t.lastAt)}</span>
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {t.lastFrom === 'staff' ? 'You: ' : ''}
                          {t.lastText}
                        </span>
                        <span className="mt-1 flex gap-1.5">
                          {shopId === null && <Badge tone={t.shopId === null ? 'brand' : 'neutral'}>{desk(t.shopId)}</Badge>}
                          {t.unread > 0 && <Badge tone="danger">{t.unread} new</Badge>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {current ? <Conversation key={current.id} thread={current} desk={desk(current.shopId)} onBack={() => setOpenId(null)} /> : (
            <Card className="hidden lg:block">
              <EmptyState icon={<MessageCircle />} title="Pick a conversation" description="Replies reach the customer's phone in the app within seconds." />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

const QUICK = [
  'Your booking is confirmed. Please arrive 10 minutes early. 🌸',
  'Yes, that slot is available — you can book it in the app.',
  'Please share reference photos here and your artist will review them.',
  'Thank you! Our team will call you shortly.',
];

function Conversation({ thread, desk, onBack }: { thread: chat.Thread; desk: string; onBack: () => void }): JSX.Element {
  const actor = useAuthStore((s) => s.user);
  const toast = useToast();
  const db = useDb();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [thread.messages.length]);

  const send = async (body: string = text): Promise<void> => {
    if (!actor || !body.trim()) return;
    setBusy(true);
    try {
      await chat.reply(thread.id, body, actor);
      setText('');
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card flush className="flex min-h-[60vh] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <button type="button" className="text-sm text-muted lg:hidden" onClick={onBack}>
          ‹ Back
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{thread.customerName}</p>
          <p className="text-xs text-muted">
            {thread.customerPhone || 'no phone'} · {desk}
          </p>
        </div>
        {thread.customerPhone && (
          <>
            <a href={`tel:${thread.customerPhone}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink hover:bg-canvas">
              <Phone className="h-4 w-4" aria-hidden /> Call
            </a>
            <Button size="sm" variant="outline" leftIcon={<MessageCircle />} onClick={() => openWhatsApp(thread.customerPhone, `Assalam o Alaikum ${thread.customerName}! `)}>
              WhatsApp
            </Button>
          </>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-canvas/50 p-4" style={{ maxHeight: '55vh' }}>
        {thread.messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
        <div className="mb-2 flex gap-1.5 overflow-x-auto">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => void send(q)} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-muted hover:bg-canvas">
              {q.slice(0, 38)}…
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea aria-label="Reply" rows={2} className="flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply as ${actor?.name ?? 'staff'} (${db.settings.business.name})`} />
          <Button type="submit" loading={busy} leftIcon={<Send />}>
            Send
          </Button>
        </form>
      </div>
    </Card>
  );
}

function Bubble({ m }: { m: ChatMessage }): JSX.Element {
  const mine = m.from === 'staff';
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    if (m.imagePath) void chat.imageUrl(m.imagePath).then(setImg);
  }, [m.imagePath]);
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-surface text-ink'}`}>
        {!mine && <p className="text-[11px] font-semibold text-accent-ink">{m.authorName}</p>}
        {m.imagePath &&
          (img ? (
            <a href={img} target="_blank" rel="noreferrer">
              <img src={img} alt="Photo from the customer" className="my-1 max-h-60 rounded-xl" />
            </a>
          ) : (
            <p className="my-1 text-xs opacity-80">📷 Photo (visible when online)</p>
          ))}
        {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
        <p className={`mt-0.5 text-[10px] ${mine ? 'text-white/70' : 'text-subtle'}`}>
          {mine ? `${m.authorName} · ` : ''}
          {formatDateTime(m.at)}
          {mine && (m.readByCustomer ? ' · seen' : ' · sent')}
        </p>
      </div>
    </div>
  );
}

function Announcements(): JSX.Element {
  const db = useDb();
  const actor = useAuthStore((s) => s.user);
  const toast = useToast();
  const del = useDeleteAction();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [form, setForm] = useState({ title: '', body: '', imageUrl: '', active: true });
  const rows = [...db.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const open = (a: Announcement | 'new'): void => {
    setForm(a === 'new' ? { title: '', body: '', imageUrl: '', active: true } : { title: a.title, body: a.body, imageUrl: a.imageUrl ?? '', active: a.active });
    setEditing(a);
  };
  const save = async (): Promise<void> => {
    if (!actor || !editing) return;
    try {
      await chat.saveAnnouncement({ ...form, imageUrl: form.imageUrl.trim() || null }, editing === 'new' ? null : editing.id, actor);
      toast.success(editing === 'new' ? 'Posted to every app user.' : 'Announcement updated.');
      setEditing(null);
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button leftIcon={<Plus />} onClick={() => open('new')}>
          New announcement
        </Button>
      </div>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={<Megaphone />} title="No announcements" description="Offers, new services and bridal-season news show under “Aura Updates” in the app." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(a)}>
                  <span className="block font-medium text-ink">{a.title}</span>
                  <span className="block truncate text-xs text-muted">{a.body}</span>
                </button>
                <span className="text-xs text-subtle">{formatDateTime(a.createdAt)}</span>
                <Badge tone={a.active ? 'ok' : 'neutral'}>{a.active ? 'Live' : 'Hidden'}</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={() => void del({ title: 'Delete this announcement?', description: 'It disappears from the app for everyone.', run: () => chat.deleteAnnouncement(a.id), done: 'Announcement deleted.' })}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New announcement' : 'Edit announcement'}
        description="Every app user sees this under Aura Updates."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>{editing === 'new' ? 'Post' : 'Save'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label="Message" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <Input label="Picture link (optional)" placeholder="https://…" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Show in the app" />
        </div>
      </Modal>
    </>
  );
}

export default MessagesPage;
