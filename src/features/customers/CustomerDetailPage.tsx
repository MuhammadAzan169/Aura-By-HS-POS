import { useDeleteAction } from '@/hooks/useDeleteAction';
import * as deleteService from '@/services/deleteService';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  BadgePercent,
  CalendarPlus,
  Mail,
  Pencil,
  Phone,
  Receipt,
  Scissors,
  UserX,
  Wallet,
} from 'lucide-react';
import { parseISO } from 'date-fns';
import { formatCurrency } from '@/utils/money';
import { formatDate, formatDateTime, formatFriendlyDateTime } from '@/utils/date';
import { useDb } from '@/hooks/useDb';
import { useConfirm } from '@/hooks/useConfirm';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import * as customerService from '@/services/customerService';
import { statsFor } from '@/services/customerService';
import { PageHeader } from '@/components/ui/PageHeader';
import { CustomerAccountCard } from './CustomerAccountCard';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { CustomerFormModal } from './CustomerFormModal';
import { AppointmentFormModal } from '@/features/appointments/AppointmentFormModal';

type TabValue = 'overview' | 'appointments' | 'bills' | 'services' | 'notes';

export function CustomerDetailPage(): JSX.Element {
  const { customerId } = useParams<{ customerId: string }>();
  const db = useDb();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const confirm = useConfirm();
  const del = useDeleteAction();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const cart = useCartStore();

  const basePath = pathname.startsWith('/admin') ? '/admin' : '/shop';

  const [tab, setTab] = useState<TabValue>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);

  const customer = db.customers.find((c) => c.id === customerId);

  const data = useMemo(() => {
    if (!customer) return null;

    const appointments = db.appointments
      .filter((a) => a.customerId === customer.id)
      .sort((a, b) => b.startAt.localeCompare(a.startAt));

    const sales = db.sales
      .filter((s) => s.customerId === customer.id)
      .sort((a, b) => b.soldAt.localeCompare(a.soldAt));

    // Count how often each service has been delivered to this customer.
    const serviceCounts = new Map<string, { count: number; spent: number; last: string }>();
    for (const appointment of appointments) {
      if (appointment.status !== 'completed') continue;
      for (const booked of appointment.services) {
        const entry = serviceCounts.get(booked.serviceId) ?? { count: 0, spent: 0, last: '' };
        entry.count += 1;
        entry.spent += booked.price;
        if (appointment.startAt > entry.last) entry.last = appointment.startAt;
        serviceCounts.set(booked.serviceId, entry);
      }
    }

    const held = customerService.activeMembershipFor(customer.id);
    const tier = held ? db.memberships.find((m) => m.id === held.membershipId) : undefined;

    return {
      appointments,
      sales,
      stats: statsFor(customer.id),
      serviceHistory: [...serviceCounts.entries()]
        .map(([serviceId, entry]) => ({
          service: db.services.find((s) => s.id === serviceId),
          ...entry,
        }))
        .sort((a, b) => b.count - a.count),
      held,
      tier,
      shop: db.shops.find((s) => s.id === customer.shopId),
      preferredStaff: db.staff.find((s) => s.id === customer.preferredStaffId),
    };
  }, [customer, db]);

  const toggleActive = useAsyncAction(
    async (active: boolean) => {
      if (!customer) throw new Error('Customer not found.');
      return customerService.setActive(customer.id, active);
    },
    { successMessage: (updated) => (updated.active ? 'Customer reactivated.' : 'Customer deactivated.') },
  );

  if (!customer || !data) {
    return (
      <Card>
        <ErrorState
          title="Customer not found"
          message="That customer may have been removed, or belongs to another branch."
          onRetry={() => navigate(`${basePath}/customers`)}
        />
      </Card>
    );
  }

  const startSale = (): void => {
    cart.ensureShop(customer.shopId);
    cart.clear();
    cart.setCustomer({
      id: customer.id,
      name: customer.name,
      membershipDiscountPct: data.tier?.discountPct ?? 0,
      membershipLabel: data.tier?.name ?? null,
    });
    navigate(`${basePath}/billing`);
  };

  const onToggleActive = async (): Promise<void> => {
    if (customer.active) {
      const result = await confirm({
        title: `Deactivate ${customer.name}?`,
        description:
          'They will be hidden from new bookings and the billing search. Their history is kept.',
        confirmLabel: 'Deactivate',
        tone: 'warning',
      });
      if (!result.confirmed) return;
    }
    await toggleActive.run(!customer.active);
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Customers', to: `${basePath}/customers` },
          { label: customer.name },
        ]}
        title={customer.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {customer.phone}
            </span>
            {customer.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {customer.email}
              </span>
            )}
            {data.shop && <span className="text-subtle">{data.shop.name}</span>}
            {!customer.active && <Badge tone="neutral">Inactive</Badge>}
            {data.tier && <Badge tone="brand">{data.tier.name} member</Badge>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" leftIcon={<Pencil />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button variant="outline" leftIcon={<CalendarPlus />} onClick={() => setBookOpen(true)}>
              Book
            </Button>
            <Button leftIcon={<Wallet />} onClick={startSale}>
              New sale
            </Button>
          </>
        }
      />

      {customer.sensitivities && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="text-[13px] font-semibold text-ink">Allergies & sensitivities</p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink">{customer.sensitivities}</p>
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total visits" value={data.stats.totalVisits} icon={<Scissors />} />
        <StatCard
          label="Total spent"
          value={formatCurrency(data.stats.totalSpent)}
          icon={<Wallet />}
        />
        <StatCard
          label="Last visit"
          value={data.stats.lastVisitAt ? formatDate(data.stats.lastVisitAt) : 'Never'}
          hint={customer.firstVisitOn ? `First visit ${formatDate(customer.firstVisitOn)}` : 'No visits yet'}
        />
        <StatCard
          label="Upcoming"
          value={
            data.stats.upcomingAppointmentAt
              ? formatFriendlyDateTime(data.stats.upcomingAppointmentAt)
              : 'Nothing booked'
          }
          icon={<CalendarPlus />}
        />
      </div>

      <Tabs
        className="mb-4"
        label="Customer sections"
        value={tab}
        onChange={(next) => setTab(next as TabValue)}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'appointments', label: 'Appointments', count: data.appointments.length },
          { value: 'bills', label: 'Bills & payments', count: data.sales.length },
          { value: 'services', label: 'Services history', count: data.serviceHistory.length },
          { value: 'notes', label: 'Notes & preferences' },
        ]}
      />

      {/* ---------------- Overview ---------------- */}
      <TabPanel active={tab === 'overview'}>
        <div className="grid gap-4 lg:grid-cols-2">
          <CustomerAccountCard customer={customer} />
          <Card>
            <CardHeader title="Membership" />

            {data.tier && data.held ? (
              <div className="mt-3">
                <div className="flex items-center gap-3 rounded-xl bg-brand-soft px-3.5 py-3">
                  <BadgePercent className="h-5 w-5 shrink-0 text-brand" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand">{data.tier.name}</p>
                    <p className="text-xs text-brand/75">
                      {data.tier.discountPct}% off every service · expires {formatDate(data.held.expiresOn)}
                    </p>
                  </div>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {data.tier.benefits.map((benefit) => (
                    <li key={benefit} className="flex gap-2 text-[13px] text-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden />
                      {benefit}
                    </li>
                  ))}
                </ul>

                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setMembershipOpen(true)}
                  >
                    Change membership
                  </Button>
                )}
              </div>
            ) : (
              <EmptyState
                compact
                icon={<BadgePercent />}
                title="No active membership"
                description="Assign a tier to apply an automatic discount at the till."
                action={
                  <Button size="sm" onClick={() => setMembershipOpen(true)}>
                    Assign membership
                  </Button>
                }
              />
            )}
          </Card>

          <Card>
            <CardHeader title="At a glance" />

            <dl className="mt-3 divide-y divide-line text-sm">
              <Row label="Registered" value={formatDate(customer.createdAt)} />
              <Row label="Branch" value={data.shop?.name ?? '—'} />
              <Row
                label="Preferred stylist"
                value={data.preferredStaff?.name ?? 'No preference'}
              />
              <Row
                label="Preferred services"
                value={
                  customer.preferredServiceIds.length > 0
                    ? customer.preferredServiceIds
                        .map((id) => db.services.find((s) => s.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')
                    : '—'
                }
              />
              <Row
                label="Average bill"
                value={
                  data.stats.totalVisits > 0
                    ? formatCurrency(data.stats.totalSpent / Math.max(1, data.sales.length))
                    : '—'
                }
              />
              <Row label="Status" value={customer.active ? 'Active' : 'Inactive'} />
            </dl>

            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              leftIcon={<UserX />}
              loading={toggleActive.pending}
              onClick={() => void onToggleActive()}
            >
              {customer.active ? 'Deactivate customer' : 'Reactivate customer'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() =>
                void del({
                  title: `Delete ${customer.name}?`,
                  description: 'Only customers with no bills, bookings or advances can be deleted.',
                  run: () => deleteService.deleteCustomer(customer.id),
                  done: `${customer.name} deleted.`,
                  onDone: () => navigate(-1),
                })
              }
            >
              Delete customer
            </Button>
          </Card>
        </div>
      </TabPanel>

      {/* ---------------- Appointments ---------------- */}
      <TabPanel active={tab === 'appointments'}>
        <Card flush>
          {data.appointments.length === 0 ? (
            <EmptyState
              title="No appointments yet"
              description="Book this customer in to start their history."
              action={
                <Button size="sm" leftIcon={<CalendarPlus />} onClick={() => setBookOpen(true)}>
                  Book appointment
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.appointments.map((appointment) => (
                <li key={appointment.id}>
                  <Link
                    to={`${basePath}/appointments?id=${appointment.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        {formatDateTime(appointment.startAt)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {appointment.services
                          .map((s) => db.services.find((x) => x.id === s.serviceId)?.name)
                          .filter(Boolean)
                          .join(', ')}
                        {' · '}
                        {db.staff.find((s) => s.id === appointment.staffId)?.name ?? 'Unassigned'}
                      </p>
                    </div>

                    <span className="shrink-0 text-sm font-medium tabular-nums text-ink">
                      {formatCurrency(appointment.services.reduce((sum, s) => sum + s.price, 0))}
                    </span>

                    <StatusBadge status={appointment.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </TabPanel>

      {/* ---------------- Bills ---------------- */}
      <TabPanel active={tab === 'bills'}>
        <Card flush>
          {data.sales.length === 0 ? (
            <EmptyState
              icon={<Receipt />}
              title="No bills yet"
              description="Completed sales will appear here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.sales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    to={`${basePath}/billing/bills/${sale.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[13px] font-medium text-ink">{sale.receiptNo}</p>
                      <p className="truncate text-xs text-muted">
                        {formatDateTime(sale.soldAt)} · {sale.items.length}{' '}
                        {sale.items.length === 1 ? 'item' : 'items'} ·{' '}
                        {sale.payments.map((p) => p.method).join(', ')}
                      </p>
                    </div>

                    <span
                      className={
                        sale.status === 'refunded'
                          ? 'shrink-0 text-sm font-medium tabular-nums text-subtle line-through'
                          : 'shrink-0 text-sm font-medium tabular-nums text-ink'
                      }
                    >
                      {formatCurrency(sale.total)}
                    </span>

                    {sale.status === 'refunded' && <Badge tone="danger">Refunded</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </TabPanel>

      {/* ---------------- Services history ---------------- */}
      <TabPanel active={tab === 'services'}>
        <Card flush>
          {data.serviceHistory.length === 0 ? (
            <EmptyState
              icon={<Scissors />}
              title="No completed services yet"
              description="Once an appointment is completed it shows up here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.serviceHistory.map((entry) => (
                <li key={entry.service?.id ?? entry.last} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {entry.service?.name ?? 'Removed service'}
                    </p>
                    <p className="text-xs text-muted">Last on {formatDate(entry.last)}</p>
                  </div>

                  <Badge tone="brand">
                    {entry.count}× booked
                  </Badge>

                  <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
                    {formatCurrency(entry.spent)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </TabPanel>

      {/* ---------------- Notes ---------------- */}
      <TabPanel active={tab === 'notes'}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Notes"
              action={
                <Button variant="ghost" size="sm" leftIcon={<Pencil />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              }
            />
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">
              {customer.notes || 'No notes recorded for this customer yet.'}
            </p>
          </Card>

          <Card>
            <CardHeader title="Preferences" />

            <dl className="mt-3 divide-y divide-line text-sm">
              <Row label="Preferred stylist" value={data.preferredStaff?.name ?? 'No preference'} />
              <Row
                label="Allergies & sensitivities"
                value={customer.sensitivities || 'None recorded'}
              />
              <Row
                label="Contact preference"
                value={customer.email ? 'Email and phone' : 'Phone only'}
              />
            </dl>
          </Card>
        </div>
      </TabPanel>

      {/* ---------------- Modals ---------------- */}
      <CustomerFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        shopId={customer.shopId}
        customer={customer}
      />

      <AppointmentFormModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        shopId={customer.shopId}
        initialCustomerId={customer.id}
      />

      <AssignMembershipModal
        open={membershipOpen}
        onClose={() => setMembershipOpen(false)}
        customerId={customer.id}
      />
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

function AssignMembershipModal({
  open,
  onClose,
  customerId,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
}): JSX.Element {
  const db = useDb();
  const [membershipId, setMembershipId] = useState('');
  const [startsOn, setStartsOn] = useState(new Date().toISOString().slice(0, 10));

  const tiers = db.memberships.filter((m) => m.active);
  const selected = tiers.find((t) => t.id === membershipId);

  const assign = useAsyncAction(
    async () => {
      if (!membershipId) throw new Error('Choose a membership tier.');
      return customerService.assignMembership(customerId, membershipId, startsOn);
    },
    {
      successMessage: 'Membership assigned. The discount applies from the next bill.',
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign a membership"
      description="Any existing active tier is replaced."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={assign.pending} disabled={!membershipId} onClick={() => void assign.run()}>
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Membership tier"
          required
          placeholder="Choose a tier…"
          value={membershipId}
          onChange={(e) => setMembershipId(e.target.value)}
          options={tiers.map((tier) => ({
            value: tier.id,
            label: `${tier.name} — ${formatCurrency(tier.price)} for ${tier.validityDays} days`,
          }))}
        />

        <DatePicker
          label="Starts on"
          required
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
        />

        {selected && (
          <div className="rounded-xl bg-brand-soft px-3.5 py-3">
            <p className="text-[13px] font-medium text-brand">
              {selected.discountPct}% off every service
            </p>
            <p className="mt-1 text-xs text-brand/75">
              Valid until{' '}
              {formatDate(
                new Date(parseISO(startsOn).getTime() + selected.validityDays * 86400000),
              )}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default CustomerDetailPage;
