import { FrontDeskAlerts } from './components/FrontDeskAlerts';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Coffee,
  PackageX,
  Plus,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/money';
import { formatClock, formatDate } from '@/utils/date';
import { useShopScope } from '@/hooks/useShopScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StockBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { stockStatus } from '@/services/inventoryService';
import { useDashboardData } from './useDashboardData';
import { NextUpCard, TodayTimeline } from './components/TodayTimeline';

/**
 * The branch view. Deliberately narrower than the owner's dashboard: what is
 * happening today, what is next, and the three buttons the front desk presses
 * all day.
 */
export function ShopDashboard(): JSX.Element {
  const data = useDashboardData();
  const { shop } = useShopScope();

  const weekday = data.today.getDay();

  return (
    <>
      <PageHeader
        title={shop?.name ?? 'Your branch'}
        description={formatDate(data.today)}
      />

      {/* ---------------- Big quick actions ---------------- */}
      <div className="grid grid-cols-3 gap-3">
        <QuickTile
          to="/shop/appointments?new=1"
          icon={<CalendarDays />}
          label="New appointment"
          primary
        />
        <QuickTile to="/shop/billing" icon={<Wallet />} label="New sale" primary />
        <QuickTile to="/shop/customers?new=1" icon={<UserPlus />} label="New customer" primary />
      </div>

      <FrontDeskAlerts shopId={shop?.id ?? null} />

      {/* ---------------- Today at a glance ---------------- */}
      <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Today's sales"
          value={formatCurrency(data.kpi.revenue)}
          icon={<Wallet />}
          delta={data.revenueDelta}
          deltaLabel="vs yesterday"
        />
        <StatCard
          label="Appointments today"
          value={formatNumber(data.kpi.appointmentsTotal)}
          icon={<CalendarDays />}
          hint={`${data.upcomingToday.length} still to come`}
        />
        <StatCard
          label="Completed today"
          value={formatNumber(data.kpi.appointmentsCompleted)}
          icon={<CheckCircle2 />}
          tone="ok"
          hint="Services delivered"
        />
        <StatCard
          label="Low stock"
          value={formatNumber(data.lowStock.length)}
          icon={<PackageX />}
          tone={data.lowStock.length > 0 ? 'danger' : 'default'}
          hint="Needs reordering"
          to="/shop/inventory"
        />
      </div>

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* ---------------- Diary ---------------- */}
        <Card flush className="order-2 min-w-0 lg:order-1">
          <div className="px-5 pt-5">
            <CardHeader
              title="Today's appointments"
              description={`${data.todayRows.length} booked`}
              action={
                <Link
                  to="/shop/appointments"
                  className="text-sm font-medium text-brand hover:underline"
                >
                  Open diary
                </Link>
              }
            />
          </div>

          <div className="px-3 pb-3 pt-2 sm:px-4">
            <TodayTimeline
              rows={data.todayRows}
              basePath="/shop"
              emptyAction={
                <Link
                  to="/shop/appointments?new=1"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-ink"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Book someone in
                </Link>
              }
            />
          </div>
        </Card>

        <div className="order-1 min-w-0 space-y-4 lg:order-2">
          <NextUpCard row={data.nextUp} basePath="/shop" />

          {/* ---------------- Who's in today ---------------- */}
          <Card>
            <CardHeader title="On duty today" description={`${data.onDutyToday.length} rostered`} />

            {data.onDutyToday.length === 0 ? (
              <EmptyState compact icon={<Coffee />} title="Nobody is rostered today" />
            ) : (
              <ul className="mt-3 space-y-2.5">
                {data.onDutyToday.map((member) => {
                  const shift = member.schedule.find((s) => s.weekday === weekday);
                  const booked = data.todayRows.filter(
                    (row) => row.appointment.staffId === member.id,
                  ).length;

                  return (
                    <li key={member.id} className="flex items-center gap-3">
                      <Avatar name={member.name} src={member.photoUrl} size="sm" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{member.name}</p>
                        <p className="truncate text-xs text-muted">
                          {shift ? `${formatClock(shift.start)} – ${formatClock(shift.end)}` : member.role}
                        </p>
                      </div>

                      <Badge tone={booked > 0 ? 'brand' : 'neutral'}>
                        {booked} {booked === 1 ? 'booking' : 'bookings'}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* ---------------- Stock warnings ---------------- */}
          {data.lowStock.length > 0 && (
            <Card>
              <CardHeader
                title="Stock alerts"
                action={
                  <Link
                    to="/shop/inventory"
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Manage
                  </Link>
                }
              />

              <ul className="mt-3 space-y-2">
                {data.lowStock.slice(0, 5).map((product) => (
                  <li key={product.id} className="flex items-center gap-3">
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warn-soft text-warn"
                      aria-hidden
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{product.name}</p>
                      <p className="truncate text-xs text-muted">
                        {product.stock} of {product.minStock} minimum
                      </p>
                    </div>

                    <StockBadge status={stockStatus(product)} />
                  </li>
                ))}
              </ul>

              {data.lowStock.length > 5 && (
                <p className="mt-3 text-xs text-subtle">
                  and {data.lowStock.length - 5} more item
                  {data.lowStock.length - 5 === 1 ? '' : 's'}.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function QuickTile({
  to,
  icon,
  label,
  primary,
}: {
  to: string;
  icon: JSX.Element;
  label: string;
  primary?: boolean;
}): JSX.Element {
  return (
    <Link
      to={to}
      className={
        primary
          ? 'flex flex-col items-center justify-center gap-2 rounded-2xl bg-brand px-3 py-5 text-center text-brand-ink shadow-card transition-transform active:scale-[0.98]'
          : 'flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-3 py-5 text-center'
      }
    >
      <span className="[&>svg]:h-6 [&>svg]:w-6" aria-hidden>
        {icon}
      </span>
      <span className="text-[13px] font-medium leading-tight">{label}</span>
    </Link>
  );
}

export default ShopDashboard;
