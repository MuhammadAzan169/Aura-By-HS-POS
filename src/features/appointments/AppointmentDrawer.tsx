import { openWhatsApp } from '@/utils/whatsapp';
import { MessageCircle, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  LogIn,
  Pencil,
  PlayCircle,
  Receipt,
  UserX,
} from 'lucide-react';
import type { Appointment, AppointmentStatus } from '@/types';
import { formatCurrency } from '@/utils/money';
import { appointmentEnd, formatDateTime, formatDuration, formatTime } from '@/utils/date';
import { allowedTransitions, APPOINTMENT_STATUS_META } from '@/utils/appointmentStatus';
import { RequestPaymentModal } from '@/features/payments/RequestPaymentModal';
import { useDb } from '@/hooks/useDb';
import { useAuthStore } from '@/store/authStore';
import { useConfirm } from '@/hooks/useConfirm';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useCartStore } from '@/store/cartStore';
import * as appointmentService from '@/services/appointmentService';
import { discountPctFor } from '@/services/customerService';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusBadge } from '@/components/ui/Badge';

export interface AppointmentDrawerProps {
  appointment: Appointment | null;
  onClose: () => void;
  onEdit: (appointment: Appointment) => void;
  basePath: string;
}

/** Icons for the actions the front desk takes most often. */
const ACTION_META: Partial<Record<AppointmentStatus, { label: string; icon: JSX.Element }>> = {
  confirmed: { label: 'Confirm', icon: <CheckCircle2 /> },
  'checked-in': { label: 'Check in', icon: <LogIn /> },
  'in-progress': { label: 'Start service', icon: <PlayCircle /> },
  completed: { label: 'Complete', icon: <CheckCircle2 /> },
  cancelled: { label: 'Cancel', icon: <Ban /> },
  'no-show': { label: 'Mark no-show', icon: <UserX /> },
};

