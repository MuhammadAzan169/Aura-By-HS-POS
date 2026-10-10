import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { addDays, addMonths, addWeeks, parseISO, subDays, subMonths, subWeeks } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Appointment, AppointmentStatus, Customer, Service, Staff } from '@/types';
import { formatCurrency } from '@/utils/money';
import { format, formatDuration, formatTime } from '@/utils/date';
import { APPOINTMENT_STATUS_META, APPOINTMENT_STATUSES } from '@/utils/appointmentStatus';
import { matches } from '@/utils/text';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useDebounce } from '@/hooks/useDebounce';
import { useTableState } from '@/hooks/useTableState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { AppointmentFormModal } from './AppointmentFormModal';
import { AppointmentDrawer } from './AppointmentDrawer';
import { DayView, MonthView, StatusLegend, WeekView, type CalendarRow } from './CalendarViews';

type ViewMode = 'list' | 'day' | 'week' | 'month';

export function AppointmentsPage(): JSX.Element {
  const db = useDb();
  const { shopId, isAllShops } = useShopScope();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();

  const basePath = pathname.startsWith('/admin') ? '/admin' : '/shop';

  const [view, setView] = useState<ViewMode>('list');
  const [anchor, setAnchor] = useState(new Date());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AppointmentStatus | 'all'>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search);

  // ?id= opens a booking directly (used by notifications and the dashboards).
  // ?new=1 opens the booking form.
  const [prefillCustomer, setPrefillCustomer] = useState<string | null>(null);

  useEffect(() => {
    const id = params.get('id');
    if (id) {
      setSelectedId(id);
      params.delete('id');
      setParams(params, { replace: true });
    }
    if (params.get('new') === '1') {
      setEditing(null);
      setPrefillCustomer(params.get('customer'));
      setFormOpen(true);
      params.delete('new');
      params.delete('customer');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const scoped = useMemo(
    () => db.appointments.filter((a) => shopId === null || a.shopId === shopId),
    [db.appointments, shopId],
  );

  const lookup = useMemo(() => {
    const customers = new Map<string, Customer>(db.customers.map((c) => [c.id, c]));
    const staff = new Map<string, Staff>(db.staff.map((s) => [s.id, s]));
    const services = new Map<string, Service>(db.services.map((s) => [s.id, s]));
    return { customers, staff, services };
  }, [db.customers, db.staff, db.services]);

  const rows: CalendarRow[] = useMemo(
    () =>
      scoped.map((appointment) => ({
        appointment,
        customer: lookup.customers.get(appointment.customerId),
        staff: lookup.staff.get(appointment.staffId),
        services: appointment.services
          .map((s) => lookup.services.get(s.serviceId))
          .filter((s): s is Service => Boolean(s)),
      })),
    [scoped, lookup],
  );

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const { appointment, customer, staff, services } = row;

        if (status !== 'all' && appointment.status !== status) return false;
        if (staffFilter !== 'all' && appointment.staffId !== staffFilter) return false;
        if (serviceFilter !== 'all' && !appointment.services.some((s) => s.serviceId === serviceFilter)) {
          return false;
        }

        const day = appointment.startAt.slice(0, 10);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;

        if (debouncedSearch) {
          const haystack = [
            customer?.name,
            customer?.phone,
            staff?.name,
            ...services.map((s) => s.name),
          ];
          if (!haystack.some((value) => matches(value, debouncedSearch))) return false;
        }

        return true;
      }),
    [rows, status, staffFilter, serviceFilter, fromDate, toDate, debouncedSearch],
  );

  // The list is sorted newest-first; the calendars read the same filtered set.
  const listRows = useMemo(
    () => [...filtered].sort((a, b) => b.appointment.startAt.localeCompare(a.appointment.startAt)),
    [filtered],
  );

  const table = useTableState(listRows, {
    initialPageSize: 12,
    accessors: {
      when: (row) => row.appointment.startAt,
      customer: (row) => row.customer?.name ?? '',
      staff: (row) => row.staff?.name ?? '',
      status: (row) => row.appointment.status,
      value: (row) => row.appointment.services.reduce((sum, s) => sum + s.price, 0),
    },
    initialSortKey: 'when',
    initialSortDir: 'desc',
  });

  const selected = selectedId ? (scoped.find((a) => a.id === selectedId) ?? null) : null;

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      counts.set(row.appointment.status, (counts.get(row.appointment.status) ?? 0) + 1);
    });
    return counts;
  }, [rows]);

  const activeFilterCount =
    (status !== 'all' ? 1 : 0) +
    (staffFilter !== 'all' ? 1 : 0) +
    (serviceFilter !== 'all' ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);

  const clearFilters = (): void => {
    setStatus('all');
    setStaffFilter('all');
    setServiceFilter('all');
    setFromDate('');
    setToDate('');
    setSearch('');
  };

  const columns: Column<CalendarRow>[] = [
    {
      key: 'when',
      header: 'When',
      sortable: true,
      mobilePrimary: true,
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-ink">
            {format(parseISO(row.appointment.startAt), 'd MMM yyyy')}
          </p>
          <p className="text-xs tabular-nums text-muted">
            {formatTime(row.appointment.startAt)} · {formatDuration(row.appointment.durationMin)}
          </p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.customer?.name ?? '?'} size="xs" />
          <div className="min-w-0">
            <p className="truncate text-sm text-ink">{row.customer?.name ?? 'Unknown'}</p>
            <p className="truncate text-xs text-muted">{row.customer?.phone ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'services',
      header: 'Services',
      hideBelowLg: true,
      render: (row) => (
        <p className="max-w-[16rem] truncate text-sm text-muted">
          {row.services.map((s) => s.name).join(', ') || '—'}
        </p>
      ),
    },
    {
      key: 'staff',
      header: 'Stylist',
      sortable: true,
      render: (row) => <span className="text-sm text-ink">{row.staff?.name ?? 'Unassigned'}</span>,
    },
    ...(isAllShops
      ? [
          {
            key: 'shop',
            header: 'Branch',
            hideBelowLg: true,
            render: (row: CalendarRow) => (
              <span className="text-sm text-muted">
                {db.shops.find((s) => s.id === row.appointment.shopId)?.name ?? '—'}
              </span>
            ),
          } satisfies Column<CalendarRow>,
        ]
      : []),
    {
      key: 'value',
      header: 'Value',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="text-sm font-medium tabular-nums text-ink">
          {formatCurrency(row.appointment.services.reduce((sum, s) => sum + s.price, 0))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusBadge status={row.appointment.status} />,
    },
  ];

  const stepAnchor = (direction: 1 | -1): void => {
    if (view === 'day') setAnchor((d) => (direction === 1 ? addDays(d, 1) : subDays(d, 1)));
    else if (view === 'week') setAnchor((d) => (direction === 1 ? addWeeks(d, 1) : subWeeks(d, 1)));
    else setAnchor((d) => (direction === 1 ? addMonths(d, 1) : subMonths(d, 1)));
  };

  const anchorLabel =
    view === 'day'
      ? format(anchor, 'EEEE, d MMMM yyyy')
      : view === 'week'
        ? `Week of ${format(anchor, 'd MMM yyyy')}`
        : format(anchor, 'MMMM yyyy');

  const canBook = shopId !== null;

  return (
    <>
      <PageHeader
        title="Appointments"
        description={
          isAllShops
            ? 'Every booking across all three branches.'
            : 'The diary for this branch.'
        }
        actions={
          <Button
            leftIcon={<Plus />}
            disabled={!canBook}
            title={canBook ? undefined : 'Pick a single branch before booking'}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New appointment
          </Button>
        }
      >
        <Tabs
          variant="pill"
          label="Calendar view"
          value={view}
          onChange={(next) => setView(next as ViewMode)}
          items={[
            { value: 'list', label: 'List', count: listRows.length },
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </PageHeader>

      {!canBook && (
        <div className="mb-4 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-[13px] text-ink">
          You are viewing all branches. Choose a single shop in the top bar to book an appointment.
        </div>
      )}

      {/* ---------------- Filters ---------------- */}
      <Card className="mb-4">
        <FilterBar activeCount={activeFilterCount} onClear={clearFilters}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search customer, stylist or service…"
            className="w-full sm:w-72"
            label="Search appointments"
          />

          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: `All statuses (${rows.length})` },
              ...APPOINTMENT_STATUSES.map((s) => ({
                value: s,
                label: `${APPOINTMENT_STATUS_META[s].label} (${statusCounts.get(s) ?? 0})`,
              })),
            ]}
          />

          <FilterSelect
            label="Stylist"
            value={staffFilter}
            onChange={setStaffFilter}
            options={[
              { value: 'all', label: 'All stylists' },
              ...db.staff
                .filter((s) => (shopId === null || s.shopId === shopId) && s.specializations.length > 0)
                .map((s) => ({ value: s.id, label: s.name })),
            ]}
          />

          <FilterSelect
            label="Service"
            value={serviceFilter}
            onChange={setServiceFilter}
            options={[
              { value: 'all', label: 'All services' },
              ...db.services.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })),
            ]}
          />

          <label className="flex w-full min-w-0 items-center gap-1.5 text-xs text-muted sm:w-auto">
            <span className="sr-only">From date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-10 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 text-sm text-ink sm:w-auto sm:flex-none"
              aria-label="From date"
            />
            <span aria-hidden>–</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-10 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 text-sm text-ink sm:w-auto sm:flex-none"
              aria-label="To date"
            />
          </label>
        </FilterBar>
      </Card>

      {/* ---------------- Views ---------------- */}
      {view === 'list' ? (
        <DataTable
          columns={columns}
          table={table}
          rowKey={(row) => row.appointment.id}
          onRowClick={(row) => setSelectedId(row.appointment.id)}
          caption="Appointments"
          empty={{
            title: 'No appointments match those filters',
            description: 'Try widening the date range or clearing the filters.',
            icon: <CalendarDays />,
            action:
              activeFilterCount > 0 ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined,
          }}
        />
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" aria-label="Previous" onClick={() => stepAnchor(-1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="sm" aria-label="Next" onClick={() => stepAnchor(1)}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
              <p className="ml-2 font-display text-sm font-semibold text-ink">{anchorLabel}</p>
            </div>

            <StatusLegend />
          </div>

          {view === 'day' && (
            <DayView rows={filtered} anchor={anchor} onSelect={(a) => setSelectedId(a.id)} />
          )}
          {view === 'week' && (
            <WeekView rows={filtered} anchor={anchor} onSelect={(a) => setSelectedId(a.id)} />
          )}
          {view === 'month' && (
            <MonthView
              rows={filtered}
              anchor={anchor}
              onSelect={(a) => setSelectedId(a.id)}
              onPickDay={(day) => {
                setAnchor(day);
                setView('day');
              }}
            />
          )}

          {filtered.length === 0 && view !== 'day' && (
            <EmptyState
              compact
              title="Nothing in this period"
              description="Try a different month, or clear the filters."
            />
          )}
        </Card>
      )}

      {/* ---------------- Overlays ---------------- */}
      {shopId && (
        <AppointmentFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          shopId={editing?.shopId ?? shopId}
          appointment={editing}
          initialCustomerId={editing ? undefined : prefillCustomer}
          initialDate={view === 'list' ? undefined : anchor}
          onSaved={(saved) => setSelectedId(saved.id)}
        />
      )}

      {/* Editing can start from a branch other than the current scope. */}
      {editing && !shopId && (
        <AppointmentFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          shopId={editing.shopId}
          appointment={editing}
        />
      )}

      <AppointmentDrawer
        appointment={selected}
        basePath={basePath}
        onClose={() => setSelectedId(null)}
        onEdit={(appointment) => {
          setSelectedId(null);
          setEditing(appointment);
          setFormOpen(true);
        }}
      />
    </>
  );
}

export default AppointmentsPage;
