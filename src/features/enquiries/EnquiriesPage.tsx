import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarPlus, Crown, Inbox, MessageCircle, Phone, Plus, Trash2 } from 'lucide-react';
import type { Enquiry, EnquirySource, EnquiryStatus } from '@/types';
import { formatDate, formatDateTime, toISODate } from '@/utils/date';
import { matches } from '@/utils/text';
import { openWhatsApp } from '@/utils/whatsapp';
import { downloadExcel } from '@/utils/excel';
import { timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import * as enquiries from '@/services/enquiryService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/States';
import { BridalFormModal } from '@/features/bridal/BridalFormModal';

const TONE: Record<EnquiryStatus, 'brand' | 'info' | 'ok' | 'neutral'> = { new: 'brand', contacted: 'info', booked: 'ok', lost: 'neutral' };
const SOURCES: EnquirySource[] = ['website', 'instagram', 'facebook', 'whatsapp', 'phone', 'walk-in', 'referral'];

export function EnquiriesPage(): JSX.Element {
  const db = useDb();
  const { shopId } = useShopScope();
  const actor = useAuthStore((s) => s.user);
  const toast = useToast();
  const del = useDeleteAction();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/admin') ? '/admin' : '/shop';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | EnquiryStatus | 'due'>('');
  const [source, setSource] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Enquiry | null>(null);
  const [note, setNote] = useState('');
  const [bookFor, setBookFor] = useState<{ enquiry: Enquiry; customerId: string; shopId: string } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', interest: '', preferredDate: '', message: '', source: 'phone' as EnquirySource, followUpOn: '' });
  const today = toISODate(new Date());

  const scoped = db.enquiries.filter((e) => shopId === null || e.shopId === shopId || e.shopId === null);
  const rows = useMemo(
    () =>
      scoped
        .filter((e) => (status === 'due' ? e.followUpOn !== null && e.followUpOn <= today && e.status !== 'booked' && e.status !== 'lost' : !status || e.status === status))
        .filter((e) => !source || e.source === source)
        .filter((e) => !search || matches(`${e.name} ${e.phone} ${e.interest} ${e.message}`, search))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [scoped, status, source, search, today],
  );
  const current = open ? db.enquiries.find((e) => e.id === open.id) ?? null : null;

  const create = useAsyncAction(
    async () =>
      enquiries.create({ ...form, shopId, preferredDate: form.preferredDate || null, followUpOn: form.followUpOn || null }),
    { successMessage: 'Enquiry added.', onSuccess: () => setAdding(false) },
  );

  const act = async (fn: () => Promise<unknown>, ok: string): Promise<void> => {
    try {
      await fn();
      toast.success(ok);
    } catch (error) {
      toast.fromError(error);
    }
  };

  const branchFor = (e: Enquiry): string | null => e.shopId ?? shopId ?? db.shops[0]?.id ?? null;

  const makeCustomer = async (e: Enquiry, then?: 'booking' | 'appointment'): Promise<void> => {
    const sid = branchFor(e);
    if (!sid) {
      toast.error('Pick a branch first.');
      return;
    }
    try {
      const customerId = await enquiries.toCustomer(e.id, sid);
      if (then === 'booking') setBookFor({ enquiry: e, customerId, shopId: sid });
      else if (then === 'appointment') navigate(`${base}/appointments?new=1&customer=${customerId}`);
      else toast.success(`${e.name} added to customers.`);
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Every request from the website, Instagram, WhatsApp and the phone — followed up until it books."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                void downloadExcel(
                  rows,
                  [
                    { header: 'Received', value: (e) => formatDateTime(e.createdAt) },
                    { header: 'Name', value: (e) => e.name },
                    { header: 'Phone', value: (e) => e.phone },
                    { header: 'Interested in', value: (e) => e.interest },
                    { header: 'Wanted on', value: (e) => e.preferredDate ?? '' },
                    { header: 'Source', value: (e) => e.source },
                    { header: 'Status', value: (e) => e.status },
                    { header: 'Notes', value: (e) => e.notes },
                  ],
                  timestampedName('enquiries'),
                )
              }
            >
              Export
            </Button>
            <Button
              leftIcon={<Plus />}
              onClick={() => {
                setForm({ name: '', phone: '', email: '', interest: '', preferredDate: '', message: '', source: 'phone', followUpOn: '' });
                setAdding(true);
              }}
            >
              New enquiry
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-4">
        <StatCard label="New" value={scoped.filter((e) => e.status === 'new').length} icon={<Inbox />} />
        <StatCard label="Follow-ups due" value={scoped.filter((e) => e.followUpOn && e.followUpOn <= today && e.status !== 'booked' && e.status !== 'lost').length} />
        <StatCard label="Booked" value={scoped.filter((e) => e.status === 'booked').length} />
        <StatCard
          label="Conversion"
          value={`${scoped.length ? Math.round((scoped.filter((e) => e.status === 'booked').length / scoped.length) * 100) : 0}%`}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Search name, phone or interest" />
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          options={[
            { value: '', label: 'Any status' },
            { value: 'new', label: 'New' },
            { value: 'contacted', label: 'Contacted' },
            { value: 'due', label: 'Follow-up due' },
            { value: 'booked', label: 'Booked' },
            { value: 'lost', label: 'Lost' },
          ]}
        />
        <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} options={[{ value: '', label: 'Any source' }, ...SOURCES.map((s) => ({ value: s, label: s }))]} />
      </div>

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox />} title="No enquiries" description="Website requests arrive here automatically once the site is connected (see docs/WEBSITE.md)." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    setNote('');
                    setOpen(e);
                  }}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left hover:bg-canvas"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{e.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {e.phone} · {e.interest || 'General'}
                      {e.preferredDate && ` · wants ${formatDate(e.preferredDate)}`}
                    </span>
                  </span>
                  <span className="text-xs text-subtle">{e.source} · {formatDateTime(e.createdAt)}</span>
                  {e.followUpOn && e.status !== 'booked' && e.status !== 'lost' && (
                    <Badge tone={e.followUpOn <= today ? 'danger' : 'neutral'}>follow up {formatDate(e.followUpOn)}</Badge>
                  )}
                  <Badge tone={TONE[e.status]}>{e.status}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="New enquiry"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button loading={create.pending} onClick={() => void create.run()}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Interested in" placeholder="e.g. Bride Signature package" value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} />
          <Select label="Came from" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as EnquirySource })} options={SOURCES.map((s) => ({ value: s, label: s }))} />
          <Input label="Wanted on" type="date" value={form.preferredDate} onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} />
          <Input label="Follow up on" type="date" value={form.followUpOn} onChange={(e) => setForm({ ...form, followUpOn: e.target.value })} />
          <div className="sm:col-span-2">
            <Textarea label="Message" rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
        </div>
      </Modal>

      <Modal
        open={current !== null}
        onClose={() => setOpen(null)}
        title={current?.name ?? ''}
        description={current ? `${current.phone}${current.email ? ` · ${current.email}` : ''} · via ${current.source}` : undefined}
        size="md"
        footer={<Button onClick={() => setOpen(null)}>Close</Button>}
      >
        {current && (
          <div className="space-y-4">
            <dl className="space-y-1 rounded-xl bg-canvas p-3.5 text-sm">
              <div><dt className="inline text-muted">Interested in: </dt><dd className="inline text-ink">{current.interest || '—'}</dd></div>
              <div><dt className="inline text-muted">Wanted on: </dt><dd className="inline text-ink">{current.preferredDate ? formatDate(current.preferredDate) : '—'}</dd></div>
              {current.message && <p className="pt-1 text-ink">“{current.message}”</p>}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" leftIcon={<MessageCircle />} onClick={() => openWhatsApp(current.phone, `Assalam o Alaikum ${current.name}! Thank you for your enquiry with ${db.settings.business.name} about ${current.interest || 'our services'}. `)}>
                WhatsApp
              </Button>
              <a href={`tel:${current.phone}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink hover:bg-canvas">
                <Phone className="h-4 w-4" aria-hidden /> Call
              </a>
              <Button size="sm" leftIcon={<Crown />} onClick={() => void makeCustomer(current, 'booking')}>
                Bridal booking
              </Button>
              <Button size="sm" variant="outline" leftIcon={<CalendarPlus />} onClick={() => void makeCustomer(current, 'appointment')}>
                Appointment
              </Button>
              {!current.customerId && (
                <Button size="sm" variant="ghost" onClick={() => void makeCustomer(current)}>
                  Save as customer
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Status"
                value={current.status}
                onChange={(e) => void act(() => enquiries.update(current.id, { status: e.target.value as EnquiryStatus }), 'Status updated.')}
                options={[
                  { value: 'new', label: 'New' },
                  { value: 'contacted', label: 'Contacted' },
                  { value: 'booked', label: 'Booked' },
                  { value: 'lost', label: 'Lost' },
                ]}
              />
              <Input
                label="Follow up on"
                type="date"
                value={current.followUpOn ?? ''}
                onChange={(e) => void act(() => enquiries.update(current.id, { followUpOn: e.target.value || null }), 'Follow-up date set.')}
              />
              {actor?.role === 'admin' && (
                <Select
                  label="Branch"
                  value={current.shopId ?? ''}
                  onChange={(e) => void act(() => enquiries.update(current.id, { shopId: e.target.value || null }), 'Branch set.')}
                  options={[{ value: '', label: 'Not assigned' }, ...db.shops.map((s) => ({ value: s.id, label: s.name }))]}
                />
              )}
            </div>
            <div className="flex items-end gap-2">
              <Input label="Add a note" placeholder="Called, sent package prices, will confirm Friday…" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="outline" disabled={!note.trim()} onClick={() => void act(() => enquiries.addNote(current.id, note, actor?.name ?? ''), 'Note added.').then(() => setNote(''))}>
                Add
              </Button>
            </div>
            {current.notes && <pre className="whitespace-pre-wrap rounded-xl border border-line p-3 font-sans text-xs text-muted">{current.notes}</pre>}
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Trash2 />}
              onClick={() => void del({ title: `Delete ${current.name}'s enquiry?`, run: () => enquiries.remove(current.id), done: 'Enquiry deleted.', onDone: () => setOpen(null) })}
            >
              Delete enquiry
            </Button>
          </div>
        )}
      </Modal>

      {bookFor && (
        <BridalFormModal
          open
          onClose={() => setBookFor(null)}
          shopId={bookFor.shopId}
          initialCustomerId={bookFor.customerId}
          onSaved={(b) => {
            void enquiries.update(bookFor.enquiry.id, { status: 'booked', bookingId: b.id });
            setOpen(null);
            navigate(`${base}/bridal/${b.id}`);
          }}
        />
      )}
    </>
  );
}

export default EnquiriesPage;
