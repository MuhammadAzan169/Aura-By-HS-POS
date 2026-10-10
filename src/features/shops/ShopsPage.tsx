import { useDeleteAction } from '@/hooks/useDeleteAction';
import * as deleteService from '@/services/deleteService';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, Phone, Plus, Store, Users } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/money';
import { formatDate } from '@/utils/date';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import * as shopService from '@/services/shopService';
import { summarise } from '@/services/shopService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { ShopFormModal } from './ShopFormModal';

export function ShopsPage(): JSX.Element {
  const db = useDb();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const del = useDeleteAction();
  const [formOpen, setFormOpen] = useState(false);

  const rows = useMemo(() => summarise(), [db]);

  const totals = useMemo(
    () => ({
      shops: rows.length,
      active: rows.filter((r) => r.shop.active).length,
      todayRevenue: rows.reduce((sum, r) => sum + r.todayRevenue, 0),
      staff: rows.reduce((sum, r) => sum + r.staffCount, 0),
    }),
    [rows],
  );

  const toggle = useAsyncAction(
    async (shopId: string, active: boolean) => shopService.setActive(shopId, active),
    {
      successMessage: (shop) =>
        shop.active
          ? `${shop.name} is open for business again.`
          : `${shop.name} was deactivated, along with its login.`,
    },
  );

  const onToggle = async (shopId: string, name: string, active: boolean): Promise<void> => {
    if (active) {
      const result = await confirm({
        title: `Deactivate ${name}?`,
        description:
          'The branch login is suspended immediately and nobody at that shop can sign in. Its data is kept.',
        confirmLabel: 'Deactivate branch',
        tone: 'danger',
        typeToConfirm: name,
      });
      if (!result.confirmed) return;
    }
    await toggle.run(shopId, !active);
  };

  return (
    <>
      <PageHeader
        title="Shops"
        description="Every branch, its login account, and how it is trading today."
        actions={
          <Button leftIcon={<Plus />} onClick={() => setFormOpen(true)}>
            Add a shop
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Branches" value={totals.shops} icon={<Store />} hint={`${totals.active} active`} />
        <StatCard label="Revenue today" value={formatCurrency(totals.todayRevenue, { compact: true })} />
        <StatCard label="Team members" value={totals.staff} icon={<Users />} />
        <StatCard
          label="Customers"
          value={rows.reduce((sum, r) => sum + r.customerCount, 0)}
          hint="Across all branches"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ shop, todayRevenue, monthRevenue, todayAppointments, staffCount, customerCount }) => {
          const account = shopService.accountFor(shop.id);

          return (
            <Card key={shop.id} className={cn('flex flex-col', !shop.active && 'opacity-70')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
                    <span className="truncate">{shop.name}</span>
                    {!shop.active && <Badge tone="neutral">Inactive</Badge>}
                  </h3>
                  <p className="mt-0.5 font-mono text-xs text-subtle">{shop.code}</p>
                </div>

                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"
                  aria-hidden
                >
                  <Building2 className="h-5 w-5" />
                </span>
              </div>

              <address className="mt-3 space-y-1.5 not-italic">
                <p className="flex items-start gap-2 text-[13px] text-muted">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    {shop.addressLine}, {shop.city}
                  </span>
                </p>
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {shop.phone}
                </p>
              </address>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
                <Metric label="Today" value={formatCurrency(todayRevenue, { compact: true })} />
                <Metric label="This month" value={formatCurrency(monthRevenue, { compact: true })} />
                <Metric label="Appointments today" value={String(todayAppointments)} />
                <Metric label="Staff" value={String(staffCount)} />
              </dl>

              <div className="mt-3 rounded-xl bg-canvas px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                  Manager & login
                </p>
                <p className="mt-0.5 truncate text-[13px] text-ink">{shop.managerName}</p>
                <p className="truncate font-mono text-xs text-muted">{account?.email ?? '—'}</p>
              </div>

              <p className="mt-3 text-xs text-subtle">
                {customerCount} customers · open since {formatDate(shop.openedOn)}
              </p>

              <div className="mt-3 flex gap-2 border-t border-line pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={() => navigate(`/admin/shops/${shop.id}`)}
                >
                  View details
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={toggle.pending}
                  onClick={() => void onToggle(shop.id, shop.name, shop.active)}
                >
                  {shop.active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void del({
                      title: `Delete ${shop.name}?`,
                      description: 'Only a branch with no bills, bookings, customers or logins can be deleted.',
                      run: () => deleteService.deleteShop(shop.id),
                      done: `${shop.name} deleted.`,
                    })
                  }
                >
                  Delete
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <ShopFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export default ShopsPage;
