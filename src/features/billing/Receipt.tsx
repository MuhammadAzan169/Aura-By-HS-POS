import type { Sale } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDateTime } from '@/utils/date';
import { useDb } from '@/hooks/useDb';
import { designFor } from '@/services/billDesign';

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  'bank-transfer': 'Bank transfer',
  other: 'Other',
  voucher: 'Gift voucher',
  points: 'Loyalty points',
  wallet: 'Advance',
};

/**
 * The printable bill. Everything it shows — shop name, address, footer — is
 * read live from the shop and settings records, so editing the shop profile
 * changes the next receipt immediately.
 */
export function Receipt({ sale }: { sale: Sale }): JSX.Element {
  const db = useDb();
  const shop = db.shops.find((s) => s.id === sale.shopId);
  const staff = db.staff.find((s) => s.id === sale.staffId);
  const settings = db.settings;

  return (
    <article className="print-area w-full max-w-[420px] rounded-2xl border border-line bg-surface p-6 shadow-card">
      {/* ---- Header ---- */}
      <header className="border-b border-dashed border-line pb-4 text-center">
        {settings.business.logoUrl && (
          <img
            src={settings.business.logoUrl}
            alt=""
            className="mx-auto mb-2 h-12 w-12 rounded-xl object-cover"
          />
        )}

        <h2 className="font-display text-xl font-semibold text-ink">
          {shop?.name ?? settings.billing.receiptHeader}
        </h2>

        {shop && (
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {shop.addressLine}
            <br />
            {shop.city} · {shop.phone}
          </p>
        )}
      </header>

      {/* ---- Meta ---- */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-dashed border-line py-3 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Receipt</dt>
          <dd className="font-mono font-medium text-ink">{sale.receiptNo}</dd>
        </div>

        <div className="flex justify-between gap-2">
          <dt className="text-muted">Date</dt>
          <dd className="text-right text-ink">{formatDateTime(sale.soldAt)}</dd>
        </div>

        <div className="flex justify-between gap-2">
          <dt className="text-muted">Customer</dt>
          <dd className="truncate text-right text-ink">{sale.customerName}</dd>
        </div>

        <div className="flex justify-between gap-2">
          <dt className="text-muted">Served by</dt>
          <dd className="truncate text-right text-ink">{staff?.name ?? '—'}</dd>
        </div>
      </dl>

      {/* ---- Lines ---- */}
      <table className="w-full border-b border-dashed border-line py-2 text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 font-medium">Item</th>
            <th scope="col" className="py-2 text-center font-medium">Qty</th>
            <th scope="col" className="py-2 text-right font-medium">Price</th>
            <th scope="col" className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>

        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-1.5 pr-2 text-ink">
                {item.name}
                {item.discount > 0 && (
                  <span className="block text-[10px] text-ok">
                    less {formatCurrency(item.discount)}
                  </span>
                )}
              </td>
              <td className="py-1.5 text-center tabular-nums text-ink">{item.quantity}</td>
              <td className="py-1.5 text-right tabular-nums text-ink">
                {formatCurrency(item.unitPrice)}
              </td>
              <td className="py-1.5 text-right tabular-nums font-medium text-ink">
                {formatCurrency(item.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---- Totals ---- */}
      <dl className="space-y-1.5 border-b border-dashed border-line py-3 text-xs">
        <Line label="Subtotal" value={formatCurrency(sale.subtotal)} />

        {sale.membershipDiscount > 0 && (
          <Line label="Membership discount" value={`−${formatCurrency(sale.membershipDiscount)}`} muted />
        )}

        {sale.billDiscount > 0 && (
          <Line
            label={sale.couponCode ? `Coupon ${sale.couponCode}` : 'Bill discount'}
            value={`−${formatCurrency(sale.billDiscount)}`}
            muted
          />
        )}

        <Line label={`Tax (${sale.taxRate}%)`} value={formatCurrency(sale.taxAmount)} />
      </dl>

      <div className="flex items-baseline justify-between py-3">
        <span className="text-sm font-semibold text-ink">TOTAL</span>
        <span className="font-display text-2xl font-semibold tabular-nums text-ink">
          {formatCurrency(sale.total)}
        </span>
      </div>

      {(sale.tip ?? 0) > 0 && (
        <dl className="border-t border-dashed border-line py-2 text-xs">
          <Line label="Tip" value={formatCurrency(sale.tip ?? 0)} />
        </dl>
      )}

      {/* ---- Payment ---- */}
      <dl className="space-y-1.5 border-t border-dashed border-line py-3 text-xs">
        {sale.payments.map((payment) => (
          <Line
            key={payment.id}
            label={`Paid by ${METHOD_LABELS[payment.method] ?? payment.method}`}
            value={formatCurrency(payment.tendered ?? payment.amount)}
          />
        ))}

        {sale.changeGiven > 0 && (
          <Line label="Change given" value={formatCurrency(sale.changeGiven)} />
        )}
        {(sale.balanceDue ?? 0) > 0 && (
          <div className="flex justify-between gap-2 font-semibold">
            <dt className="text-danger">Balance due</dt>
            <dd className="tabular-nums text-danger">{formatCurrency(sale.balanceDue ?? 0)}</dd>
          </div>
        )}
        {(sale.pointsEarned ?? 0) > 0 && (
          <Line label="Loyalty points earned" value={`+${sale.pointsEarned}`} />
        )}
      </dl>

      {sale.status === 'refunded' && (
        <p className="mb-3 rounded-lg border border-danger/40 py-2 text-center text-xs font-semibold uppercase tracking-wide text-danger">
          Refunded
        </p>
      )}

      {/* ---- Footer ---- */}
      <footer className="border-t border-dashed border-line pt-3 text-center">
        <p className="text-xs leading-relaxed text-muted">
          {shop?.receiptFooter}
        </p>
        <p className="mt-2 text-[10px] text-subtle">{designFor(settings, shop).terms}</p>
      </footer>
    </article>
  );
}

function Line({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}): JSX.Element {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={muted ? 'tabular-nums text-ok' : 'tabular-nums text-ink'}>{value}</dd>
    </div>
  );
}
