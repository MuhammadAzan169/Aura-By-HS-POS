import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Download, Plus, Printer, RotateCcw } from 'lucide-react';
import { formatDateTime } from '@/utils/date';
import { printDocument } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useConfirm } from '@/hooks/useConfirm';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthStore } from '@/store/authStore';
import * as saleService from '@/services/saleService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { Receipt } from './Receipt';

export function ReceiptPage(): JSX.Element {
  const { saleId } = useParams<{ saleId: string }>();
  const db = useDb();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const confirm = useConfirm();
  const actor = useAuthStore((s) => s.user);

  const basePath = pathname.startsWith('/admin') ? '/admin' : '/shop';
  const sale = db.sales.find((s) => s.id === saleId);

  const refund = useAsyncAction(
    async (reason: string) => {
      if (!sale || !actor) throw new Error('That bill could not be found.');
      return saleService.refund(sale.id, reason, actor);
    },
    { successMessage: 'Bill refunded. Any products were returned to stock.' },
  );

  if (!sale) {
    return (
      <Card>
        <ErrorState
          title="Bill not found"
          message="That receipt may have been removed, or belongs to another branch."
          onRetry={() => navigate(`${basePath}/billing/bills`)}
        />
      </Card>
    );
  }

  const onRefund = async (): Promise<void> => {
    const result = await confirm({
      title: `Refund ${sale.receiptNo}?`,
      description:
        'The bill is marked refunded, any products go back into stock, and the revenue is reversed in the reports. This cannot be undone.',
      confirmLabel: 'Refund bill',
      tone: 'danger',
      requireReason: {
        label: 'Reason for the refund',
        placeholder: 'e.g. customer unhappy with the colour result',
      },
    });
    if (!result.confirmed || !result.reason) return;
    await refund.run(result.reason);
  };

  return (
    <>
      <PageHeader
        className="no-print"
        breadcrumbs={[
          { label: 'Sales & billing', to: `${basePath}/billing` },
          { label: 'Bills', to: `${basePath}/billing/bills` },
          { label: sale.receiptNo },
        ]}
        title="Receipt"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{sale.receiptNo}</span>
            {sale.status === 'refunded' && <Badge tone="danger">Refunded</Badge>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" leftIcon={<Printer />} onClick={printDocument}>
              Print
            </Button>
            <Button
              variant="outline"
              leftIcon={<Download />}
              onClick={() =>
                // Loaded on demand so the PDF library never slows the till's first paint.
                void import('@/utils/receiptPdf').then(({ downloadReceiptPdf }) =>
                  downloadReceiptPdf({
                    sale,
                    shop: db.shops.find((s) => s.id === sale.shopId),
                    staff: db.staff.find((s) => s.id === sale.staffId),
                    settings: db.settings,
                  }),
                )
              }
            >
              Download PDF
            </Button>
            {sale.status === 'completed' && (
              <Button
                variant="outline"
                leftIcon={<RotateCcw />}
                loading={refund.pending}
                onClick={() => void onRefund()}
              >
                Refund
              </Button>
            )}
            <Button leftIcon={<Plus />} onClick={() => navigate(`${basePath}/billing`)}>
              New sale
            </Button>
          </>
        }
      />

      {sale.status === 'refunded' && sale.refundReason && (
        <div className="no-print mb-4 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3">
          <p className="text-[13px] font-semibold text-ink">
            Refunded {sale.refundedAt ? formatDateTime(sale.refundedAt) : ''}
          </p>
          <p className="mt-0.5 text-[13px] text-ink">{sale.refundReason}</p>
        </div>
      )}

      <div className="flex justify-center">
        <Receipt sale={sale} />
      </div>

      <p className="no-print mt-4 text-center text-xs text-subtle">
        "Download PDF" saves the bill as a file you can send on WhatsApp or email. "Print" sends
        it to the receipt printer.
      </p>
    </>
  );
}

export default ReceiptPage;
