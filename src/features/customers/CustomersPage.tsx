import { downloadExcel } from '@/utils/excel';
import { ImportModal } from '@/components/shared/ImportModal';
import * as importService from '@/services/importService';
import { FileUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Download, Plus, Users } from 'lucide-react';
import type { Customer } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDate, formatFriendlyDateTime } from '@/utils/date';
import { matches } from '@/utils/text';
import { timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useDebounce } from '@/hooks/useDebounce';
import { useTableState } from '@/hooks/useTableState';
import { statsFor } from '@/services/customerService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { CustomerFormModal } from './CustomerFormModal';

interface Row {
  customer: Customer;
  stats: ReturnType<typeof statsFor>;
}

export function CustomersPage(): JSX.Element {
  const db = useDb();
  const { shopId, isAllShops } = useShopScope();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();

  const basePath = pathname.startsWith('/admin') ? '/admin' : '/shop';

  const [search, setSearch] = useState('');
  const [membership, setMembership] = useState('all');
  const [activity, setActivity] = useState<'all' | 'active' | 'inactive' | 'new' | 'lapsed'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const debounced = useDebounce(search);

  useEffect(() => {
    if (params.get('new') === '1') {
      setFormOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const rows: Row[] = useMemo(
    () =>
      db.customers
        .filter((c) => shopId === null || c.shopId === shopId)
        .map((customer) => ({ customer, stats: statsFor(customer.id) })),
    // `db` recomputes the derived stats after any sale or booking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, shopId],
  );

  const filtered = useMemo(() => {
    const ninetyDaysAgo = Date.now() - 90 * 86400000;
    const thirtyDaysAgo = Date.now() - 30 * 86400000;

    return rows.filter(({ customer, stats }) => {
      if (membership !== 'all') {
        if (membership === 'none' && stats.membershipLabel) return false;
        if (membership !== 'none' && stats.membershipLabel !== membership) return false;
      }

      if (activity === 'active' && !customer.active) return false;
      if (activity === 'inactive' && customer.active) return false;
      if (activity === 'new' && new Date(customer.createdAt).getTime() < thirtyDaysAgo) return false;
      if (activity === 'lapsed') {
        const last = stats.lastVisitAt ? new Date(stats.lastVisitAt).getTime() : 0;
        if (last > ninetyDaysAgo) return false;
      }

      if (debounced) {
        const hay = [customer.name, customer.phone, customer.email];
        if (!hay.some((value) => matches(value, debounced))) return false;
      }

      return true;
    });
  }, [rows, membership, activity, debounced]);

  const table = useTableState(filtered, {
    initialPageSize: 12,
    initialSortKey: 'name',
    accessors: {
      name: (row) => row.customer.name,
      phone: (row) => row.customer.phone,
      visits: (row) => row.stats.totalVisits,
      spent: (row) => row.stats.totalSpent,
      lastVisit: (row) => row.stats.lastVisitAt ?? '',
      membership: (row) => row.stats.membershipLabel ?? '',
    },
  });

  const summary = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    return {
      total: rows.length,
      withMembership: rows.filter((r) => r.stats.membershipLabel).length,
      newThisMonth: rows.filter((r) => new Date(r.customer.createdAt).getTime() >= thirtyDaysAgo).length,
      lifetimeValue: rows.reduce((sum, r) => sum + r.stats.totalSpent, 0),
    };
  }, [rows]);

  const activeFilters =
    (membership !== 'all' ? 1 : 0) + (activity !== 'all' ? 1 : 0) + (debounced ? 1 : 0);

  const exportCsv = (): void => {
    void downloadExcel(
      table.sortedRows,
      [
        { header: 'Name', value: (r) => r.customer.name },
        { header: 'Phone', value: (r) => r.customer.phone },
        { header: 'Email', value: (r) => r.customer.email ?? '' },
        { header: 'Branch', value: (r) => db.shops.find((s) => s.id === r.customer.shopId)?.name ?? '' },
        { header: 'Membership', value: (r) => r.stats.membershipLabel ?? 'None' },
        { header: 'Visits', value: (r) => r.stats.totalVisits },
        { header: 'Total spent', value: (r) => r.stats.totalSpent },
        { header: 'Last visit', value: (r) => (r.stats.lastVisitAt ? formatDate(r.stats.lastVisitAt) : '') },
        { header: 'Status', value: (r) => (r.customer.active ? 'Active' : 'Inactive') },
      ],
      timestampedName('customers'),
    );
  };

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      mobilePrimary: true,
      render: ({ customer, stats }) => (
        <div className="flex items-center gap-3">
          <Avatar name={customer.name} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
              {customer.name}
              {!customer.active && <Badge tone="neutral">Inactive</Badge>}
            </p>
            <p className="truncate text-xs text-muted">
              {customer.phone}
              {stats.membershipLabel ? ` · ${stats.membershipLabel}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      hideBelowLg: true,
      render: ({ customer }) => (
        <span className="text-sm text-muted">{customer.email ?? '—'}</span>
      ),
    },
    ...(isAllShops
      ? [
          {
            key: 'shop',
            header: 'Branch',
            hideBelowLg: true,
            render: ({ customer }: Row) => (
              <span className="text-sm text-muted">
                {db.shops.find((s) => s.id === customer.shopId)?.name ?? '—'}
              </span>
            ),
          } satisfies Column<Row>,
        ]
      : []),
    {
      key: 'visits',
      header: 'Visits',
      sortable: true,
      align: 'right',
      render: ({ stats }) => <span className="text-sm tabular-nums text-ink">{stats.totalVisits}</span>,
    },
    {
      key: 'spent',
      header: 'Total spent',
      sortable: true,
      align: 'right',
      render: ({ stats }) => (
        <span className="text-sm font-medium tabular-nums text-ink">
          {formatCurrency(stats.totalSpent)}
        </span>
      ),
    },
    {
      key: 'lastVisit',
      header: 'Last visit',
      sortable: true,
      render: ({ stats }) => (
        <span className="text-sm text-muted">
          {stats.lastVisitAt ? formatDate(stats.lastVisitAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'upcoming',
      header: 'Upcoming',
      hideBelowLg: true,
      render: ({ stats }) =>
        stats.upcomingAppointmentAt ? (
          <Badge tone="info">{formatFriendlyDateTime(stats.upcomingAppointmentAt)}</Badge>
        ) : (
          <span className="text-sm text-subtle">—</span>
        ),
    },
  ];

  const membershipOptions = useMemo(
    () => [
      { value: 'all', label: 'All customers' },
      { value: 'none', label: 'No membership' },
      ...db.memberships.map((m) => ({ value: m.name, label: `${m.name} members` })),
    ],
    [db.memberships],
  );

  return (
    <>
      <PageHeader
        title="Customers"
        description={
          isAllShops
            ? 'The customer book across every branch.'
            : 'Everyone registered at this branch.'
        }
        actions={
          <>
            <Button variant="outline" leftIcon={<Download />} onClick={exportCsv}>
              Export
            </Button>
            <Button
              variant="outline"
              leftIcon={<FileUp />}
              disabled={shopId === null}
              title={shopId === null ? 'Pick a single branch first' : undefined}
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
            <Button
              leftIcon={<Plus />}
              disabled={shopId === null}
              title={shopId === null ? 'Pick a single branch first' : undefined}
              onClick={() => setFormOpen(true)}
            >
              New customer
            </Button>
          </>
        }
      />

      {shopId && (
        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title="Import customers"
          description="Bring your existing customer list in from Excel. Duplicate phone numbers are skipped."
          columns={importService.CUSTOMER_COLUMNS}
          templateName="customers-import-template"
          onImport={(rows) => importService.importCustomers(rows, shopId)}
        />
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total customers" value={summary.total} icon={<Users />} />
        <StatCard label="New in 30 days" value={summary.newThisMonth} hint="Recently registered" />
        <StatCard label="With a membership" value={summary.withMembership} hint="Active tiers" />
        <StatCard
          label="Lifetime value"
          value={formatCurrency(summary.lifetimeValue, { compact: true })}
          hint="Total billed, all time"
        />
      </div>

      <Card className="mb-4">
        <FilterBar
          activeCount={activeFilters}
          onClear={() => {
            setSearch('');
            setMembership('all');
            setActivity('all');
          }}
        >
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name, phone or email…"
            className="w-full sm:w-72"
            label="Search customers"
          />

          <FilterSelect
            label="Membership"
            value={membership}
            onChange={setMembership}
            options={membershipOptions}
          />

          <FilterSelect
            label="Activity"
            value={activity}
            onChange={setActivity}
            options={[
              { value: 'all', label: 'Any activity' },
              { value: 'active', label: 'Active only' },
              { value: 'inactive', label: 'Inactive only' },
              { value: 'new', label: 'New this month' },
              { value: 'lapsed', label: 'Not seen in 90 days' },
            ]}
          />
        </FilterBar>
      </Card>

      <DataTable
        columns={columns}
        table={table}
        rowKey={(row) => row.customer.id}
        onRowClick={(row) => navigate(`${basePath}/customers/${row.customer.id}`)}
        caption="Customers"
        empty={{
          title: 'No customers match',
          description:
            activeFilters > 0
              ? 'Try clearing the filters or searching for something else.'
              : 'Add the first customer to get started.',
          icon: <Users />,
          action:
            shopId !== null ? (
              <Button size="sm" leftIcon={<Plus />} onClick={() => setFormOpen(true)}>
                New customer
              </Button>
            ) : undefined,
        }}
        rowActions={(row) => (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<CalendarPlus />}
            onClick={() => navigate(`${basePath}/appointments?new=1&customer=${row.customer.id}`)}
          >
            Book
          </Button>
        )}
      />

      {shopId && (
        <CustomerFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          shopId={shopId}
          onSaved={(created) => navigate(`${basePath}/customers/${created.id}`)}
        />
      )}
    </>
  );
}

export default CustomersPage;
