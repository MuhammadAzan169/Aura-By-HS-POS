import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { BridalBooking, BridalEvent, BridalExtra, BridalStatus } from '@/types';
import { BRIDAL_EVENT_TYPES } from '@/types/bridal';
import { formatCurrency } from '@/utils/money';
import { uid } from '@/utils/id';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthStore } from '@/store/authStore';
import * as bridal from '@/services/bridalService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';

export interface BridalFormModalProps {
  open: boolean;
  onClose: () => void;
  shopId: string;
  booking?: BridalBooking | null;
  /** Prefill from an enquiry. */
  initialCustomerId?: string | null;
  onSaved?: (b: BridalBooking) => void;
}

export function BridalFormModal({ open, onClose, shopId, booking, initialCustomerId, onSaved }: BridalFormModalProps): JSX.Element {
  const db = useDb();
  const actor = useAuthStore((s) => s.user);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [packageId, setPackageId] = useState('');
  const [packageName, setPackageName] = useState('');
  const [packagePrice, setPackagePrice] = useState('0');
  const [extras, setExtras] = useState<BridalExtra[]>([]);
  const [travel, setTravel] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [advance, setAdvance] = useState('0');
  const [events, setEvents] = useState<BridalEvent[]>([]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<BridalStatus>('tentative');
  const [newCustomer, setNewCustomer] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCustomerId(booking?.customerId ?? initialCustomerId ?? null);
    setPackageId(booking?.packageId ?? '');
    setPackageName(booking?.packageName ?? '');
    setPackagePrice(String(booking?.packagePrice ?? 0));
    setExtras(booking?.extras ?? []);
    setTravel(String(booking?.travelCharge ?? 0));
    setDiscount(String(booking?.discount ?? 0));
    setAdvance(String(booking?.advanceRequired ?? 0));
    setEvents(booking?.events ?? [bridal.newEvent('Barat')]);
    setNotes(booking?.notes ?? '');
    setStatus(booking?.status === 'confirmed' ? 'confirmed' : 'tentative');
  }, [open, booking, initialCustomerId]);

  const artists = db.staff.filter((s) => s.shopId === shopId && s.active);
  const customers = db.customers.filter((c) => c.shopId === shopId && c.active);
  const total = bridal.computeTotal(Number(packagePrice) || 0, extras, Number(travel) || 0, Number(discount) || 0);

  const pickPackage = (id: string): void => {
    setPackageId(id);
    const p = db.packages.find((x) => x.id === id);
    if (p) {
      setPackageName(p.name);
      setPackagePrice(String(p.price));
      // A common rule in bridal salons: half to hold the dates.
      setAdvance(String(Math.round(p.price * 0.5)));
    }
  };

  const save = useAsyncAction(
    async () => {
      if (!actor) throw new Error('Sign in first.');
      if (!customerId) throw new Error('Pick the bride.');
      const input: bridal.BookingInput = {
        shopId,
        customerId,
        packageId: packageId || null,
        packageName,
        packagePrice: Number(packagePrice) || 0,
        extras,
        travelCharge: Number(travel) || 0,
        discount: Number(discount) || 0,
        events,
        advanceRequired: Number(advance) || 0,
        notes,
        status,
      };
      return booking ? bridal.update(booking.id, input, actor) : bridal.create(input, actor);
    },
    {
      successMessage: (b) => `${b.bookingNo} saved. The artists' calendars are updated.`,
      onSuccess: (b) => {
        onSaved?.(b);
        onClose();
      },
    },
  );

  const setEvent = (id: string, patch: Partial<BridalEvent>): void =>
    setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name, description: c.phone })),
    [customers],
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        dismissible={!save.pending}
        size="xl"
        title={booking ? `Edit ${booking.bookingNo}` : 'New bridal booking'}
        description="The package, every event of the wedding, and who is doing the make-up."
        footer={
          <>
            <span className="mr-auto font-display text-lg font-semibold text-ink">Total {formatCurrency(total)}</span>
            <Button variant="outline" onClick={onClose} disabled={save.pending}>
              Cancel
            </Button>
            <Button loading={save.pending} onClick={() => void save.run()}>
              Save booking
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <SearchableSelect
              label="Bride"
              required
              value={customerId}
              onChange={setCustomerId}
              options={customerOptions}
              placeholder="Search by name or phone"
              onCreate={(q) => setNewCustomer(q)}
              createLabel="Add new customer"
            />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as BridalStatus)}
              options={[
                { value: 'tentative', label: 'Tentative (dates not yet held)' },
                { value: 'confirmed', label: 'Confirmed' },
              ]}
            />
            <Select
              label="Package"
              value={packageId}
              onChange={(e) => pickPackage(e.target.value)}
              options={[{ value: '', label: 'Custom (no package)' }, ...db.packages.filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name} — ${formatCurrency(p.price)}` }))]}
            />
            <Input label="Booking name" placeholder="e.g. Bride Signature" value={packageName} onChange={(e) => setPackageName(e.target.value)} />
            <Input label="Package price" type="number" min={0} value={packagePrice} onChange={(e) => setPackagePrice(e.target.value)} />
            <Input label="Advance to hold the dates" type="number" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} hint="The booking becomes Confirmed once this much is paid." />
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink">Events</h3>
              <Button size="sm" variant="outline" leftIcon={<Plus />} onClick={() => setEvents([...events, bridal.newEvent('Mehndi')])}>
                Add event
              </Button>
            </div>
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} className="rounded-xl border border-line p-3">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Select label="Event" value={e.type} onChange={(x) => setEvent(e.id, { type: x.target.value as BridalEvent['type'] })} options={BRIDAL_EVENT_TYPES.map((t) => ({ value: t, label: t }))} />
                    <Input label="Date" type="date" value={e.date} onChange={(x) => setEvent(e.id, { date: x.target.value })} />
                    <Input label="Ready by" type="time" value={e.readyBy} onChange={(x) => setEvent(e.id, { readyBy: x.target.value })} />
                    <Input label="Artist time (min)" type="number" min={30} step={15} value={e.durationMin} onChange={(x) => setEvent(e.id, { durationMin: Number(x.target.value) })} />
                    <Select
                      label="Artist"
                      value={e.artistId ?? ''}
                      onChange={(x) => setEvent(e.id, { artistId: x.target.value || null })}
                      options={[{ value: '', label: 'Not assigned yet' }, ...artists.map((a) => ({ value: a.id, label: `${a.name} · ${a.role}` }))]}
                    />
                    <Select
                      label="Where"
                      value={e.location}
                      onChange={(x) => setEvent(e.id, { location: x.target.value as BridalEvent['location'] })}
                      options={[
                        { value: 'salon', label: 'At the salon' },
                        { value: 'on-location', label: 'On location (home / venue)' },
                      ]}
                    />
                    <Input label="Venue / address" value={e.venue} onChange={(x) => setEvent(e.id, { venue: x.target.value })} placeholder={e.location === 'salon' ? 'Optional' : 'Required'} />
                    <div className="flex items-end">
                      <Button variant="ghost" size="sm" leftIcon={<Trash2 />} disabled={events.length === 1} onClick={() => setEvents(events.filter((x) => x.id !== e.id))}>
                        Remove
                      </Button>
                    </div>
                  </div>
                  <Input className="mt-3" label="Look notes" placeholder="Outfit colour, jewellery, reference photos…" value={e.lookNotes} onChange={(x) => setEvent(e.id, { lookNotes: x.target.value })} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink">Extras</h3>
              <Button size="sm" variant="outline" leftIcon={<Plus />} onClick={() => setExtras([...extras, { id: uid('bex'), name: '', price: 0 }])}>
                Add extra
              </Button>
            </div>
            {extras.length === 0 && <p className="text-sm text-muted">e.g. extra family make-up, hair extensions, photography add-on.</p>}
            <div className="space-y-2">
              {extras.map((x) => (
                <div key={x.id} className="flex items-end gap-2">
                  <Input label="Extra" value={x.name} onChange={(e) => setExtras(extras.map((y) => (y.id === x.id ? { ...y, name: e.target.value } : y)))} />
                  <Input label="Price" type="number" min={0} value={x.price} onChange={(e) => setExtras(extras.map((y) => (y.id === x.id ? { ...y, price: Number(e.target.value) || 0 } : y)))} />
                  <Button variant="ghost" size="sm" leftIcon={<Trash2 />} onClick={() => setExtras(extras.filter((y) => y.id !== x.id))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <Input label="Travel / on-location charge" type="number" min={0} value={travel} onChange={(e) => setTravel(e.target.value)} />
            <Input label="Discount" type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
            <div className="flex items-end">
              <p className="w-full rounded-xl bg-canvas px-3.5 py-2.5 text-sm text-ink">
                Total <strong className="tabular-nums">{formatCurrency(total)}</strong>
              </p>
            </div>
          </section>

          <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Skin type, allergies, family members to get ready, special requests…" />
        </div>
      </Modal>

      <CustomerFormModal
        open={newCustomer !== null}
        onClose={() => setNewCustomer(null)}
        shopId={shopId}
        initialName={newCustomer ?? ''}
        onSaved={(c) => setCustomerId(c.id)}
      />
    </>
  );
}
