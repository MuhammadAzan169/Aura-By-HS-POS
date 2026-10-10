import { useDeleteAction } from '@/hooks/useDeleteAction';
import * as deleteService from '@/services/deleteService';
import { useMemo, useState } from 'react';
import { Clock, Gift, Pencil, Plus, Tag } from 'lucide-react';
import type { ServicePackage } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDuration } from '@/utils/date';
import { matches } from '@/utils/text';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import { packageStats } from '@/services/catalogService';
import * as catalogService from '@/services/catalogService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterBar } from '@/components/ui/FilterBar';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { PackageFormModal } from './PackageFormModal';

export function PackagesPage(): JSX.Element {
  const db = useDb();
  const confirm = useConfirm();
  const del = useDeleteAction();

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ServicePackage | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const visible = useMemo(
    () =>
      db.packages.filter((pkg) => {
        if (!showInactive && !pkg.active) return false;
        return matches(pkg.name, search) || matches(pkg.description, search);
      }),
    [db.packages, showInactive, search],
  );

  const toggle = useAsyncAction(
    async (pkg: ServicePackage) => {
      await catalogService.setPackageActive(pkg.id, !pkg.active);
      return pkg;
    },
    { successMessage: (pkg) => (pkg.active ? `${pkg.name} was deactivated.` : `${pkg.name} is live.`) },
  );

  const onToggle = async (pkg: ServicePackage): Promise<void> => {
    if (pkg.active) {
      const result = await confirm({
        title: `Deactivate ${pkg.name}?`,
        description: 'It will no longer be sellable at the till.',
        confirmLabel: 'Deactivate',
        tone: 'warning',
      });
      if (!result.confirmed) return;
    }
    await toggle.run(pkg);
  };

  return (
    <>
      <PageHeader
        title="Packages"
        description="Bundles of services sold at a single price. Savings are calculated automatically."
        actions={
          <Button
            leftIcon={<Plus />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New package
          </Button>
        }
      />

      <Card className="mb-4">
        <FilterBar
          activeCount={search ? 1 : 0}
          onClear={() => setSearch('')}
          trailing={
            <Switch
              checked={showInactive}
              onChange={setShowInactive}
              label="Show inactive"
              srLabel="Show inactive packages"
            />
          }
        >
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search packages…"
            className="w-full sm:w-72"
            label="Search packages"
          />
        </FilterBar>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Gift />}
            title="No packages yet"
            description="Bundle a few services together to offer a better price."
            action={
              <Button
                size="sm"
                leftIcon={<Plus />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                New package
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((pkg) => {
            const stats = packageStats(pkg);

            return (
              <Card key={pkg.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
                      {pkg.name}
                      {!pkg.active && <Badge tone="neutral">Inactive</Badge>}
                    </h3>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted">{pkg.description}</p>
                  </div>

                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
                    aria-hidden
                  >
                    <Gift className="h-[18px] w-[18px]" />
                  </span>
                </div>

                {/* Members */}
                <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                  {pkg.items.map((item) => {
                    const service = db.services.find((s) => s.id === item.serviceId);
                    return (
                      <li
                        key={item.serviceId}
                        className="flex items-baseline justify-between gap-2 text-[13px]"
                      >
                        <span className="min-w-0 truncate text-ink">
                          {service?.name ?? 'Removed service'}
                          {item.quantity > 1 && (
                            <span className="text-subtle"> ×{item.quantity}</span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-subtle">
                          {service ? formatCurrency(service.price * item.quantity) : '—'}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* Pricing */}
                <div className="mt-3 rounded-xl bg-canvas p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted">Individually</span>
                    <span className="text-[13px] tabular-nums text-muted line-through">
                      {formatCurrency(stats.individualTotal)}
                    </span>
                  </div>

                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-sm font-medium text-ink">Package price</span>
                    <span className="font-display text-xl font-semibold tabular-nums text-ink">
                      {formatCurrency(pkg.price)}
                    </span>
                  </div>

                  {stats.savings > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2">
                      <Tag className="h-3.5 w-3.5 text-ok" aria-hidden />
                      <span className="text-xs font-medium text-ok">
                        Saves {formatCurrency(stats.savings)} ({stats.savingsPct.toFixed(0)}%)
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <span className="inline-flex items-center gap-1 text-xs text-muted">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {formatDuration(stats.durationMin)}
                  </span>

                  <div className="ml-auto flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Pencil />}
                      onClick={() => {
                        setEditing(pkg);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void onToggle(pkg)}>
                      {pkg.active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void del({
                          title: `Delete ${pkg.name}?`,
                          run: () => deleteService.deletePackage(pkg.id),
                          done: `${pkg.name} deleted.`,
                        })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PackageFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        servicePackage={editing}
      />
    </>
  );
}

export default PackagesPage;
