import { useDeleteAction } from '@/hooks/useDeleteAction';
import * as deleteService from '@/services/deleteService';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarOff, Mail, Pencil, Phone, Plus, Scissors, UserX, Wallet } from 'lucide-react';
import { isSameDay, parseISO } from 'date-fns';
import { formatCurrency } from '@/utils/money';
import { formatClock, formatDate, formatDateTime, toISODate, WEEKDAY_LABELS } from '@/utils/date';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import * as staffService from '@/services/staffService';
import { performance as staffPerformance } from '@/services/staffService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { StaffFormModal } from './StaffFormModal';

export function StaffDetailPage(): JSX.Element {
  const { staffId } = useParams<{ staffId: string }>();
  const db = useDb();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const del = useDeleteAction();

  const [tab, setTab] = useState<'overview' | 'schedule' | 'appointments'>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [timeOffOpen, setTimeOffOpen] = useState(false);

  const member = db.staff.find((s) => s.id === staffId);

  const data = useMemo(() => {
    if (!member) return null;

    const appointments = db.appointments
      .filter((a) => a.staffId === member.id)
      .sort((a, b) => b.startAt.localeCompare(a.startAt));

    const stats = staffPerformance(member.shopId).find((row) => row.staffId === member.id);

    return {
      appointments,
      stats,
      today: appointments.filter((a) => isSameDay(parseISO(a.startAt), new Date())),
      shop: db.shops.find((s) => s.id === member.shopId),
      services: member.specializations
        .map((id) => db.services.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    };
  }, [member, db]);

  const toggleActive = useAsyncAction(
    async (active: boolean) => {
      if (!member) throw new Error('Team member not found.');
      return staffService.setActive(member.id, active);
    },
    {
      successMessage: (updated) =>
        updated.active ? `${updated.name} is active again.` : `${updated.name} was deactivated.`,
    },
  );

  const removeTimeOff = useAsyncAction(
    async (date: string) => {
      if (!member) throw new Error('Team member not found.');
      return staffService.removeTimeOff(member.id, date);
    },
    { successMessage: 'Leave day removed. Those slots are bookable again.' },
  );

  if (!member || !data) {
    return (
      <Card>
        <ErrorState
          title="Team member not found"
          message="They may have been removed from the system."
          onRetry={() => navigate('/admin/staff')}
        />
      </Card>
    );
  }

  const onToggleActive = async (): Promise<void> => {
    if (member.active) {
      const result = await confirm({
        title: `Deactivate ${member.name}?`,
        description:
          'They will stop appearing in the booking engine. This is refused if they still have upcoming appointments.',
        confirmLabel: 'Deactivate',
        tone: 'warning',
      });
      if (!result.confirmed) return;
    }
    await toggleActive.run(!member.active);
  };

  const byCategory = useMemo(() => {
    const groups = new Map<string, string[]>();
    data.services.forEach((service) => {
      const category = db.serviceCategories.find((c) => c.id === service.categoryId);
      const key = category?.name ?? 'Other';
      groups.set(key, [...(groups.get(key) ?? []), service.name]);
    });
    return [...groups.entries()];
  }, [data.services, db.serviceCategories]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Staff', to: '/admin/staff' }, { label: member.name }]}
        title={member.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone="brand">{member.role}</Badge>
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {member.phone}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              {member.email}
            </span>
            {data.shop && <span className="text-subtle">{data.shop.name}</span>}
            {!member.active && <Badge tone="neutral">Inactive</Badge>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" leftIcon={<CalendarOff />} onClick={() => setTimeOffOpen(true)}>
              Add leave
            </Button>
            <Button variant="outline" leftIcon={<Pencil />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button
              variant="outline"
              leftIcon={<UserX />}
              loading={toggleActive.pending}
              onClick={() => void onToggleActive()}
            >
              {member.active ? 'Deactivate' : 'Reactivate'}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void del({
                  title: `Delete ${member.name}?`,
                  description: 'Only staff with no appointments, bills or salary records can be deleted.',
                  run: () => deleteService.deleteStaff(member.id),
                  done: `${member.name} deleted.`,
                  onDone: () => navigate(-1),
                })
              }
            >
              Delete
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Completed" value={data.stats?.completed ?? 0} icon={<Scissors />} tone="ok" />
        <StatCard
          label="Revenue generated"
          value={formatCurrency(data.stats?.revenue ?? 0, { compact: true })}
          icon={<Wallet />}
        />
        <StatCard
          label="Commission"
          value={formatCurrency(data.stats?.commission ?? 0, { compact: true })}
          hint={`${Math.round(member.commissionRate * 100)}% of revenue`}
        />
        <StatCard
          label="Upcoming"
          value={data.stats?.upcoming ?? 0}
          hint={`${data.today.length} today`}
        />
      </div>

      <Tabs
        className="mb-4"
        label="Team member sections"
        value={tab}
        onChange={(next) => setTab(next as typeof tab)}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'schedule', label: 'Rota & leave' },
          { value: 'appointments', label: 'Appointments', count: data.appointments.length },
        ]}
      />

      {/* ---------------- Overview ---------------- */}
      <TabPanel active={tab === 'overview'}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Profile" />

            <div className="mt-4 flex items-center gap-4">
              <Avatar name={member.name} src={member.photoUrl} size="xl" />
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold text-ink">{member.name}</p>
                <p className="text-sm text-muted">{member.role}</p>
                <p className="mt-1 text-xs text-subtle">
                  Joined {formatDate(member.joinedOn)}
                </p>
              </div>
            </div>

            <dl className="mt-4 divide-y divide-line border-t border-line text-sm">
              <Row label="Phone" value={member.phone} />
              <Row label="Email" value={member.email} />
              <Row label="Branch" value={data.shop?.name ?? '—'} />
              <Row label="Commission rate" value={`${Math.round(member.commissionRate * 100)}%`} />
              <Row
                label="Cancellations"
                value={`${data.stats?.cancelled ?? 0} cancelled, ${data.stats?.noShow ?? 0} no-shows`}
              />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Specializations"
              description={`${data.services.length} services they can perform`}
            />

            {byCategory.length === 0 ? (
              <EmptyState
                compact
                title="Not bookable"
                description="No services are assigned, so this person never appears in the booking form."
                action={
                  <Button size="sm" onClick={() => setEditOpen(true)}>
                    Assign services
                  </Button>
                }
              />
            ) : (
              <div className="mt-3 space-y-3">
                {byCategory.map(([category, names]) => (
                  <div key={category}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      {category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {names.map((name) => (
                        <Badge key={name} tone="brand">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </TabPanel>

      {/* ---------------- Schedule ---------------- */}
      <TabPanel active={tab === 'schedule'}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Weekly rota"
              description="Drives which slots the booking engine offers"
              action={
                <Button variant="ghost" size="sm" leftIcon={<Pencil />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              }
            />

            <ul className="mt-3 divide-y divide-line">
              {member.schedule.map((shift) => (
                <li key={shift.weekday} className="flex items-center gap-3 py-2.5">
                  <span className="w-24 shrink-0 text-[13px] font-medium text-ink">
                    {WEEKDAY_LABELS[shift.weekday]}
                  </span>

                  {shift.working ? (
                    <>
                      <span className="text-[13px] tabular-nums text-ink">
                        {formatClock(shift.start)} – {formatClock(shift.end)}
                      </span>
                      {shift.breakStart && shift.breakEnd && (
                        <span className="ml-auto text-xs tabular-nums text-subtle">
                          break {formatClock(shift.breakStart)}–{formatClock(shift.breakEnd)}
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge tone="neutral">Day off</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Booked leave"
              description="Days removed from the diary entirely"
              action={
                <Button variant="ghost" size="sm" leftIcon={<Plus />} onClick={() => setTimeOffOpen(true)}>
                  Add
                </Button>
              }
            />

            {member.timeOff.length === 0 ? (
              <EmptyState compact icon={<CalendarOff />} title="No leave booked" />
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {[...member.timeOff].sort().map((date) => {
                  const past = date < toISODate(new Date());
                  return (
                    <li key={date} className="flex items-center gap-3 py-2.5">
                      <span className={past ? 'text-[13px] text-subtle' : 'text-[13px] text-ink'}>
                        {formatDate(date)}
                      </span>
                      {past && <Badge tone="neutral">Past</Badge>}

                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        loading={removeTimeOff.pending}
                        onClick={() => void removeTimeOff.run(date)}
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </TabPanel>

      {/* ---------------- Appointments ---------------- */}
      <TabPanel active={tab === 'appointments'}>
        <Card flush>
          {data.appointments.length === 0 ? (
            <EmptyState title="No appointments yet" />
          ) : (
            <ul className="divide-y divide-line">
              {data.appointments.slice(0, 40).map((appointment) => (
                <li key={appointment.id}>
                  <Link
                    to={`/admin/appointments?id=${appointment.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        {db.customers.find((c) => c.id === appointment.customerId)?.name ?? 'Unknown'}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {formatDateTime(appointment.startAt)} ·{' '}
                        {appointment.services
                          .map((s) => db.services.find((x) => x.id === s.serviceId)?.name)
                          .filter(Boolean)
                          .join(', ')}
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

      <StaffFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        shopId={member.shopId}
        member={member}
      />

      <TimeOffModal
        open={timeOffOpen}
        onClose={() => setTimeOffOpen(false)}
        staffId={member.id}
        staffName={member.name}
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

function TimeOffModal({
  open,
  onClose,
  staffId,
  staffName,
}: {
  open: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
}): JSX.Element {
  const [date, setDate] = useState(toISODate(new Date()));

  const add = useAsyncAction(
    async () => staffService.addTimeOff(staffId, date),
    {
      successMessage: `Leave booked. ${staffName}'s slots on that day are no longer offered.`,
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Book a leave day"
      description="The whole day is removed from the booking engine."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={add.pending} onClick={() => void add.run()}>
            Book leave
          </Button>
        </>
      }
    >
      <DatePicker
        label="Date"
        required
        value={date}
        min={toISODate(new Date())}
        onChange={(e) => setDate(e.target.value)}
        hint="If anything is already booked that day, you will be asked to move it first."
      />
    </Modal>
  );
}

export default StaffDetailPage;
