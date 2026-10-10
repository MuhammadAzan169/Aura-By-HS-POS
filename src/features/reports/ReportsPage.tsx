import { downloadExcel } from '@/utils/excel';
import { useMemo, useState } from 'react';
import {
  endOfDay,
  endOfMonth,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { Download, FileBarChart, Printer, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatCurrency, formatPercent } from '@/utils/money';
import { formatDate, toISODate } from '@/utils/date';
import { printDocument, timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import {
  financialSummary,
  kpis,
  previousPeriod,
  productReport,
  revenueSeries,
  serviceReport,
  shopComparison,
  staffReport,
  topCustomers,
  type Period,
} from '@/services/reportService';
import { deltaPct } from '@/utils/money';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { FilterSelect } from '@/components/ui/FilterBar';
import { Badge, StockBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { DonutChart, RevenueAreaChart, SimpleBarChart } from '@/components/ui/Chart';

type PresetKey = 'today' | 'last-7' | 'this-month' | 'last-month' | 'last-3' | 'this-year';

const PRESETS: { value: PresetKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last-7', label: 'Last 7 days' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-3', label: 'Last 3 months' },
  { value: 'this-year', label: 'This year' },
];

function resolvePeriod(preset: PresetKey): Period {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'last-7':
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case 'this-month':
      return { from: startOfMonth(now), to: endOfDay(now) };
    case 'last-month': {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'last-3':
      return { from: startOfMonth(subMonths(now, 2)), to: endOfDay(now) };
    case 'this-year':
      return { from: startOfYear(now), to: endOfYear(now) };
  }
}

type TabValue = 'financial' | 'revenue' | 'services' | 'staff' | 'customers' | 'products' | 'shops';

export function ReportsPage(): JSX.Element {
  const db = useDb();
  const { shopId, isAllShops, shop } = useShopScope();

  const [preset, setPreset] = useState<PresetKey>('this-month');
  const [tab, setTab] = useState<TabValue>('financial');

  const period = useMemo(() => resolvePeriod(preset), [preset]);

  // `db` in the deps is what makes every figure follow live writes.
  const data = useMemo(() => {
    const granularity = preset === 'today' ? 'day' : preset === 'this-year' ? 'month' : 'day';
    const current = kpis(shopId, period);
    const prior = kpis(shopId, previousPeriod(period));

    return {
      financial: financialSummary(shopId, period),
      kpi: current,
      revenueDelta: deltaPct(current.revenue, prior.revenue),
      billsDelta: deltaPct(current.bills, prior.bills),
      series: revenueSeries(shopId, period, granularity),
      services: serviceReport(shopId, period),
      staff: staffReport(shopId, period),
      customers: topCustomers(shopId, period, 15),
      products: productReport(shopId, period),
      shops: shopComparison(period),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, shopId, period, preset]);

  const periodLabel = `${formatDate(period.from)} – ${formatDate(period.to)}`;
  const scopeLabel = isAllShops ? 'All shops' : (shop?.name ?? '');

  const exportCurrentTab = (): void => {
    const stamp = `${tab}-${toISODate(period.from)}-to-${toISODate(period.to)}`;

    if (tab === 'services') {
      void downloadExcel(
        data.services,
        [
          { header: 'Service', value: (r) => r.name },
          { header: 'Category', value: (r) => r.categoryName },
          { header: 'Bookings', value: (r) => r.bookings },
          { header: 'Revenue', value: (r) => r.revenue },
        ],
        timestampedName(`report-${stamp}`),
      );
      return;
    }

    if (tab === 'staff') {
      void downloadExcel(
        data.staff,
        [
          { header: 'Staff', value: (r) => r.name },
          { header: 'Role', value: (r) => r.role },
          { header: 'Completed', value: (r) => r.completed },
          { header: 'Cancelled', value: (r) => r.cancelled },
          { header: 'No-shows', value: (r) => r.noShow },
          { header: 'Revenue', value: (r) => r.revenue },
          { header: 'Commission', value: (r) => r.commission },
        ],
        timestampedName(`report-${stamp}`),
      );
      return;
    }

    if (tab === 'customers') {
      void downloadExcel(
        data.customers,
        [
          { header: 'Customer', value: (r) => r.name },
          { header: 'Phone', value: (r) => r.phone },
          { header: 'Visits', value: (r) => r.visits },
          { header: 'Spent', value: (r) => r.spent },
          { header: 'Last visit', value: (r) => (r.lastVisit ? formatDate(r.lastVisit) : '') },
        ],
        timestampedName(`report-${stamp}`),
      );
      return;
    }

    if (tab === 'products') {
      void downloadExcel(
        data.products,
        [
          { header: 'Product', value: (r) => r.name },
          { header: 'Brand', value: (r) => r.brand },
          { header: 'Units sold', value: (r) => r.unitsSold },
          { header: 'Revenue', value: (r) => r.revenue },
          { header: 'Stock', value: (r) => r.stock },
          { header: 'Status', value: (r) => r.status },
        ],
        timestampedName(`report-${stamp}`),
      );
      return;
    }

    if (tab === 'shops') {
      void downloadExcel(
        data.shops,
        [
          { header: 'Branch', value: (r) => r.name },
          { header: 'Revenue', value: (r) => r.revenue },
          { header: 'Expenses', value: (r) => r.expenses },
          { header: 'Profit', value: (r) => r.profit },
          { header: 'Bills', value: (r) => r.bills },
          { header: 'Appointments', value: (r) => r.appointments },
          { header: 'Completion rate %', value: (r) => r.completionRate },
          { header: 'Average bill', value: (r) => r.averageBill },
        ],
        timestampedName(`report-${stamp}`),
      );
      return;
    }

    // Financial and revenue both export the period series.
    void downloadExcel(
      data.series,
      [
        { header: 'Period', value: (r) => r.label },
        { header: 'Revenue', value: (r) => r.revenue },
        { header: 'Bills', value: (r) => r.bills },
        { header: 'Appointments', value: (r) => r.appointments },
      ],
      timestampedName(`report-${stamp}`),
    );
  };

  return (
    <>
      <PageHeader
        className="no-print"
        title="Reports"
        description={`${scopeLabel} · ${periodLabel}`}
        actions={
          <>
            <FilterSelect
              label="Period"
              value={preset}
              onChange={setPreset}
              options={PRESETS}
              className="w-40"
            />
            <Button variant="outline" leftIcon={<Download />} onClick={exportCurrentTab}>
              Export Excel
            </Button>
            <Button variant="outline" leftIcon={<Printer />} onClick={printDocument}>
              PDF
            </Button>
          </>
        }
      >
        <Tabs
          label="Report sections"
          value={tab}
          onChange={(next) => setTab(next as TabValue)}
          items={[
            { value: 'financial', label: 'Financial' },
            { value: 'revenue', label: 'Revenue' },
            { value: 'services', label: 'Services' },
            { value: 'staff', label: 'Staff' },
            { value: 'customers', label: 'Customers' },
            { value: 'products', label: 'Products' },
            ...(isAllShops ? [{ value: 'shops' as const, label: 'Shops' }] : []),
          ]}
        />
      </PageHeader>

      <div className="print-area">
        {/* ---------------- Financial ---------------- */}
        <TabPanel active={tab === 'financial'}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              <StatCard
                label="Revenue"
                value={formatCurrency(data.financial.revenue)}
                icon={<TrendingUp />}
                delta={data.revenueDelta}
              />
              <StatCard
                label="Expenses"
                value={formatCurrency(data.financial.expenses)}
                icon={<TrendingDown />}
                tone="warn"
              />
              <StatCard
                label="Net profit"
                value={formatCurrency(data.financial.netProfit)}
                icon={<Wallet />}
                tone={data.financial.netProfit >= 0 ? 'ok' : 'danger'}
                hint={`${formatPercent(data.financial.marginPct, 1)} margin`}
              />
              <StatCard
                label="Bills raised"
                value={data.kpi.bills}
                delta={data.billsDelta}
                hint={`${formatCurrency(data.kpi.averageBill)} average`}
              />
            </div>

            <Card>
              <CardHeader
                title="Profit & loss"
                description={`${scopeLabel} · ${periodLabel}`}
              />

              <dl className="mt-4 space-y-0 text-sm">
                <PLRow label="Service revenue" value={data.financial.serviceRevenue} />
                <PLRow label="Product revenue" value={data.financial.productRevenue} />
                <PLRow label="Tax collected" value={data.financial.taxCollected} muted />
                <PLRow label="Discounts given" value={-data.financial.discountsGiven} muted />

                <PLRow label="Total revenue" value={data.financial.revenue} emphasis />

                <PLRow label="Refunds" value={-data.financial.refunds} negative />
                <PLRow label="Expenses" value={-data.financial.expenses} negative />

                <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink/20 pt-3">
                  <dt className="font-display text-base font-semibold text-ink">Net profit</dt>
                  <dd
                    className={cn(
                      'font-display text-2xl font-semibold tabular-nums',
                      data.financial.netProfit >= 0 ? 'text-ok' : 'text-danger',
                    )}
                  >
                    {formatCurrency(data.financial.netProfit)}
                  </dd>
                </div>

                <p className="mt-2 text-xs text-subtle">
                  Revenue − expenses − refunds. Figures are calculated live from completed bills and
                  recorded expenses in this period.
                </p>
              </dl>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Revenue mix" description="Services against retail" />
                <DonutChart
                  height={230}
                  data={[
                    { name: 'Services', value: data.financial.serviceRevenue },
                    { name: 'Products', value: data.financial.productRevenue },
                  ]}
                />
              </Card>

              <Card>
                <CardHeader title="Appointments" description="How the diary resolved" />
                <DonutChart
                  height={230}
                  currency={false}
                  data={[
                    { name: 'Completed', value: data.kpi.appointmentsCompleted },
                    { name: 'Pending', value: data.kpi.appointmentsPending },
                    { name: 'Cancelled', value: data.kpi.appointmentsCancelled },
                    { name: 'No-show', value: data.kpi.appointmentsNoShow },
                  ]}
                />
              </Card>
            </div>
          </div>
        </TabPanel>

        {/* ---------------- Revenue ---------------- */}
        <TabPanel active={tab === 'revenue'}>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Revenue over time" description={periodLabel} />
              <RevenueAreaChart
                className="mt-4"
                height={320}
                data={data.series}
                xKey="label"
                series={[{ key: 'revenue', label: 'Revenue' }]}
              />
            </Card>

            <Card>
              <CardHeader title="Bills and appointments" description="Volume over the same period" />
              <SimpleBarChart
                className="mt-4"
                height={260}
                currency={false}
                data={data.series}
                xKey="label"
                series={[
                  { key: 'bills', label: 'Bills' },
                  { key: 'appointments', label: 'Appointments' },
                ]}
              />
            </Card>
          </div>
        </TabPanel>

        {/* ---------------- Services ---------------- */}
        <TabPanel active={tab === 'services'}>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Most booked services" description="By number of completed bookings" />
              <SimpleBarChart
                className="mt-4"
                horizontal
                height={320}
                currency={false}
                data={data.services.slice(0, 10)}
                xKey="name"
                series={[{ key: 'bookings', label: 'Bookings' }]}
              />
            </Card>

            <Card flush>
              <div className="p-5 pb-0">
                <CardHeader title="Service performance" description={periodLabel} />
              </div>
              <ReportTable
                headers={['Service', 'Category', 'Bookings', 'Revenue']}
                rows={data.services.map((row) => [
                  row.name,
                  row.categoryName,
                  String(row.bookings),
                  formatCurrency(row.revenue),
                ])}
                emptyMessage="No services were delivered in this period."
              />
            </Card>
          </div>
        </TabPanel>

        {/* ---------------- Staff ---------------- */}
        <TabPanel active={tab === 'staff'}>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Revenue by stylist" description={periodLabel} />
              <SimpleBarChart
                className="mt-4"
                horizontal
                height={300}
                data={data.staff.slice(0, 10)}
                xKey="name"
                series={[{ key: 'revenue', label: 'Revenue' }]}
              />
            </Card>

            <Card flush>
              <div className="p-5 pb-0">
                <CardHeader title="Staff performance" description="Completed work and commission owed" />
              </div>
              <ReportTable
                headers={['Stylist', 'Role', 'Completed', 'Cancelled', 'No-show', 'Revenue', 'Commission']}
                rows={data.staff.map((row) => [
                  row.name,
                  row.role,
                  String(row.completed),
                  String(row.cancelled),
                  String(row.noShow),
                  formatCurrency(row.revenue),
                  formatCurrency(row.commission),
                ])}
                emptyMessage="Nobody completed work in this period."
              />
            </Card>
          </div>
        </TabPanel>

        {/* ---------------- Customers ---------------- */}
        <TabPanel active={tab === 'customers'}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              <StatCard label="New customers" value={data.kpi.newCustomers} />
              <StatCard label="Returning" value={data.kpi.returningCustomers} />
              <StatCard
                label="Total served"
                value={data.kpi.newCustomers + data.kpi.returningCustomers}
              />
              <StatCard label="Average spend" value={formatCurrency(data.kpi.averageBill)} />
            </div>

            <Card>
              <CardHeader title="New against returning" description={periodLabel} />
              <DonutChart
                height={240}
                currency={false}
                data={[
                  { name: 'New', value: data.kpi.newCustomers },
                  { name: 'Returning', value: data.kpi.returningCustomers },
                ]}
              />
            </Card>

            <Card flush>
              <div className="p-5 pb-0">
                <CardHeader title="Top customers" description="By spend in this period" />
              </div>
              <ReportTable
                headers={['Customer', 'Phone', 'Visits', 'Spent', 'Last visit']}
                rows={data.customers.map((row) => [
                  row.name,
                  row.phone,
                  String(row.visits),
                  formatCurrency(row.spent),
                  row.lastVisit ? formatDate(row.lastVisit) : '—',
                ])}
                emptyMessage="No customers were billed in this period."
              />
            </Card>
          </div>
        </TabPanel>

        {/* ---------------- Products ---------------- */}
        <TabPanel active={tab === 'products'}>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Best sellers" description="Units sold in this period" />
              <SimpleBarChart
                className="mt-4"
                horizontal
                height={300}
                currency={false}
                data={data.products.filter((p) => p.unitsSold > 0).slice(0, 10)}
                xKey="name"
                series={[{ key: 'unitsSold', label: 'Units sold' }]}
                emptyMessage="No products were sold in this period"
              />
            </Card>

            <Card flush>
              <div className="p-5 pb-0">
                <CardHeader title="Product performance" description="Sales and current stock" />
              </div>
              <ReportTable
                headers={['Product', 'Brand', 'Units sold', 'Revenue', 'Stock']}
                rows={data.products.map((row) => [
                  row.name,
                  row.brand,
                  String(row.unitsSold),
                  formatCurrency(row.revenue),
                  String(row.stock),
                ])}
                emptyMessage="No products to report."
              />
            </Card>

            <Card>
              <CardHeader title="Needs reordering" description="At or below the minimum level" />
              {data.products.filter((p) => p.status !== 'in-stock').length === 0 ? (
                <EmptyState compact title="Stock is healthy everywhere" />
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {data.products
                    .filter((p) => p.status !== 'in-stock')
                    .map((row) => (
                      <li key={row.productId} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">{row.name}</p>
                          <p className="truncate text-xs text-muted">{row.brand}</p>
                        </div>
                        <span className="text-sm tabular-nums text-ink">{row.stock} left</span>
                        <StockBadge status={row.status} />
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          </div>
        </TabPanel>

        {/* ---------------- Shops ---------------- */}
        {isAllShops && (
          <TabPanel active={tab === 'shops'}>
            <div className="space-y-4">
              <Card>
                <CardHeader title="Revenue against expenses" description={periodLabel} />
                <SimpleBarChart
                  className="mt-4"
                  height={300}
                  data={data.shops}
                  xKey="name"
                  series={[
                    { key: 'revenue', label: 'Revenue' },
                    { key: 'expenses', label: 'Expenses' },
                  ]}
                />
              </Card>

              <div className="grid gap-4 md:grid-cols-3">
                {data.shops.map((row) => (
                  <Card key={row.shopId}>
                    <h3 className="font-display text-base font-semibold text-ink">{row.name}</h3>

                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted">Revenue</dt>
                        <dd className="tabular-nums text-ink">{formatCurrency(row.revenue)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted">Expenses</dt>
                        <dd className="tabular-nums text-ink">{formatCurrency(row.expenses)}</dd>
                      </div>
                      <div className="flex justify-between border-t border-line pt-2">
                        <dt className="font-medium text-ink">Profit</dt>
                        <dd
                          className={cn(
                            'font-semibold tabular-nums',
                            row.profit >= 0 ? 'text-ok' : 'text-danger',
                          )}
                        >
                          {formatCurrency(row.profit)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                      <Badge tone="neutral">{row.bills} bills</Badge>
                      <Badge tone="neutral">{row.appointments} appointments</Badge>
                      <Badge tone={row.completionRate >= 80 ? 'ok' : 'warn'}>
                        {row.completionRate.toFixed(0)}% completed
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>

              <Card flush>
                <div className="p-5 pb-0">
                  <CardHeader title="Side by side" description="Every branch in this period" />
                </div>
                <ReportTable
                  headers={['Branch', 'Revenue', 'Expenses', 'Profit', 'Bills', 'Average bill']}
                  rows={data.shops.map((row) => [
                    row.name,
                    formatCurrency(row.revenue),
                    formatCurrency(row.expenses),
                    formatCurrency(row.profit),
                    String(row.bills),
                    formatCurrency(row.averageBill),
                  ])}
                  emptyMessage="No branches to compare."
                />
              </Card>
            </div>
          </TabPanel>
        )}
      </div>
    </>
  );
}

function PLRow({
  label,
  value,
  emphasis,
  muted,
  negative,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  muted?: boolean;
  negative?: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between py-2',
        emphasis && 'border-t border-line font-medium',
      )}
    >
      <dt className={cn(emphasis ? 'text-ink' : muted ? 'text-subtle' : 'text-muted')}>{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          emphasis ? 'font-semibold text-ink' : negative ? 'text-danger' : muted ? 'text-subtle' : 'text-ink',
        )}
      >
        {formatCurrency(value)}
      </dd>
    </div>
  );
}

function ReportTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[];
  rows: string[][];
  emptyMessage: string;
}): JSX.Element {
  if (rows.length === 0) {
    return <EmptyState compact icon={<FileBarChart />} title={emptyMessage} />;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas/60">
            {headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={cn(
                  'px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle whitespace-nowrap',
                  index === 0 ? 'text-left' : 'text-right',
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-line">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    'px-5 py-2.5 whitespace-nowrap',
                    cellIndex === 0 ? 'text-left text-ink' : 'text-right tabular-nums text-muted',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ReportsPage;
