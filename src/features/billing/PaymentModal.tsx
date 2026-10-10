import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CreditCard,
  Gift,
  Landmark,
  MoreHorizontal,
  PiggyBank,
  Split,
  Star,
  TicketPercent,
} from 'lucide-react';
import type { Payment, PaymentMethod, Sale } from '@/types';
import { cn } from '@/utils/cn';
import { formatCurrency, round2 } from '@/utils/money';
import { uid } from '@/utils/id';
import { useDb } from '@/hooks/useDb';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { calculateBill, paidTotal } from '@/services/pricing';
import * as saleService from '@/services/saleService';
import {
  creditBalance,
  findVoucher,
  loyaltySettings,
  pointsBalance,
  validateCoupon,
} from '@/services/rewardsService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Textarea } from '@/components/ui/Textarea';

const METHODS: { value: PaymentMethod; label: string; icon: JSX.Element }[] = [
  { value: 'cash', label: 'Cash', icon: <Banknote /> },
  { value: 'card', label: 'Card', icon: <CreditCard /> },
  { value: 'bank-transfer', label: 'Bank transfer', icon: <Landmark /> },
  { value: 'other', label: 'Other', icon: <MoreHorizontal /> },
];

const LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  'bank-transfer': 'Bank transfer',
  other: 'Other',
  voucher: 'Gift voucher',
  points: 'Loyalty points',
  wallet: 'Advance on account',
};

/** Common note denominations, so cash can be taken in two taps. */
const QUICK_CASH = [500, 1000, 2000, 5000];

export interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  shopId: string;
  onComplete: (sale: Sale) => void;
}

