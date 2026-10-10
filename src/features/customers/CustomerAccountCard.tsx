import { useState } from 'react';
import { MessageCircle, PiggyBank, Star, Wallet } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { Customer } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDateTime } from '@/utils/date';
import { openWhatsApp } from '@/utils/whatsapp';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthStore } from '@/store/authStore';
import * as rewards from '@/services/rewardsService';
import { customerBalanceDue } from '@/services/saleService';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

/**
 * Money between the customer and the salon: advances held, loyalty points,
 * and anything still owed — with the actions to change them.
 */
export function CustomerAccountCard({ customer }: { customer: Customer }): JSX.Element {
  const db = useDb();
  const actor = useAuthStore((s) => s.user);
  const { pathname } = useLocation();
  const base = pathname.startsWith('/admin') ? '/admin' : '/shop';
  const advance = rewards.creditBalance(customer.id, db);
  const points = rewards.pointsBalance(customer.id, db);
  const loyalty = rewards.loyaltySettings(db);
  const due = customerBalanceDue(customer.id);
  const history = db.customerCredits.filter((c) => c.customerId === customer.id).slice(0, 8);

  const [mode, setMode] = useState<'advance' | 'return' | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'bank-transfer' | 'other'>('cash');
  const [note, setNote] = useState('');

  const save = useAsyncAction(
    async () => {
      if (!actor) throw new Error('Sign in first.');
      if (mode === 'advance') {
        await rewards.takeAdvance(
          { shopId: customer.shopId, customerId: customer.id, amount: Number(amount), method, appointmentId: null, note },
          actor,
        );
      } else {
        await rewards.refundAdvance(customer.id, customer.shopId, Number(amount), note, actor);
      }
    },
    { successMessage: mode === 'advance' ? 'Advance recorded.' : 'Advance returned.', onSuccess: () => setMode(null) },
  );

  const open = (m: 'advance' | 'return'): void => {
    setAmount(m === 'return' ? String(advance) : '');
    setNote('');
    setMethod('cash');
    setMode(m);
  };

  return (
    <Card>
      <CardHeader
        title="Account"
        description="Advances, loyalty points and balances owed."
        action={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<MessageCircle />}
            onClick={() => openWhatsApp(customer.phone, `Hi ${customer.name}, `)}
          >
            WhatsApp
          </Button>
        }
      />
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-ok-soft p-3">
          <PiggyBank className="mx-auto h-4 w-4 text-ok" aria-hidden />
          <dt className="mt-1 text-[11px] uppercase tracking-wide text-muted">Advance</dt>
          <dd className="font-display text-lg font-semibold tabular-nums text-ink">{formatCurrency(advance)}</dd>
        </div>
        <div className="rounded-xl bg-accent-soft p-3">
          <Star className="mx-auto h-4 w-4 text-accent" aria-hidden />
          <dt className="mt-1 text-[11px] uppercase tracking-wide text-muted">Points</dt>
          <dd className="font-display text-lg font-semibold tabular-nums text-ink">
            {loyalty.enabled ? points : 'Off'}
          </dd>
        </div>
        <div className={due > 0 ? 'rounded-xl bg-danger-soft p-3' : 'rounded-xl bg-canvas p-3'}>
          <Wallet className="mx-auto h-4 w-4 text-danger" aria-hidden />
          <dt className="mt-1 text-[11px] uppercase tracking-wide text-muted">Owes</dt>
          <dd className="font-display text-lg font-semibold tabular-nums text-ink">{formatCurrency(due)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" leftIcon={<PiggyBank />} onClick={() => open('advance')}>
          Take advance
        </Button>
        {advance > 0 && (
          <Button size="sm" variant="outline" onClick={() => open('return')}>
            Return advance
          </Button>
        )}
        {due > 0 && (
          <Link to={`${base}/billing/bills?status=unpaid`} className="self-center text-xs font-medium text-brand hover:underline">
            Collect what is owed →
          </Link>
        )}
      </div>

      {history.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs">
          {history.map((c) => (
            <li key={c.id} className="flex justify-between gap-2">
              <span className="text-muted">
                {formatDateTime(c.createdAt)} · {c.note || c.kind}
              </span>
              <span className={c.amount >= 0 ? 'tabular-nums text-ok' : 'tabular-nums text-danger'}>
                {c.amount >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(c.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'advance' ? `Advance from ${customer.name}` : 'Return advance'}
        description={
          mode === 'advance'
            ? 'e.g. a bridal booking deposit. It is used automatically when you choose "Use advance" at the till.'
            : `Give back unused advance money in cash. Holding ${formatCurrency(advance)}.`
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button loading={save.pending} onClick={() => void save.run()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          {mode === 'advance' && (
            <Select
              label="Paid by"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'card', label: 'Card' },
                { value: 'bank-transfer', label: 'Bank transfer' },
                { value: 'other', label: 'Other' },
              ]}
            />
          )}
          <Input label="Note" placeholder="e.g. Barat booking 12 Dec" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </Card>
  );
}
