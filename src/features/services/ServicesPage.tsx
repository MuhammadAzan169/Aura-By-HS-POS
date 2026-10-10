import { ImportModal } from '@/components/shared/ImportModal';
import * as importService from '@/services/importService';
import { FileUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Pencil, Plus, Scissors, Users } from 'lucide-react';
import type { Service } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDuration } from '@/utils/date';
import { matches } from '@/utils/text';
import { useDb } from '@/hooks/useDb';
import { useDebounce } from '@/hooks/useDebounce';
import { useTableState } from '@/hooks/useTableState';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import { useAuthStore } from '@/store/authStore';
import { useShopScope } from '@/hooks/useShopScope';
import * as catalogService from '@/services/catalogService';
import { effectivePrice } from '@/services/catalogService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterBar, FilterChips } from '@/components/ui/FilterBar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, ActiveBadge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { ServiceFormModal } from './ServiceFormModal';

export function ServicesPage(): JSX.Element {
  const db = useDb();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const { shopId } = useShopScope();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();

  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const debounced = useDebounce(search);

  useEffect(() => {
    if (isAdmin && params.get('new') === '1') {
      setEditing(null);
      setFormOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams, isAdmin]);

  const categories = useMemo(
    () => db.serviceCategories.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [db.serviceCategories],
  );

  const filtered = useMemo(
    () =>
      db.services.filter((service) => {
        if (!showInactive && !service.active) return false;
        if (category !== 'all' && service.categoryId !== category) return false;
        if (debounced && !matches(service.name, debounced) && !matches(service.description, debounced)) {
          return false;
        }
        return true;
      }),
    [db.services, showInactive, category, debounced],
  );

  const table = useTableState(filtered, {
    initialPageSize: 12,
    initialSortKey: 'name',
    accessors: {
      name: (s) => s.name,
      category: (s) => categories.find((c) => c.id === s.categoryId)?.name ?? '',
      duration: (s) => s.durationMin,
      price: (s) => effectivePrice(s),
    },
  });

  /** How many stylists in scope can actually perform a service. */
  const qualifiedCount = (serviceId: string): number =>
    db.staff.filter(
      (s) =>
        s.active &&
        s.specializations.includes(serviceId) &&
        (shopId === null || s.shopId === shopId),
    ).length;

  const toggleActive = useAsyncAction(
    async (service: Service) => catalogService.setServiceActive(service.id, !service.active),
    {
      successMessage: (updated) =>
        updated.active ? `${updated.name} is now bookable.` : `${updated.name} was disabled.`,
    },
  );

  const onToggle = async (service: Service): Promise<void> => {
    if (service.active) {
      const result = await confirm({
        title: `Disable ${service.name}?`,
        description:
          'It will no longer appear in booking or billing. Existing appointments are unaffected.',
        confirmLabel: 'Disable service',
        tone: 'warning',
      });
      if (!result.confirmed) return;
    }
    await toggleActive.run(service);
  };

  const columns: Column<Service>[] = [
    {
      key: 'name',
      header: 'Service',
      sortable: true,
      mobilePrimary: true,
      render: (service) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
            {service.name}
            {!service.active && <Badge tone="neutral">Disabled</Badge>}
          </p>
          <p className="truncate text-xs text-muted">{service.description}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (service) => (
        <Badge tone="brand">
          {categories.find((c) => c.id === service.categoryId)?.name ?? '—'}
        </Badge>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      sortable: true,
      align: 'right',
      render: (service) => (
        <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {formatDuration(service.durationMin)}
        </span>
      ),
    },
    {
      key: 'staff',
      header: 'Qualified staff',
      align: 'right',
      hideBelowLg: true,
      render: (service) => {
        const count = qualifiedCount(service.id);
        return (
          <span
            className={
              count === 0
                ? 'inline-flex items-center gap-1 text-sm text-danger'
                : 'inline-flex items-center gap-1 text-sm tabular-nums text-muted'
            }
            title={count === 0 ? 'Nobody can perform this service' : undefined}
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            {count}
          </span>
        );
      },
    },
    {
      key: 'price',
      header: 'Price',
      sortable: true,
      align: 'right',
      render: (service) => (
        <div>
          <p className="text-sm font-semibold tabular-nums text-ink">
            {formatCurrency(effectivePrice(service))}
          </p>
          {service.discountPct > 0 && (
            <p className="text-xs tabular-nums text-subtle line-through">
              {formatCurrency(service.price)}
            </p>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Services"
        description={
          isAdmin
            ? 'One catalogue shared by every branch. Price changes apply immediately to new bookings and bills.'
            : 'The service menu for your branch. Prices are set by the owner.'
        }
        actions={
          isAdmin ? (
            <>
            <Button variant="outline" leftIcon={<FileUp />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button
              leftIcon={<Plus />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              New service
            </Button>
            </>
          ) : undefined
        }
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import services"
        description="Load your full service menu from Excel. New categories are created automatically."
        columns={importService.SERVICE_COLUMNS}
        templateName="services-import-template"
        onImport={(rows) => importService.importServices(rows)}
      />

      <Card className="mb-4">
        <FilterBar
          activeCount={(category !== 'all' ? 1 : 0) + (debounced ? 1 : 0)}
          onClear={() => {
            setSearch('');
            setCategory('all');
          }}
          trailing={
            <Switch
              checked={showInactive}
              onChange={setShowInactive}
              srLabel="Show disabled services"
              label="Show disabled"
            />
          }
        >
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search services…"
            className="w-full sm:w-72"
            label="Search services"
          />

          <FilterChips
            label="Service category"
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: 'All', count: db.services.filter((s) => s.active).length },
              ...categories.map((c) => ({
                value: c.id,
                label: c.name,
                count: db.services.filter((s) => s.categoryId === c.id && s.active).length,
              })),
            ]}
          />
        </FilterBar>
      </Card>

      <DataTable
        columns={columns}
        table={table}
        rowKey={(service) => service.id}
        onRowClick={
          isAdmin
            ? (service) => {
                setEditing(service);
                setFormOpen(true);
              }
            : undefined
        }
        caption="Services"
        empty={{
          title: 'No services match',
          description: 'Try a different category or search term.',
          icon: <Scissors />,
        }}
        rowActions={
          isAdmin
            ? (service) => (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Pencil />}
                    onClick={() => {
                      setEditing(service);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void onToggle(service)}>
                    {service.active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              )
            : (service) => <ActiveBadge active={service.active} />
        }
      />

      {isAdmin && (
        <ServiceFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          service={editing}
        />
      )}
    </>
  );
}

export default ServicesPage;
