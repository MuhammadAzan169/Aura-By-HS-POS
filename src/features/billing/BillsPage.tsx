import { downloadExcel } from '@/utils/excel';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Plus, Printer, Receipt, RotateCcw } from 'lucide-react';
import type { Sale } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDateTime } from '@/utils/date';
import { matches } from '@/utils/text';
import { timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useDebounce } from '@/hooks/useDebounce';
import { useTableState } from '@/hooks/useTableState';
import { useConfirm } from '@/hooks/useConfirm';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthStore } from '@/store/authStore';
import * as saleService from '@/services/saleService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';

export function BillsPage(): JSX.Element {
  const db = useDb();
  const { shopId, isAllShops } = useShopScope();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const confirm = useConfirm();
  const actor = useAuthStore((s) => s.user);

  const basePath = pathname.startsWith('/admin') ? '/admin' : '/shop';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'completed' | 'refunded'>('all');
  const [method, setMethod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const debounced = useDebounce(search);

  // A notification can link straight to a receipt number.
  useEffect(() => {
    const receipt = params.get('receipt');
    if (receipt) {
      setSearch(receipt);
      params.delete('receipt');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const scoped = useMemo(
    () => db.sales.filter((s) => shopId === null || s.shopId === shopId),
    [db.sales, shopId],
  );

  const filtered = useMemo(
    () =>
      scoped.filter((sale) => {
        if (status !== 'all' && sale.status !== status) return false;
        if (method !== 'all' && !sale.payments.some((p) => p.method === method)) return false;

        const day = sale.soldAt.slice(0, 10);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;

        if (debounced) {
          const hay = [sale.receiptNo, sale.customerName, ...sale.items.map((i) => i.name)];
          if (!hay.some((value) => matches(value, debounced))) return false;
        }

        return true;
      }),
    [scoped, status, method, fromDate, toDate, debounced],
  );

  const table = useTableState(filtered, {
    initialPageSize: 12,
    initialSortKey: 'soldAt',
    initialSortDir: 'desc',
    accessors: {
      soldAt: (sale) => sale.soldAt,
      receiptNo: (sale) => sale.receiptNo,
      customerName: (sale) => sale.customerName,
      total: (sale) => sale.total,
    },
  });

  const summary = useMemo(() => {
    const completed = filtered.filter((s) => s.status === 'completed');
    const revenue = completed.reduce((sum, s) => sum + s.total, 0);
    return {
      count: filtered.length,
      revenue,
      average: completed.length > 0 ? revenue / completed.length : 0,
      refunded: filtered.filter((s) => s.status === 'refunded').length,
    };
  }, [filtered]);

  const refund = useAsyncAction(
    async (sale: Sale, reason: string) => {
      if (!actor) throw new Error('You must be signed in.');
      return saleService.refund(sale.id, reason, actor);
    },
    { successMessage: 'Bill refunded and stock restored.' },
  );

  const onRefund = async (sale: Sale): Promise<void> => {
    const result = await confirm({
      title: `Refund ${sale.receiptNo}?`,
      description: `${formatCurrency(sale.total)} will be reversed and any products returned to stock.`,
      confirmLabel: 'Refund bill',
      tone: 'danger',
      requireReason: { label: 'Reason for the refund', placeholder: 'Why is this being refunded?' },
    });
    if (!result.confirmed || !result.reason) return;
    await refund.run(sale, result.reason);
  };

  const exportCsv = (): void => {
    void downloadExcel(
      table.sortedRows,
      [
        { header: 'Receipt', value: (s) => s.receiptNo },
        { header: 'Date', value: (s) => formatDateTime(s.soldAt) },
        { header: 'Branch', value: (s) => db.shops.find((x) => x.id === s.shopId)?.name ?? '' },
        { header: 'Customer', value: (s) => s.customerName },
        { header: 'Served by', value: (s) => db.staff.find((x) => x.id === s.staffId)?.name ?? '' },
        { header: 'Items', value: (s) => s.items.length },
        { header: 'Subtotal', value: (s) => s.subtotal },
        { header: 'Discount', value: (s) => s.billDiscount + s.membershipDiscount + s.itemDiscountTotal },
        { header: 'Tax', value: (s) => s.taxAmount },
        { header: 'Total', value: (s) => s.total },
        { header: 'Payment', value: (s) => s.payments.map((p) => p.method).join(' + ') },
        { header: 'Status', value: (s) => s.status },
      ],
      timestampedName('bills'),
    );
  };

  const activeFilters =
    (status !== 'all' ? 1 : 0) + (method !== 'all' ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0);

  const columns: Column<Sale>[] = [
    {
      key: 'receiptNo',
      header: 'Receipt',
      sortable: true,
      mobilePrimary: true,
      render: (sale) => (
        <div>
          <p className="flex items-center gap-2 font-mono text-[13px] font-medium text-ink">
            {sale.receiptNo}
            {sale.status === 'refunded' && <Badge tone="danger">Refunded</Badge>}
          </p>
          <p className="text-xs text-muted">{formatDateTime(sale.soldAt)}</p>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      render: (sale) => <span className="text-sm text-ink">{sale.customerName}</span>,
    },
    ...(isAllShops
      ? [
          {
            key: 'shop',
            header: 'Branch',
            hideBelowLg: true,
            render: (sale: Sale) => (
              <span className="text-sm text-muted">
                {db.shops.find((s) => s.id === sale.shopId)?.name ?? '—'}
              </span>
            ),
          } satisfies Column<Sale>,
        ]
      : []),
    {
      key: 'items',
      header: 'Items',
      align: 'right',
      hideBelowLg: true,
      render: (sale) => (
        <span className="text-sm tabular-nums text-muted">
          {sale.items.reduce((sum, i) => sum + i.quantity, 0)}
        </span>
      ),
    },
    {
      key: 'payment',
      header: 'Paid by',
      hideBelowLg: true,
      render: (sale) => (
        <span className="text-sm capitalize text-muted">
          {sale.payments.map((p) => p.method.replace('-', ' ')).join(' + ')}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      align: 'right',
      render: (sale) => (
        <span
          className={
            sale.status === 'refunded'
              ? 'text-sm font-medium tabular-nums text-subtle line-through'
              : 'text-sm font-semibold tabular-nums text-ink'
          }
        >
          {formatCurrency(sale.total)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Sales & billing', to: `${basePath}/billing` }, { label: 'Bills' }]}
        title="Bills history"
        description="Every receipt raised, with reprints and refunds."
        actions={
          <>
            <Button variant="outline" leftIcon={<Download />} onClick={exportCsv}>
              Export
            </Button>
            <Button leftIcon={<Plus />} onClick={() => navigate(`${basePath}/billing`)}>
              New sale
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Bills" value={summary.count} icon={<Receipt />} />
        <StatCard label="Revenue" value={formatCurrency(summary.revenue, { compact: true })} />
        <StatCard label="Average bill" value={formatCurrency(summary.average)} />
        <StatCard
          label="Refunded"
          value={summary.refunded}
          tone={summary.refunded > 0 ? 'warn' : 'default'}
        />
      </div>

      <Card className="mb-4">
        <FilterBar
          activeCount={activeFilters}
          onClear={() => {
            setStatus('all');
            setMethod('all');
            setFromDate('');
            setToDate('');
            setSearch('');
          }}
        >
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Receipt number, customer or item…"
            className="w-full sm:w-72"
            label="Search bills"
          />

          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All bills' },
              { value: 'completed', label: 'Completed' },
              { value: 'refunded', label: 'Refunded' },
            ]}
          />

          <FilterSelect
            label="Payment method"
            value={method}
            onChange={setMethod}
            options={[
              { value: 'all', label: 'Any method' },
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' },
              { value: 'bank-transfer', label: 'Bank transfer' },
              { value: 'other', label: 'Other' },
            ]}
          />

          <label className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
            <span className="sr-only">From date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
              className="h-10 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 text-sm text-ink sm:w-auto sm:flex-none"
            />
            <span aria-hidden className="text-subtle">–</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
              className="h-10 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 text-sm text-ink sm:w-auto sm:flex-none"
            />
          </label>
        </FilterBar>
      </Card>

      <DataTable
        columns={columns}
        table={table}
        rowKey={(sale) => sale.id}
        onRowClick={(sale) => navigate(`${basePath}/billing/bills/${sale.id}`)}
        caption="Bills"
        empty={{
          title: 'No bills match',
          description: 'Try a different search or clear the filters.',
          icon: <Receipt />,
        }}
        rowActions={(sale) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Printer />}
              onClick={() => navigate(`${basePath}/billing/bills/${sale.id}`)}
            >
              View
            </Button>
            {sale.status === 'completed' && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RotateCcw />}
                onClick={() => void onRefund(sale)}
              >
                Refund
              </Button>
            )}
          </div>
        )}
      />
    </>
  );
}

export default BillsPage;