export function PaymentModal({
  open,
  onClose,
  shopId,
  onComplete,
}: PaymentModalProps): JSX.Element {
  const db = useDb();
  const cart = useCartStore();
  const actor = useAuthStore((s) => s.user);

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<Payment[]>([]);
  const [splitAmount, setSplitAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; mode: 'percent' | 'amount'; value: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [tip, setTip] = useState('');
  const [tipStaffId, setTipStaffId] = useState<string>('');
  const [payLater, setPayLater] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [tenderError, setTenderError] = useState<string | null>(null);

  const customerId = cart.customer.id;
  const loyalty = loyaltySettings(db);
  const points = customerId ? pointsBalance(customerId, db) : 0;
  const advance = customerId ? creditBalance(customerId, db) : 0;
  const staff = db.staff.filter((s) => s.shopId === shopId && s.active);

  const totals = useMemo(
    () =>
      calculateBill({
        items: cart.items,
        billDiscount: coupon ? { mode: coupon.mode, value: coupon.value } : cart.billDiscount,
        membershipDiscountPct: cart.customer.membershipDiscountPct,
        taxRatePct: db.settings.billing.taxRatePct,
      }),
    [cart.items, cart.billDiscount, coupon, cart.customer.membershipDiscountPct, db.settings.billing.taxRatePct],
  );

  const tipNum = round2(Math.max(0, Number(tip) || 0));
  const due = round2(totals.total + tipNum);

  // Start each payment fresh, with the exact amount pre-filled for cash.
  useEffect(() => {
    if (!open) return;
    setMethod('cash');
    setSplitMode(false);
    setSplits([]);
    setNotes('');
    setCouponInput('');
    setCoupon(null);
    setCouponError(null);
    setTip('');
    setTipStaffId(cart.staffId ?? '');
    setPayLater(false);
    setVoucherCode('');
    setTenderError(null);
  }, [open, cart.staffId]);

  useEffect(() => {
    if (open) setTendered(String(due));
  }, [open, due]);

  const tenderedNum = Number(tendered) || 0;
  const change = method === 'cash' ? round2(Math.max(0, tenderedNum - due)) : 0;
  const shortBy = method === 'cash' ? round2(Math.max(0, due - tenderedNum)) : 0;

  const splitPaid = paidTotal(splits);
  const splitRemaining = round2(Math.max(0, due - splitPaid));

  useEffect(() => {
    setSplitAmount(String(splitRemaining));
  }, [splitRemaining]);

  const canPay = splitMode
    ? splitPaid >= due || (payLater && customerId !== null)
    : method !== 'cash' || tenderedNum >= due;

  const applyCoupon = (): void => {
    setCouponError(null);
    try {
      const preview = calculateBill({
        items: cart.items,
        billDiscount: { mode: 'percent', value: 0 },
        membershipDiscountPct: cart.customer.membershipDiscountPct,
        taxRatePct: db.settings.billing.taxRatePct,
      });
      const found = validateCoupon(couponInput, shopId, preview.subtotal, db);
      setCoupon({ code: found.code, mode: found.mode, value: found.value });
      setSplits([]);
    } catch (error) {
      setCoupon(null);
      setCouponError(error instanceof Error ? error.message : 'That coupon cannot be used.');
    }
  };

  const checkout = useAsyncAction(
    async () => {
      if (!actor) throw new Error('You must be signed in to take payment.');

      const payments: Payment[] = splitMode
        ? splits
        : [
            {
              id: uid('pay'),
              method,
              amount: due,
              tendered: method === 'cash' ? tenderedNum : null,
              reference: null,
            },
          ];

      return saleService.checkout(
        {
          shopId,
          customerId,
          customerName: cart.customer.name || 'Walk-in customer',
          staffId: cart.staffId,
          appointmentId: cart.appointmentId,
          items: cart.items,
          billDiscount: cart.billDiscount,
          payments,
          notes,
          couponCode: coupon?.code ?? null,
          tip: tipNum,
          tipStaffId: tipStaffId || null,
          payLater: splitMode && payLater,
        },
        actor,
      );
    },
    {
      successMessage: (sale) =>
        (sale.balanceDue ?? 0) > 0
          ? `Bill ${sale.receiptNo} saved — ${formatCurrency(sale.balanceDue ?? 0)} left to pay.`
          : `Payment taken — receipt ${sale.receiptNo}.`,
      onSuccess: (sale) => {
        cart.clear();
        onComplete(sale);
      },
    },
  );

  const addSplit = (splitMethod: PaymentMethod, amount: number, reference: string | null = null): void => {
    const value = round2(Math.min(amount, splitRemaining));
    if (value <= 0) return;
    setSplits((current) => [
      ...current,
      { id: uid('pay'), method: splitMethod, amount: value, tendered: null, reference },
    ]);
  };

  const wanted = Math.max(0, Number(splitAmount) || 0);

  const addVoucher = (): void => {
    setTenderError(null);
    try {
      const v = findVoucher(voucherCode, db);
      const already = splits.filter((p) => p.method === 'voucher' && p.reference === v.code).reduce((s, p) => s + p.amount, 0);
      const left = round2(v.balance - already);
      if (left <= 0) throw new Error(`Voucher ${v.code} is already fully applied.`);
      addSplit('voucher', Math.min(left, wanted || splitRemaining), v.code);
      setVoucherCode('');
    } catch (error) {
      setTenderError(error instanceof Error ? error.message : 'That voucher cannot be used.');
    }
  };

  const addPoints = (): void => {
    setTenderError(null);
    const used = splits.filter((p) => p.method === 'points').reduce((s, p) => s + Number(p.reference), 0);
    const available = points - used;
    if (available < loyalty.minRedeemPoints) {
      setTenderError(`At least ${loyalty.minRedeemPoints} points are needed to redeem.`);
      return;
    }
    const money = Math.min(available * loyalty.pointValue, wanted || splitRemaining, splitRemaining);
    const pts = Math.ceil(money / loyalty.pointValue);
    if (pts < loyalty.minRedeemPoints) {
      setTenderError(`At least ${loyalty.minRedeemPoints} points must be redeemed at once.`);
      return;
    }
    addSplit('points', round2(pts * loyalty.pointValue), String(pts));
  };

  const addAdvance = (): void => {
    const used = splits.filter((p) => p.method === 'wallet').reduce((s, p) => s + p.amount, 0);
    addSplit('wallet', Math.min(advance - used, wanted || splitRemaining));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!checkout.pending}
      title="Take payment"
      description={`${cart.items.length} ${cart.items.length === 1 ? 'item' : 'items'} for ${
        cart.customer.name || 'a walk-in customer'
      }`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={checkout.pending}>
            Back to cart
          </Button>
          <Button
            size="lg"
            loading={checkout.pending}
            disabled={!canPay}
            onClick={() => void checkout.run()}
          >
            {splitMode && payLater && splitRemaining > 0
              ? `Save bill · ${formatCurrency(splitRemaining)} due later`
              : `Complete sale · ${formatCurrency(due)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ---- Amount due ---- */}
        <div className="rounded-2xl bg-brand p-5 text-center text-brand-ink">
          <p className="text-xs uppercase tracking-wide opacity-75">Amount due</p>
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums">{formatCurrency(due)}</p>
          <p className="mt-1 text-xs opacity-75">
            {totals.totalDiscount > 0 && `${formatCurrency(totals.totalDiscount)} discounted`}
            {totals.totalDiscount > 0 && tipNum > 0 && ' · '}
            {tipNum > 0 && `includes ${formatCurrency(tipNum)} tip`}
          </p>
        </div>

        {/* ---- Coupon & tip ---- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-end gap-2">
              <Input
                label="Coupon code"
                placeholder="e.g. EID25"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                leftIcon={<TicketPercent />}
              />
              {coupon ? (
                <Button variant="outline" onClick={() => { setCoupon(null); setCouponInput(''); setSplits([]); }}>
                  Remove
                </Button>
              ) : (
                <Button variant="outline" disabled={!couponInput.trim()} onClick={applyCoupon}>
                  Apply
                </Button>
              )}
            </div>
            {coupon && (
              <p className="mt-1 text-xs text-ok">
                {coupon.code} applied — {coupon.mode === 'percent' ? `${coupon.value}% off` : `${formatCurrency(coupon.value)} off`}
              </p>
            )}
            {couponError && <p className="mt-1 text-xs text-danger">{couponError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Tip (optional)"
              type="number"
              min={0}
              step={50}
              value={tip}
              onChange={(e) => {
                setTip(e.target.value);
                setSplits([]);
              }}
            />
            <Select
              label="Tip for"
              value={tipStaffId}
              onChange={(e) => setTipStaffId(e.target.value)}
              options={[{ value: '', label: 'Choose stylist' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </div>
        </div>

        {customerId && (loyalty.enabled || advance > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {loyalty.enabled && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-ink">
                <Star className="h-3.5 w-3.5" aria-hidden /> {points} points ({formatCurrency(points * loyalty.pointValue)})
              </span>
            )}
            {advance > 0 && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-ok-soft px-2.5 py-1 text-ink">
                <PiggyBank className="h-3.5 w-3.5" aria-hidden /> {formatCurrency(advance)} advance on account
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-ink">Payment method</p>
          <button
            type="button"
            onClick={() => {
              setSplitMode((v) => !v);
              setSplits([]);
              setPayLater(false);
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
              splitMode
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line text-muted hover:border-subtle hover:text-ink',
            )}
          >
            <Split className="h-3.5 w-3.5" aria-hidden />
            Split / voucher / points / pay later
          </button>
        </div>

        {/* ---- Single payment ---- */}
        {!splitMode && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {METHODS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={method === option.value}
                  onClick={() => setMethod(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors',
                    method === option.value
                      ? 'border-brand bg-brand text-brand-ink'
                      : 'border-line bg-surface text-muted hover:border-brand hover:text-ink',
                  )}
                >
                  <span className="[&>svg]:h-5 [&>svg]:w-5" aria-hidden>
                    {option.icon}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>

            {method === 'cash' && (
              <div className="space-y-3">
                <Input
                  label="Amount received"
                  type="number"
                  min={0}
                  step={50}
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  error={shortBy > 0 ? `Short by ${formatCurrency(shortBy)}` : undefined}
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTendered(String(due))}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft"
                  >
                    Exact
                  </button>

                  {QUICK_CASH.filter((note) => note >= due).slice(0, 3).map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => setTendered(String(note))}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium tabular-nums text-ink transition-colors hover:border-brand hover:bg-brand-soft"
                    >
                      {formatCurrency(note)}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setTendered(String(Math.ceil(due / 500) * 500))}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft"
                  >
                    Round up
                  </button>
                </div>

                <div
                  className={cn(
                    'flex items-center justify-between rounded-xl px-3.5 py-3',
                    change > 0 ? 'bg-ok-soft' : 'bg-canvas',
                  )}
                >
                  <span className="text-sm font-medium text-ink">Change to give</span>
                  <span
                    className={cn(
                      'font-display text-xl font-semibold tabular-nums',
                      change > 0 ? 'text-ok' : 'text-muted',
                    )}
                  >
                    {formatCurrency(change)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- Split payment ---- */}
        {splitMode && (
          <div className="space-y-3">
            {splits.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {splits.map((split) => (
                  <li key={split.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 text-sm text-ink">
                      {LABELS[split.method]}
                      {split.method === 'voucher' && <span className="ml-1 font-mono text-xs text-muted">{split.reference}</span>}
                      {split.method === 'points' && <span className="ml-1 text-xs text-muted">{split.reference} pts</span>}
                    </span>
                    <span className="text-sm font-medium tabular-nums text-ink">
                      {formatCurrency(split.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSplits((c) => c.filter((p) => p.id !== split.id))}
                      className="text-xs text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div
              className={cn(
                'flex items-center justify-between rounded-xl px-3.5 py-2.5',
                splitRemaining === 0 ? 'bg-ok-soft' : 'bg-warn-soft',
              )}
            >
              <span className="text-[13px] font-medium text-ink">Still to pay</span>
              <span className="text-sm font-semibold tabular-nums text-ink">
                {formatCurrency(splitRemaining)}
              </span>
            </div>

            {splitRemaining > 0 && (
              <div className="space-y-3">
                <Input
                  label="Amount for the next payment"
                  type="number"
                  min={0}
                  value={splitAmount}
                  onChange={(e) => setSplitAmount(e.target.value)}
                  hint="Defaults to everything still owed. Lower it to take part of the bill this way."
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {METHODS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => addSplit(option.value, wanted)}
                      className="flex flex-col items-center gap-1.5 rounded-xl border border-line px-2 py-3 text-xs font-medium text-muted transition-colors hover:border-brand hover:bg-brand-soft hover:text-ink"
                    >
                      <span className="[&>svg]:h-5 [&>svg]:w-5" aria-hidden>
                        {option.icon}
                      </span>
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-end gap-2">
                  <Input
                    label="Gift voucher"
                    placeholder="GV-XXXXXX"
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                    leftIcon={<Gift />}
                  />
                  <Button variant="outline" disabled={!voucherCode.trim()} onClick={addVoucher}>
                    Use voucher
                  </Button>
                </div>

                {customerId && (
                  <div className="flex flex-wrap gap-2">
                    {loyalty.enabled && points > 0 && (
                      <Button variant="outline" size="sm" leftIcon={<Star />} onClick={addPoints}>
                        Redeem points
                      </Button>
                    )}
                    {advance > 0 && (
                      <Button variant="outline" size="sm" leftIcon={<PiggyBank />} onClick={addAdvance}>
                        Use advance
                      </Button>
                    )}
                  </div>
                )}

                {tenderError && <p className="text-xs text-danger">{tenderError}</p>}
              </div>
            )}

            {customerId ? (
              <Checkbox
                label="Customer pays the rest later"
                description="Saves the bill with a balance due on the customer's account. Collect it from Bills → Unpaid."
                checked={payLater}
                onChange={(e) => setPayLater(e.target.checked)}
              />
            ) : (
              <p className="text-xs text-subtle">Pick a saved customer to allow paying the rest later.</p>
            )}
          </div>
        )}

        <Textarea
          label="Notes (optional)"
          placeholder="Anything to record against this bill"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
