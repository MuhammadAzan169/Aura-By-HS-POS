import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, MessageCircle } from 'lucide-react';
import type { OnlinePayment, OnlinePlan, OnlinePurpose } from '@/types';
import { formatCurrency } from '@/utils/money';
import { openWhatsApp } from '@/utils/whatsapp';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import * as online from '@/services/onlinePaymentService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const PLAN_LABEL: Record<OnlinePlan, string> = {
  advance: 'Advance',
  full: 'Full amount',
  partial: 'Part payment',
  balance: 'Balance due',
  custom: 'Custom amount',
};

/**
 * Makes a payment link for a booking or bill and hands it to the customer on
 * WhatsApp. They pay with JazzCash, Easypaisa, card or bank transfer; the money
 * appears on the booking here by itself.
 */
export function RequestPaymentModal({
  open,
  onClose,
  purpose,
  refId,
  phone,
  name,
}: {
  open: boolean;
  onClose: () => void;
  purpose: Exclude<OnlinePurpose, 'voucher'>;
  refId: string;
  phone: string;
  name: string;
}): JSX.Element {
  const db = useDb();
  const actor = useAuthStore((s) => s.user);
  const toast = useToast();
  const cfg = online.onlineSettings(db);
  const owed = useMemo(() => {
    try {
      return online.owedOn(purpose, refId, db);
    } catch {
      return { total: 0, paid: 0, left: 0 };
    }
  }, [purpose, refId, db]);
  const plans: OnlinePlan[] = purpose === 'sale' ? ['balance', 'partial'] : owed.paid > 0 ? ['full', 'partial'] : ['advance', 'full', 'partial'];
  const [plan, setPlan] = useState<OnlinePlan>(plans[0] as OnlinePlan);
  const [amount, setAmount] = useState('');
  const [made, setMade] = useState<OnlinePayment | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPlan(plans[0] as OnlinePlan);
      setAmount('');
      setMade(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refId]);

  const preview = useMemo(() => {
    try {
      return online.planAmount(purpose, refId, plan, plan === 'partial' ? Number(amount) || null : null, db);
    } catch {
      return null;
    }
  }, [purpose, refId, plan, amount, db]);

  const link = made ? online.payUrl(made, db) : '';
  const message = made
    ? `Assalam o Alaikum ${name}! Here is your secure payment link from ${db.settings.business.name} for ${formatCurrency(made.amount)} (${made.refLabel}).\n\nPay with JazzCash, Easypaisa, card or bank transfer:\n${link}\n\nReference: ${made.paymentNo}`
    : '';

  const create = async (): Promise<void> => {
    if (!actor) return;
    setBusy(true);
    try {
      const p = await online.createLink({ purpose, refId, plan, amount: plan === 'partial' ? Number(amount) || null : null }, actor);
      setMade(p);
      toast.success('Payment link ready.');
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={made ? 'Send the payment link' : 'Request an online payment'}
      description={`${name} · paid ${formatCurrency(owed.paid)} of ${formatCurrency(owed.total)} · ${formatCurrency(owed.left)} left`}
      footer={
        made ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={busy} disabled={preview === null} onClick={() => void create()}>
              Create link{preview !== null ? ` · ${formatCurrency(preview)}` : ''}
            </Button>
          </>
        )
      }
    >
      {made ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-canvas p-3.5 text-sm">
            <p className="font-medium text-ink">{formatCurrency(made.amount)} · {made.paymentNo}</p>
            <p className="mt-1 break-all text-muted">{link}</p>
            {!cfg.apiUrl && (
              <p className="mt-2 text-xs text-warn">
                Add the payments API address in Settings → Online payments, then make the link again — this one has a placeholder address.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button leftIcon={<MessageCircle />} onClick={() => openWhatsApp(phone, message)}>
              Send on WhatsApp
            </Button>
            <Button
              variant="outline"
              leftIcon={<Copy />}
              onClick={() => {
                void navigator.clipboard?.writeText(message);
                toast.success('Message copied.');
              }}
            >
              Copy message
            </Button>
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium text-ink hover:bg-canvas">
              <ExternalLink className="h-4 w-4" aria-hidden /> Open
            </a>
          </div>
          <p className="text-xs text-muted">When the customer pays, it shows under Online payments and on this booking automatically. Bank transfers wait for you to check the receipt.</p>
        </div>
      ) : owed.left <= 0 ? (
        <p className="text-sm text-muted">Nothing is left to pay.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {plans.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm ${plan === p ? 'border-brand bg-brand/5 font-medium text-ink' : 'border-line text-muted hover:bg-canvas'}`}
              >
                {PLAN_LABEL[p]}
                <span className="block text-xs">
                  {p === 'advance'
                    ? `${purpose === 'bridal' ? cfg.bridalAdvancePct : cfg.advancePct}% to hold the booking`
                    : p === 'partial'
                      ? 'You choose the amount'
                      : formatCurrency(owed.left)}
                </span>
              </button>
            ))}
          </div>
          {plan === 'partial' && (
            <Input label="Amount" type="number" inputMode="numeric" min={1} max={owed.left} value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Up to ${formatCurrency(owed.left)}`} />
          )}
          <p className="text-xs text-muted">
            The customer can pay by {Object.entries(cfg.methods).filter(([, on]) => on).map(([m]) => online.METHOD_LABEL[m as keyof typeof online.METHOD_LABEL]).join(', ')}. The link works for 3 days.
          </p>
        </div>
      )}
    </Modal>
  );
}
