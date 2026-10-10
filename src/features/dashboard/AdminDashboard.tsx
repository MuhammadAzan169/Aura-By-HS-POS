import { FrontDeskAlerts } from './components/FrontDeskAlerts';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  PackageX,
  Plus,
  Scissors,
  TrendingUp,
  UserPlus,
  Users,
  UserSquare2,
  Wallet,
} from 'lucide-react';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { formatCurrency, formatNumber } from '@/utils/money';
import { formatDate, formatRelative } from '@/utils/date';
import {
  hourlySeries,
  periodFor,
  revenueSeries,
  serviceReport,
  shopComparison,
  staffReport,
  type Granularity,
} from '@/services/reportService';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/States';
import { RevenueAreaChart, SimpleBarChart } from '@/components/ui/Chart';
import { useDashboardData } from './useDashboardData';
import { TodayTimeline } from './components/TodayTimeline';

const RANGE_TABS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export function AdminDashboard(): JSX.Element {
  const data = useDashboardData();
  const db = useDb();
  const { shopId, isAllShops, shop } = useShopScope();
  const [range, setRange] = useState<Granularity>('week');

  const chart = useMemo(() => {
    if (range === 'day') return hourlySeries(shopId, data.today);
    const period = periodFor(range, data.today);
    return revenueSeries(shopId, period, range === 'week' ? 'day' : range === 'month' ? 'day' : 'month');
    // `db` drives the recompute whenever anything is written.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, shopId, data.today, db]);

  const period = useMemo(() => periodFor(range, data.today), [range, data.today]);

  const shopRows = useMemo(() => shopComparison(period), [period, db]);
  const services = useMemo(() => serviceReport(shopId, period).slice(0, 6), [shopId, period, db]);
  const staffRows = useMemo(() => staffReport(shopId, period).slice(0, 6), [shopId, period, db]);

  const alerts = useMemo(() => {
    const rows: { id: string; icon: JSX.Element; text: string; to: string; tone: 'warn' | 'danger' | 'info' }[] = [];

    const out = data.lowStock.filter((p) => p.stock === 0);
    if (out.length > 0) {
      rows.push({
        id: 'out',
        icon: <PackageX />,
        text: `${out.length} product${out.length === 1 ? ' is' : 's are'} out of stock`,
        to: '/admin/inventory',
        tone: 'danger',
      });
    }

    const low = data.lowStock.filter((p) => p.stock > 0);
    if (low.length > 0) {
      rows.push({
        id: 'low',
        icon: <AlertTriangle />,
        text: `${low.length} product${low.length === 1 ? '' : 's'} below the minimum level`,
        to: '/admin/inventory',
        tone: 'warn',
      });
    }

    if (data.pendingConfirmations.length > 0) {
      rows.push({
        id: 'pending',
        icon: <CalendarClock />,
        text: `${data.pendingConfirmations.length} appointment${
          data.pendingConfirmations.length === 1 ? '' : 's'
        } awaiting confirmation`,
        to: '/admin/appointments',
        tone: 'info',
      });
    }

    if (data.recentNoShows.length > 0) {
      rows.push({
        id: 'noshow',
        icon: <AlertTriangle />,
        text: `${data.recentNoShows.length} no-show${
          data.recentNoShows.length === 1 ? '' : 's'
        } in the last week`,
        to: '/admin/appointments',
        tone: 'warn',
      });
    }

    return rows;
  }, [data]);

  return (
    <>
      <PageHeader
        title={isAllShops ? 'All shops' : (shop?.name ?? 'Dashboard')}
        description={`Here's how ${isAllShops ? 'the business is' : 'this branch is'} doing on ${formatDate(data.today)}.`}
        actions={
          <>
            <Link
              to="/admin/appointments?new=1"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-canvas"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New appointment
            </Link>
            <Link
              to="/admin/billing"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-brand-ink transition-colors hover:bg-brand-strong"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New sale
            </Link>
          </>
        }
      />

      <FrontDeskAlerts shopId={isAllShops ? null : (shop?.id ?? null)} />

      {/* ---------------- KPI row ---------------- */}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Today's revenue"
          value={formatCurrency(data.kpi.revenue)}
          icon={<TrendingUp />}
          delta={data.revenueDelta}
          deltaLabel="vs yesterday"
        />
        <StatCard
          label="Today's appointments"
          value={formatNumber(data.kpi.appointmentsTotal)}
          icon={<CalendarDays />}
          delta={data.appointmentsDelta}
          deltaLabel="vs yesterday"
        />
        <StatCard
          label="Total customers"
          value={formatNumber(data.totalCustomers)}
          icon={<Users />}
          hint="Across the current view"
          to="/admin/customers"
        />
        <StatCard
          label="Active staff"
          value={formatNumber(data.activeStaff.length)}
          icon={<UserSquare2 />}
          hint={`${data.onDutyToday.length} on duty today`}
          to="/admin/staff"
        />
        <StatCard
          label="Pending"
          value={formatNumber(data.kpi.appointmentsPending)}
          icon={<CalendarClock />}
          hint="Awaiting confirmation"
          tone={data.kpi.appointmentsPending > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Completed today"
          value={formatNumber(data.kpi.appointmentsCompleted)}
          icon={<CheckCircle2 />}
          hint="Services delivered"
          tone="ok"
        />
        <StatCard
          label="Low stock items"
          value={formatNumber(data.lowStock.length)}
          icon={<PackageX />}
          hint="At or below minimum"
          tone={data.lowStock.length > 0 ? 'danger' : 'default'}
          to="/admin/inventory"
        />
        <StatCard
          label="Average bill"
          value={formatCurrency(data.kpi.averageBill)}
          icon={<Wallet />}
          hint={`${data.kpi.bills} ${data.kpi.bills === 1 ? 'bill' : 'bills'} today`}
        />
      </div>

      {/* ---------------- Revenue + alerts ---------------- */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Revenue"
            description={isAllShops ? 'All branches combined' : shop?.name}
            action={
              <Tabs
                variant="pill"
                items={RANGE_TABS}
                value={range}
                onChange={setRange}
                label="Revenue period"
              />
            }
          />
          <RevenueAreaChart
            className="mt-4"
            data={chart}
            xKey="label"
            series={[{ key: 'revenue', label: 'Revenue' }]}
            emptyMessage="No sales recorded in this period yet"
          />
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Needs attention" description="Things worth a look right now" />

          {alerts.length === 0 ? (
            <EmptyState
              compact
              icon={<CheckCircle2 />}
              title="Nothing needs attention"
              description="Stock is healthy and every booking is confirmed."
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <Link
                    to={alert.to}
                    className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition-colors hover:border-subtle hover:bg-canvas"
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4 ${
                        alert.tone === 'danger'
                          ? 'bg-danger-soft text-danger'
                          : alert.tone === 'warn'
                            ? 'bg-warn-soft text-warn'
                            : 'bg-info-soft text-info'
                      }`}
                      aria-hidden
                    >
                      {alert.icon}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
                      {alert.text}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-4">
            <QuickAction to="/admin/appointments?new=1" icon={<CalendarDays />} label="Book" />
            <QuickAction to="/admin/customers?new=1" icon={<UserPlus />} label="Customer" />
            <QuickAction to="/admin/billing" icon={<Wallet />} label="New sale" />
            <QuickAction to="/admin/services?new=1" icon={<Scissors />} label="Service" />
          </div>
        </Card>
      </div>

      {/* ---------------- Today's diary ---------------- */}
      <Card className="mt-4" flush>
        <div className="px-5 pt-5">
          <CardHeader
            title="Today's appointments"
            description={`${data.todayRows.length} booked`}
            action={
              <Link
                to="/admin/appointments"
                className="text-sm font-medium text-brand hover:underline"
              >
                View diary
              </Link>
            }
          />
        </div>

        <div className="px-3 pb-2 pt-2 sm:px-4">
          <TodayTimeline rows={data.todayRows} basePath="/admin" />
        </div>
      </Card>

      {/* ---------------- Comparison + popularity ---------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {isAllShops && (
          <Card>
            <CardHeader title="Revenue by shop" description="Branch comparison for this period" />
            <SimpleBarChart
              className="mt-4"
              height={240}
              data={shopRows.map((row) => ({ name: row.name, revenue: row.revenue }))}
              xKey="name"
              series={[{ key: 'revenue', label: 'Revenue' }]}
            />
          </Card>
        )}

        <Card>
          <CardHeader title="Popular services" description="By bookings in this period" />
          {services.length === 0 ? (
            <EmptyState compact title="No services booked in this period" />
          ) : (
            <ul className="mt-3 space-y-2.5">
              {services.map((service, index) => {
                const max = services[0]?.bookings || 1;
                return (
                  <li key={service.serviceId}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-ink">
                        <span className="mr-1.5 text-xs tabular-nums text-subtle">{index + 1}.</span>
                        {service.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {service.bookings} · {formatCurrency(service.revenue, { compact: true })}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(service.bookings / max) * 100}%` }}
                        aria-hidden
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className={isAllShops ? 'lg:col-span-2' : ''}>
          <CardHeader title="Staff performance" description="Completed work in this period" />
          {staffRows.length === 0 ? (
            <EmptyState compact title="No completed work in this period" />
          ) : (
            <div className="-mx-5 mt-3 overflow-x-auto px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      Stylist
                    </th>
                    <th scope="col" className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      Done
                    </th>
                    <th scope="col" className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      Revenue
                    </th>
                    <th scope="col" className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      Commission
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {staffRows.map((row) => (
                    <tr key={row.staffId}>
                      <td className="py-2.5">
                        <Link
                          to={`/admin/staff/${row.staffId}`}
                          className="flex items-center gap-2.5 hover:underline"
                        >
                          <Avatar name={row.name} size="xs" />
                          <span className="min-w-0">
                            <span className="block truncate text-ink">{row.name}</span>
                            <span className="block truncate text-xs text-subtle">{row.role}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-ink">{row.completed}</td>
                      <td className="py-2.5 text-right tabular-nums text-ink">
                        {formatCurrency(row.revenue, { compact: true })}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted">
                        {formatCurrency(row.commission, { compact: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ---------------- Recent activity ---------------- */}
      <Card className="mt-4">
        <CardHeader
          title="Latest activity"
          action={
            <Link to="/admin/notifications" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          }
        />
        <ul className="mt-3 divide-y divide-line">
          {db.notifications
            .filter((n) => shopId === null || n.shopId === shopId)
            .slice(0, 6)
            .map((notification) => (
              <li key={notification.id} className="flex items-start gap-3 py-2.5">
                <Badge
                  tone={
                    notification.severity === 'success'
                      ? 'ok'
                      : notification.severity === 'danger'
                        ? 'danger'
                        : notification.severity === 'warning'
                          ? 'warn'
                          : 'info'
                  }
                  dot
                >
                  {notification.title}
                </Badge>
                <p className="min-w-0 flex-1 truncate text-[13px] text-muted">{notification.message}</p>
                <span className="shrink-0 text-[11px] text-subtle">
                  {formatRelative(notification.createdAt)}
                </span>
              </li>
            ))}
        </ul>
      </Card>
    </>
  );
}

function QuickAction({
  to,
  icon,
  label,
}: {
  to: string;
  icon: JSX.Element;
  label: string;
}): JSX.Element {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-line px-2 py-3 text-center transition-colors hover:border-brand hover:bg-brand-soft"
    >
      <span className="text-brand [&>svg]:h-[18px] [&>svg]:w-[18px]" aria-hidden>
        {icon}
      </span>
      <span className="text-xs font-medium text-ink">{label}</span>
    </Link>
  );
}

export default AdminDashboard;