export function AppointmentDrawer({
  appointment,
  onClose,
  onEdit,
  basePath,
}: AppointmentDrawerProps): JSX.Element | null {
  const db = useDb();
  const actor = useAuthStore((s) => s.user);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const cart = useCartStore();
  const [linkOpen, setLinkOpen] = useState(false);

  const details = useMemo(() => {
    if (!appointment) return null;
    return {
      customer: db.customers.find((c) => c.id === appointment.customerId),
      staff: db.staff.find((s) => s.id === appointment.staffId),
      shop: db.shops.find((s) => s.id === appointment.shopId),
      sale: appointment.saleId ? db.sales.find((s) => s.id === appointment.saleId) : undefined,
      services: appointment.services.map((booked) => ({
        booked,
        service: db.services.find((s) => s.id === booked.serviceId),
      })),
    };
  }, [appointment, db]);

  const changeStatus = useAsyncAction(
    async (to: AppointmentStatus, reason?: string) => {
      if (!appointment || !actor) throw new Error('You must be signed in.');
      return appointmentService.changeStatus(appointment.id, to, actor, reason);
    },
    { successMessage: (updated) => `Marked as ${APPOINTMENT_STATUS_META[updated.status].label.toLowerCase()}.` },
  );

  if (!appointment || !details) return null;

  const total = appointment.services.reduce((sum, s) => sum + s.price, 0);
  const transitions = allowedTransitions(appointment.status);

  const onAction = async (to: AppointmentStatus): Promise<void> => {
    // Cancelling needs a reason; a no-show is destructive enough to confirm.
    if (to === 'cancelled') {
      const result = await confirm({
        title: 'Cancel this appointment?',
        description: `${details.customer?.name ?? 'The customer'}'s slot will be released and the stylist freed up.`,
        confirmLabel: 'Cancel appointment',
        cancelLabel: 'Keep it',
        tone: 'danger',
        requireReason: {
          label: 'Reason for cancelling',
          placeholder: 'e.g. customer called to reschedule',
        },
      });
      if (!result.confirmed) return;
      await changeStatus.run(to, result.reason);
      return;
    }

    if (to === 'no-show') {
      const result = await confirm({
        title: 'Mark as a no-show?',
        description: 'This is recorded against the customer and shows in the reports.',
        confirmLabel: 'Mark no-show',
        tone: 'warning',
      });
      if (!result.confirmed) return;
    }

    await changeStatus.run(to);
  };

  /** Loads this appointment into the till, ready to take payment. */
  const createBill = (): void => {
    cart.ensureShop(appointment.shopId);
    cart.clear();
    cart.setCustomer({
      id: appointment.customerId,
      name: details.customer?.name ?? 'Walk-in customer',
      membershipDiscountPct: discountPctFor(appointment.customerId),
      membershipLabel: null,
    });
    cart.setStaff(appointment.staffId);
    cart.setAppointment(appointment.id);

    for (const { booked, service } of details.services) {
      if (!service) continue;
      cart.addItem({
        kind: 'service',
        refId: service.id,
        name: service.name,
        unitPrice: booked.price,
        staffId: appointment.staffId,
      });
    }

    onClose();
    navigate(`${basePath}/billing`);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={details.customer?.name ?? 'Appointment'}
      width="sm:max-w-lg"
      description={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={appointment.status} />
          <span>{formatDateTime(appointment.startAt)}</span>
        </span>
      }
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Pencil />}
            onClick={() => onEdit(appointment)}
            disabled={appointment.status === 'completed' || appointment.status === 'cancelled'}
            title={
              appointment.status === 'completed'
                ? 'A completed appointment cannot be edited'
                : undefined
            }
          >
            Edit
          </Button>

          {transitions.map((to) => {
            const meta = ACTION_META[to];
            if (!meta) return null;
            return (
              <Button
                key={to}
                size="sm"
                variant={to === 'cancelled' || to === 'no-show' ? 'outline' : 'primary'}
                leftIcon={meta.icon}
                loading={changeStatus.pending}
                onClick={() => void onAction(to)}
              >
                {meta.label}
              </Button>
            );
          })}

          {details.customer && !['completed', 'cancelled', 'no-show'].includes(appointment.status) && (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<MessageCircle />}
              onClick={() =>
                openWhatsApp(
                  details.customer?.phone,
                  `Assalam o Alaikum ${details.customer?.name ?? ''}! This is a reminder of your appointment at ${
                    db.shops.find((s) => s.id === appointment.shopId)?.name ?? db.settings.business.name
                  } on ${formatDateTime(appointment.startAt)} for ${details.services
                    .map((x) => x.service?.name)
                    .filter(Boolean)
                    .join(', ')}. Please reply to confirm. Thank you! 💐`,
                )
              }
            >
              Remind on WhatsApp
            </Button>
          )}

          {!appointment.bridalBookingId && !['cancelled', 'no-show'].includes(appointment.status) && (!details.sale || (details.sale.balanceDue ?? 0) > 0) && (
            <Button size="sm" variant="outline" leftIcon={<Smartphone />} onClick={() => setLinkOpen(true)}>
              Online payment link
            </Button>
          )}
          <RequestPaymentModal
            open={linkOpen}
            onClose={() => setLinkOpen(false)}
            purpose="appointment"
            refId={appointment.id}
            phone={details.customer?.phone ?? ''}
            name={details.customer?.name ?? 'Customer'}
          />

          {appointment.status === 'completed' && !appointment.saleId && !appointment.bridalBookingId && (
            <Button size="sm" variant="accent" leftIcon={<Receipt />} onClick={createBill}>
              Create bill
            </Button>
          )}

          {details.sale && (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Receipt />}
              onClick={() => navigate(`${basePath}/billing/bills/${details.sale!.id}`)}
            >
              View bill
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* ---- Summary ---- */}
        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-canvas p-4">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">Time</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink">
              {formatTime(appointment.startAt)} –{' '}
              {formatTime(appointmentEnd(appointment.startAt, appointment.durationMin))}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">Duration</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink">
              {formatDuration(appointment.durationMin)}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">Branch</dt>
            <dd className="mt-0.5 truncate text-sm text-ink">{details.shop?.name ?? '—'}</dd>
          </div>

          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">Booked via</dt>
            <dd className="mt-0.5 text-sm capitalize text-ink">{appointment.source.replace('-', ' ')}</dd>
          </div>
        </dl>

        {/* ---- People ---- */}
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">People</h3>

          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <Avatar name={details.customer?.name ?? '?'} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {details.customer?.name ?? 'Unknown customer'}
                </p>
                <p className="truncate text-xs text-muted">{details.customer?.phone ?? '—'}</p>
              </div>
              {details.customer && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`${basePath}/customers/${details.customer!.id}`)}
                >
                  Profile
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <Avatar name={details.staff?.name ?? '?'} src={details.staff?.photoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {details.staff?.name ?? 'Unassigned'}
                </p>
                <p className="truncate text-xs text-muted">{details.staff?.role ?? '—'}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Sensitivities, when there are any ---- */}
        {details.customer?.sensitivities && (
          <div className="rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warn">
              Before you start
            </p>
            <p className="mt-1 text-[13px] leading-snug text-ink">{details.customer.sensitivities}</p>
          </div>
        )}

        {/* ---- Services ---- */}
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Services</h3>

          <ul className="divide-y divide-line rounded-xl border border-line">
            {details.services.map(({ booked, service }, index) => (
              <li key={`${booked.serviceId}-${index}`} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{service?.name ?? 'Removed service'}</p>
                  <p className="text-xs text-muted">{formatDuration(booked.durationMin)}</p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums text-ink">
                  {formatCurrency(booked.price)}
                </p>
              </li>
            ))}

            <li className="flex items-center justify-between px-3 py-2.5 bg-canvas">
              <span className="text-sm font-medium text-ink">Estimated total</span>
              <span className="text-sm font-semibold tabular-nums text-ink">
                {formatCurrency(total)}
              </span>
            </li>
          </ul>

          <p className="mt-1.5 text-xs text-subtle">
            Prices were captured when the booking was made. Discounts are applied at the till.
          </p>
        </section>

        {/* ---- Notes ---- */}
        {appointment.notes && (
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Notes</h3>
            <p className="rounded-xl border border-line px-3 py-2.5 text-[13px] leading-relaxed text-muted">
              {appointment.notes}
            </p>
          </section>
        )}

        {appointment.cancelReason && (
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Cancellation reason</h3>
            <p className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-[13px] leading-relaxed text-ink">
              {appointment.cancelReason}
            </p>
          </section>
        )}

        {/* ---- History ---- */}
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Status history</h3>

          <ol className="space-y-3">
            {[...appointment.history].reverse().map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex gap-3">
                <span className="relative flex flex-col items-center">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                  {index < appointment.history.length - 1 && (
                    <span className="mt-1 w-px flex-1 bg-line" aria-hidden />
                  )}
                </span>

                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={APPOINTMENT_STATUS_META[entry.status].tone}>
                      {APPOINTMENT_STATUS_META[entry.status].label}
                    </Badge>
                    <span className="text-xs text-subtle">{formatDateTime(entry.at)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    by {entry.byUserName}
                    {entry.note ? ` — ${entry.note}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {appointment.status === 'completed' && !appointment.saleId && (
          <div className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-3">
            <CalendarClock className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden />
            <p className="text-[13px] leading-snug text-ink">
              This appointment is finished but has not been billed yet.
            </p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
