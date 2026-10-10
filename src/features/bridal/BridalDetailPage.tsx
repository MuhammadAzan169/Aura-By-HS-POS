import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Download, MessageCircle, Pencil, Receipt, Trash2, Wallet, XCircle } from 'lucide-react';
import type { BridalPayment } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDate, formatDateTime } from '@/utils/date';
import { openWhatsApp } from '@/utils/whatsapp';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import * as bridal from '@/services/bridalService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ErrorState } from '@/components/ui/States';
import { BridalFormModal } from './BridalFormModal';
import { STATUS_TONE } from './BridalPage';

export function BridalDetailPage(): JSX.Element {
  const { bookingId } = useParams<{ bookingId: string }>();
  const db = useDb();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/admin') ? '/admin' : '/shop';
  const actor = useAuthStore((s) => s.user);
  const confirm = useConfirm();
  const del = useDeleteAction();
  const toast = useToast();
  const b = db.bridalBookings.find((x) => x.id === bookingId);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState<BridalPayment['kind'] | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<BridalPayment['method']>('cash');
  const [note, setNote] = useState('');

  const pay = useAsyncAction(
    async () => {
      if (!b || !actor || !paying) throw new Error('Nothing to record.');
      return bridal.takePayment(b.id, { amount: Number(amount), method, kind: paying, note }, actor);
    },
    { successMessage: 'Payment recorded.', onSuccess: () => setPaying(null) },
  );
  const complete = useAsyncAction(
    async () => {
      if (!b || !actor) throw new Error('Not found.');
      return bridal.complete(b.id, actor);
    },
    { successMessage: 'Booking completed and billed. It now shows in sales and reports.' },
  );

  if (!b) {
    return (
      <Card>
        <ErrorState title="Booking not found" message="It may have been deleted." onRetry={() => navigate(`${base}/bridal`)} />
      </Card>
    );
  }

  const shop = db.shops.find((s) => s.id === b.shopId);
  const paid = bridal.paidOf(b);
  const balance = bridal.balanceOf(b);
  const locked = b.status === 'completed' || b.status === 'cancelled';

  const startPay = (kind: BridalPayment['kind']): void => {
    setAmount(kind === 'refund' ? String(paid) : String(kind === 'advance' ? Math.max(0, Math.min(balance, b.advanceRequired - paid)) || balance : balance));
    setMethod('cash');
    setNote('');
    setPaying(kind);
  };

  const whatsapp = (): void => {
    const lines = [
      `Assalam o Alaikum ${b.brideName}! 💐`,
      `Your bridal booking with ${db.settings.business.name} (${b.bookingNo}) is ${b.status === 'tentative' ? 'pencilled in' : 'confirmed'}.`,
      '',
      ...[...b.events].sort((x, y) => x.date.localeCompare(y.date)).map((e) => `• ${e.type}: ${e.date ? formatDate(e.date) : 'date TBC'}, ready by ${e.readyBy}${e.location === 'on-location' ? ` (${e.venue})` : ` at ${shop?.name ?? 'the salon'}`}`),
      '',
      `Package: ${b.packageName} — ${formatCurrency(b.total)}`,
      `Paid: ${formatCurrency(paid)} · Balance: ${formatCurrency(balance)}`,
      '',
      'Please arrive with clean skin and hair washed the day before. We can’t wait! ✨',
    ];
    openWhatsApp(b.phone, lines.join('\n'));
  };

  const onCancel = async (): Promise<void> => {
    if (!actor) return;
    const r = await confirm({
      title: `Cancel ${b.bookingNo}?`,
      description: 'The artists’ diary slots are released. Payments stay on record; refund them separately if needed.',
      confirmLabel: 'Cancel booking',
      tone: 'danger',
      requireReason: { label: 'Reason', placeholder: 'e.g. wedding postponed' },
    });
    if (!r.confirmed || !r.reason) return;
    try {
      await bridal.cancel(b.id, r.reason, actor);
      toast.success('Booking cancelled.');
    } catch (error) {
      toast.fromError(error);
    }
  };

  const onComplete = async (): Promise<void> => {
    const r = await confirm({
      title: 'Complete and bill this booking?',
      description: balance > 0 ? `${formatCurrency(balance)} is still owed — the bill will show it as a balance due.` : 'Everything is paid. The bill is created for the records.',
      confirmLabel: 'Complete booking',
    });
    if (r.confirmed) await complete.run();
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Bridal bookings', to: `${base}/bridal` }, { label: b.bookingNo }]}
        title={b.brideName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{b.bookingNo}</span> · {b.packageName}
            <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
          </span>
        }
        actions={
          <>
            <Button variant="outline" leftIcon={<MessageCircle />} onClick={whatsapp}>
              WhatsApp
            </Button>
            <Button
              variant="outline"
              leftIcon={<Download />}
              onClick={() => void import('./quotationPdf').then(({ downloadQuotation }) => downloadQuotation(b, shop, db.staff, db.settings))}
            >
              {b.status === 'tentative' ? 'Quotation PDF' : 'Confirmation PDF'}
            </Button>
            {!locked && (
              <Button variant="outline" leftIcon={<Pencil />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {!locked && (
              <Button leftIcon={<CheckCircle2 />} loading={complete.pending} onClick={() => void onComplete()}>
                Complete & bill
              </Button>
            )}
            {b.saleId && (
              <Link to={`${base}/billing/bills/${b.saleId}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-ink hover:bg-canvas">
                <Receipt className="h-4 w-4" aria-hidden /> View bill
              </Link>
            )}
          </>
        }
      />

      {b.status === 'cancelled' && b.cancelReason && (
        <p className="mb-4 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-ink">Cancelled: {b.cancelReason}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card flush>
          <div className="p-5">
            <CardHeader title="Events" description="Each event is in the artist's diary." />
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {[...b.events].sort((x, y) => x.date.localeCompare(y.date)).map((e) => {
              const artist = db.staff.find((s) => s.id === e.artistId);
              return (
                <li key={e.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                  <div className="w-28 shrink-0">
                    <p className="font-medium text-ink">{e.type}</p>
                    <p className="text-xs text-muted">{e.date ? formatDate(e.date) : 'Date TBC'}</p>
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-ink">
                      Ready by {e.readyBy} · {e.durationMin} min · {artist ? artist.name : <span className="text-danger">no artist yet</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {e.location === 'on-location' ? `On location — ${e.venue}` : `At ${shop?.name ?? 'the salon'}`}
                      {e.lookNotes && ` · ${e.lookNotes}`}
                    </p>
                  </div>
                  <Badge tone={e.status === 'done' ? 'ok' : e.status === 'cancelled' ? 'danger' : 'info'}>{e.status}</Badge>
                  {!locked && e.status === 'scheduled' && actor && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void bridal.setEventStatus(b.id, e.id, 'done', actor).then(() => toast.success(`${e.type} marked done.`), (err: unknown) => toast.fromError(err))
                      }
                    >
                      Mark done
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Money" />
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{b.packageName}</dt><dd className="tabular-nums">{formatCurrency(b.packagePrice)}</dd></div>
              {b.extras.map((x) => (
                <div key={x.id} className="flex justify-between"><dt className="text-muted">{x.name}</dt><dd className="tabular-nums">{formatCurrency(x.price)}</dd></div>
              ))}
              {b.travelCharge > 0 && <div className="flex justify-between"><dt className="text-muted">Travel</dt><dd className="tabular-nums">{formatCurrency(b.travelCharge)}</dd></div>}
              {b.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="tabular-nums text-ok">−{formatCurrency(b.discount)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(b.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="tabular-nums text-ok">{formatCurrency(paid)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Balance</dt><dd className={balance > 0 ? 'tabular-nums text-danger' : 'tabular-nums'}>{formatCurrency(balance)}</dd></div>
              {b.status === 'tentative' && (
                <p className="pt-1 text-xs text-warn">Advance of {formatCurrency(b.advanceRequired)} needed to confirm the dates.</p>
              )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {b.status !== 'cancelled' && b.status !== 'completed' && balance > 0 && (
                <Button size="sm" leftIcon={<Wallet />} onClick={() => startPay(paid === 0 ? 'advance' : 'instalment')}>
                  Take payment
                </Button>
              )}
              {paid > 0 && b.status !== 'completed' && (
                <Button size="sm" variant="outline" onClick={() => startPay('refund')}>
                  Refund
                </Button>
              )}
              {!locked && (
                <Button size="sm" variant="ghost" leftIcon={<XCircle />} onClick={() => void onCancel()}>
                  Cancel booking
                </Button>
              )}
              {b.payments.length === 0 && actor && (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Trash2 />}
                  onClick={() =>
                    void del({
                      title: `Delete ${b.bookingNo}?`,
                      description: 'For a booking made by mistake. Its diary entries are removed too.',
                      run: () => bridal.remove(b.id, actor),
                      done: 'Booking deleted.',
                      onDone: () => navigate(`${base}/bridal`),
                    })
                  }
                >
                  Delete
                </Button>
              )}
            </div>
            {b.payments.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs">
                {b.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="text-muted">
                      {formatDateTime(p.at)} · {p.kind} · {p.method}
                      {p.note && ` · ${p.note}`}
                    </span>
                    <span className={p.kind === 'refund' ? 'tabular-nums text-danger' : 'tabular-nums text-ok'}>
                      {p.kind === 'refund' ? '−' : '+'}
                      {formatCurrency(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {b.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{b.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <BridalFormModal open={editing} onClose={() => setEditing(false)} shopId={b.shopId} booking={b} />

      <Modal
        open={paying !== null}
        onClose={() => setPaying(null)}
        title={paying === 'refund' ? 'Refund to the bride' : paying === 'advance' ? 'Take advance' : 'Take payment'}
        description={`Balance ${formatCurrency(balance)} · paid ${formatCurrency(paid)}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button loading={pay.pending} onClick={() => void pay.run()}>
              Record
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {paying !== 'refund' && (
            <Select
              label="Type"
              value={paying ?? 'instalment'}
              onChange={(e) => setPaying(e.target.value as BridalPayment['kind'])}
              options={[
                { value: 'advance', label: 'Advance' },
                { value: 'instalment', label: 'Instalment' },
                { value: 'final', label: 'Final payment' },
              ]}
            />
          )}
          <Input label="Amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select
            label={paying === 'refund' ? 'Refunded by' : 'Paid by'}
            value={method}
            onChange={(e) => setMethod(e.target.value as BridalPayment['method'])}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' },
              { value: 'bank-transfer', label: 'Bank transfer' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}

export default BridalDetailPage;
