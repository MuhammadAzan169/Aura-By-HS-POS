import type { MoneyMethod } from '@/types';
import { useState } from 'react';
import { MessageCircle, Star, Wallet, Smartphone } from 'lucide-react';
import type { Sale } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDateTime } from '@/utils/date';
import { openWhatsApp } from '@/utils/whatsapp';
import { RequestPaymentModal } from '@/features/payments/RequestPaymentModal';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthStore } from '@/store/authStore';
import * as saleService from '@/services/saleService';
import * as feedbackService from '@/services/feedbackService';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

/** The bill as a WhatsApp message: short, readable on a phone. */
export function billMessage(sale: Sale, shopName: string): string {
  const lines = [
    `*${shopName}* — Bill ${sale.receiptNo}`,
    formatDateTime(sale.soldAt),
    '',
    ...sale.items.map((i) => `• ${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''} — ${formatCurrency(i.lineTotal)}`),
    '',
    `Total: *${formatCurrency(sale.total)}*`,
  ];
  if ((sale.tip ?? 0) > 0) lines.push(`Tip: ${formatCurrency(sale.tip ?? 0)}`);
  if ((sale.balanceDue ?? 0) > 0) lines.push(`Balance due: *${formatCurrency(sale.balanceDue ?? 0)}*`);
  if ((sale.pointsEarned ?? 0) > 0) lines.push(`You earned ${sale.pointsEarned} loyalty points ✨`);
  lines.push('', 'Thank you for visiting us!');
  return lines.join('\n');
}

export function ReceiptExtras({ sale }: { sale: Sale }): JSX.Element {
  const db = useDb();
  const actor = useAuthStore((s) => s.user);
  const shop = db.shops.find((s) => s.id === sale.shopId);
  const customer = db.customers.find((c) => c.id === sale.customerId);
  const existingFeedback = db.feedback.find((f) => f.saleId === sale.id);

  const [collectOpen, setCollectOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<MoneyMethod>('cash');

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [comment, setComment] = useState('');

  const collect = useAsyncAction(
    async () => {
      if (!actor) throw new Error('Sign in first.');
      return saleService.collectBalance(sale.id, { method, amount: Number(amount), reference: null }, actor);
    },
    {
      successMessage: (s) =>
        (s.balanceDue ?? 0) > 0 ? `Received. ${formatCurrency(s.balanceDue ?? 0)} still due.` : 'Bill fully paid.',
      onSuccess: () => setCollectOpen(false),
    },
  );

  const saveFeedback = useAsyncAction(
    async () =>
      feedbackService.record({
        shopId: sale.shopId,
        customerId: sale.customerId,
        customerName: sale.customerName,
        saleId: sale.id,
        staffId: sale.staffId,
        rating,
        comment,
      }),
    { successMessage: 'Feedback saved. Thank you!', onSuccess: () => setFeedbackOpen(false) },
  );

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap justify-center gap-2">
        <Button
          variant="outline"
          leftIcon={<MessageCircle />}
          onClick={() => openWhatsApp(customer?.phone, billMessage(sale, shop?.name ?? db.settings.business.name))}
        >
          Send on WhatsApp
        </Button>
        {sale.status === 'completed' && (sale.balanceDue ?? 0) > 0 && (
          <Button
            leftIcon={<Wallet />}
            onClick={() => {
              setAmount(String(sale.balanceDue ?? 0));
              setCollectOpen(true);
            }}
          >
            Collect balance · {formatCurrency(sale.balanceDue ?? 0)}
          </Button>
        )}
        {sale.status === 'completed' && (sale.balanceDue ?? 0) > 0 && (
          <Button variant="outline" leftIcon={<Smartphone />} onClick={() => setLinkOpen(true)}>
            Online payment link
          </Button>
        )}
        <RequestPaymentModal open={linkOpen} onClose={() => setLinkOpen(false)} purpose="sale" refId={sale.id} phone={customer?.phone ?? ''} name={customer?.name ?? sale.customerName} />
        {sale.status === 'completed' && !existingFeedback && (
          <Button variant="outline" leftIcon={<Star />} onClick={() => setFeedbackOpen(true)}>
            Record feedback
          </Button>
        )}
        {existingFeedback && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-3 py-2 text-xs text-ink">
            Rated {'★'.repeat(existingFeedback.rating)}
            {existingFeedback.comment && ` — “${existingFeedback.comment}”`}
          </span>
        )}
      </div>

      <Modal
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        title="Collect balance"
        description={`${formatCurrency(sale.balanceDue ?? 0)} is still owed on ${sale.receiptNo}.`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCollectOpen(false)}>
              Cancel
            </Button>
            <Button loading={collect.pending} onClick={() => void collect.run()}>
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Amount received" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select
            label="Paid by"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' },
              { value: 'bank-transfer', label: 'Bank transfer' },
              { value: 'jazzcash', label: 'JazzCash' },
              { value: 'easypaisa', label: 'Easypaisa' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </div>
      </Modal>

      <Modal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        title="How was the visit?"
        description={`Feedback from ${sale.customerName}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setFeedbackOpen(false)}>
              Cancel
            </Button>
            <Button loading={saveFeedback.pending} onClick={() => void saveFeedback.run()}>
              Save feedback
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex justify-center gap-1" role="radiogroup" aria-label="Rating">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => setRating(n)}
                className={n <= rating ? 'text-3xl text-accent' : 'text-3xl text-line'}
              >
                ★
              </button>
            ))}
          </div>
          <Textarea label="Comment (optional)" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
