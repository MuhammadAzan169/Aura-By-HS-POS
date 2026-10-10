import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { KeyRound, MapPin, Pencil, Phone, Store, Users, Wallet } from 'lucide-react';
import { formatCurrency } from '@/utils/money';
import { formatClock, formatDate, WEEKDAY_LABELS } from '@/utils/date';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import * as shopService from '@/services/shopService';
import { loginLabel, setPassword } from '@/services/loginService';
import { Input } from '@/components/ui/Input';
import { periodFor, revenueSeries, shopComparison } from '@/services/reportService';
import { performance as staffPerformance } from '@/services/staffService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, ActiveBadge } from '@/components/ui/Badge';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { ErrorState, EmptyState } from '@/components/ui/States';
import { RevenueAreaChart } from '@/components/ui/Chart';
import { ShopFormModal } from './ShopFormModal';

export function ShopDetailPage(): JSX.Element {
  const { shopId } = useParams<{ shopId: string }>();
  const db = useDb();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'profile' | 'staff' | 'performance' | 'account'>('profile');
  const [newPassword, setNewPassword] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const shop = db.shops.find((s) => s.id === shopId);

  const data = useMemo(() => {
    if (!shop) return null;

    const month = periodFor('month');
    const comparison = shopComparison(month).find((row) => row.shopId === shop.id);

    return {
      comparison,
      series: revenueSeries(shop.id, month, 'day'),
      staff: db.staff.filter((s) => s.shopId === shop.id),
      performance: staffPerformance(shop.id).sort((a, b) => b.revenue - a.revenue),
      account: shopService.accountFor(shop.id),
      customers: db.customers.filter((c) => c.shopId === shop.id).length,
      products: db.products.filter((p) => p.shopId === shop.id && p.active).length,
    };
  }, [shop, db]);

  const reset = useAsyncAction(
    async (email: string) => {
      await setPassword(email, newPassword);
      setNewPassword('');
    },
    { successMessage: 'Password changed. The branch signs in with it from now on.' },
  );

  if (!shop || !data) {
    return (
      <Card>
        <ErrorState
          title="Branch not found"
          message="That shop may have been removed."
          onRetry={() => navigate('/admin/shops')}
        />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Shops', to: '/admin/shops' }, { label: shop.name }]}
        title={shop.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone="brand">{shop.code}</Badge>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {shop.addressLine}, {shop.city}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {shop.phone}
            </span>
            <ActiveBadge active={shop.active} />
          </span>
        }
        actions={
          <Button variant="outline" leftIcon={<Pencil />} onClick={() => setEditOpen(true)}>
            Edit branch
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Revenue this month"
          value={formatCurrency(data.comparison?.revenue ?? 0, { compact: true })}
          icon={<Wallet />}
        />
        <StatCard
          label="Net profit"
          value={formatCurrency(data.comparison?.profit ?? 0, { compact: true })}
          hint={`${formatCurrency(data.comparison?.expenses ?? 0, { compact: true })} expenses`}
          tone={(data.comparison?.profit ?? 0) >= 0 ? 'ok' : 'danger'}
        />
        <StatCard
          label="Team"
          value={data.staff.filter((s) => s.active).length}
          icon={<Users />}
          hint={`${data.customers} customers`}
        />
        <StatCard
          label="Completion rate"
          value={`${(data.comparison?.completionRate ?? 0).toFixed(0)}%`}
          hint={`${data.comparison?.appointments ?? 0} appointments`}
        />
      </div>

      <Tabs
        className="mb-4"
        label="Branch sections"
        value={tab}
        onChange={(next) => setTab(next as typeof tab)}
        items={[
          { value: 'profile', label: 'Profile & hours' },
          { value: 'staff', label: 'Team', count: data.staff.length },
          { value: 'performance', label: 'Performance' },
          { value: 'account', label: 'Login account' },
        ]}
      />

      {/* ---------------- Profile ---------------- */}
      <TabPanel active={tab === 'profile'}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Branch details" />

            <dl className="mt-3 divide-y divide-line text-sm">
              <Row label="Name" value={shop.name} />
              <Row label="Receipt code" value={shop.code} />
              <Row label="Address" value={`${shop.addressLine}, ${shop.city}`} />
              <Row label="Phone" value={shop.phone} />
              <Row label="Email" value={shop.email} />
              <Row label="Manager" value={shop.managerName} />
              <Row label="Opened" value={formatDate(shop.openedOn)} />
              <Row label="Products stocked" value={String(data.products)} />
            </dl>

            <div className="mt-4 rounded-xl bg-canvas px-3.5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                Receipt footer
              </p>
              <p className="mt-1 text-[13px] text-ink">{shop.receiptFooter}</p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Opening hours"
              description="The outer limit on what can be booked"
            />

            <ul className="mt-3 divide-y divide-line">
              {shop.businessHours.map((day) => (
                <li key={day.weekday} className="flex items-center justify-between py-2.5">
                  <span className="text-[13px] font-medium text-ink">
                    {WEEKDAY_LABELS[day.weekday]}
                  </span>

                  {day.closed ? (
                    <Badge tone="neutral">Closed</Badge>
                  ) : (
                    <span className="text-[13px] tabular-nums text-muted">
                      {formatClock(day.open)} – {formatClock(day.close)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </TabPanel>

      {/* ---------------- Staff ---------------- */}
      <TabPanel active={tab === 'staff'}>
        <Card flush>
          {data.staff.length === 0 ? (
            <EmptyState title="Nobody works here yet" description="Add team members from the Staff page." />
          ) : (
            <ul className="divide-y divide-line">
              {data.staff.map((member) => (
                <li key={member.id}>
                  <Link
                    to={`/admin/staff/${member.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                  >
                    <Avatar name={member.name} src={member.photoUrl} size="sm" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{member.name}</p>
                      <p className="truncate text-xs text-muted">{member.role}</p>
                    </div>

                    <span className="hidden text-xs text-muted sm:block">
                      {member.specializations.length} services
                    </span>

                    <ActiveBadge active={member.active} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </TabPanel>

      {/* ---------------- Performance ---------------- */}
      <TabPanel active={tab === 'performance'}>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Revenue this month" description="Daily takings at this branch" />
            <RevenueAreaChart
              className="mt-4"
              data={data.series}
              xKey="label"
              series={[{ key: 'revenue', label: 'Revenue' }]}
            />
          </Card>

          <Card>
            <CardHeader title="Team performance" description="All-time, from completed bills" />

            {data.performance.length === 0 ? (
              <EmptyState compact title="No completed work yet" />
            ) : (
              <div className="-mx-5 mt-3 overflow-x-auto px-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th scope="col" className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                        Stylist
                      </th>
                      <th scope="col" className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-subtle">
                        Completed
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
                    {data.performance.map((row) => (
                      <tr key={row.staffId}>
                        <td className="py-2.5">
                          <Link to={`/admin/staff/${row.staffId}`} className="hover:underline">
                            {row.name}
                          </Link>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{row.completed}</td>
                        <td className="py-2.5 text-right tabular-nums">
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
      </TabPanel>

      {/* ---------------- Account ---------------- */}
      <TabPanel active={tab === 'account'}>
        <Card className="max-w-xl">
          <CardHeader
            title="Branch login"
            description="What this shop uses to sign in to their own portal"
          />

          {data.account ? (
            <>
              <dl className="mt-4 divide-y divide-line text-sm">
                <Row label="Account name" value={data.account.name} />
                <Row label="Username" value={loginLabel(data.account.email)} />
                <Row label="Role" value="Shop (single branch)" />
                <Row
                  label="Last signed in"
                  value={data.account.lastLoginAt ? formatDate(data.account.lastLoginAt) : 'Never'}
                />
                <Row label="Status" value={data.account.active ? 'Active' : 'Suspended'} />
              </dl>

              <div className="mt-4 rounded-xl border border-line p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn"
                    aria-hidden
                  >
                    <KeyRound className="h-[18px] w-[18px]" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">Set a new password</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Branch staff cannot change their own password — only you can. Tell them the new
                      one in person. More logins for this branch: Users & logins.
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Input
                    label="New password"
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    leftIcon={<KeyRound />}
                    loading={reset.pending}
                    disabled={newPassword.length < 6}
                    onClick={() => void reset.run(data.account!.email)}
                  >
                    Save password
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              compact
              icon={<Store />}
              title="No login account"
              description="This branch has no sign-in account attached."
            />
          )}
        </Card>
      </TabPanel>

      <ShopFormModal open={editOpen} onClose={() => setEditOpen(false)} shop={shop} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{value}</dd>
    </div>
  );
}

export default ShopDetailPage;
