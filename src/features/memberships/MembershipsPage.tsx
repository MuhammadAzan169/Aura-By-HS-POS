import { useDeleteAction } from '@/hooks/useDeleteAction';
import * as deleteService from '@/services/deleteService';
import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, Check, Pencil, Plus, Users } from 'lucide-react';
import type { Membership } from '@/types';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/money';
import { formatDate } from '@/utils/date';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import * as catalogService from '@/services/catalogService';
import { membershipHolderCount } from '@/services/catalogService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/States';

export function MembershipsPage(): JSX.Element {
  const db = useDb();
  const confirm = useConfirm();
  const del = useDeleteAction();
  const [editing, setEditing] = useState<Membership | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const summary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const active = db.customerMemberships.filter(
      (m) => m.status === 'active' && m.expiresOn >= today,
    );
    const expiringSoon = active.filter((m) => {
      const days = (new Date(m.expiresOn).getTime() - Date.now()) / 86400000;
      return days <= 30;
    });

    const revenue = active.reduce((sum, held) => {
      const tier = db.memberships.find((t) => t.id === held.membershipId);
      return sum + (tier?.price ?? 0);
    }, 0);

    return { activeCount: active.length, expiringSoon: expiringSoon.length, revenue };
  }, [db.customerMemberships, db.memberships]);

  const toggle = useAsyncAction(
    async (tier: Membership) => {
      await catalogService.setMembershipActive(tier.id, !tier.active);
      return tier;
    },
    {
      successMessage: (tier) =>
        tier.active ? `${tier.name} is no longer sold.` : `${tier.name} is available again.`,
    },
  );

  const onToggle = async (tier: Membership): Promise<void> => {
    if (tier.active) {
      const holders = membershipHolderCount(tier.id);
      const result = await confirm({
        title: `Stop selling ${tier.name}?`,
        description:
          holders > 0
            ? `${holders} customer${holders === 1 ? '' : 's'} currently hold this tier. They keep their benefits until it expires, but no new ones can be sold.`
            : 'No new memberships of this tier can be sold.',
        confirmLabel: 'Deactivate tier',
        tone: 'warning',
      });
      if (!result.confirmed) return;
    }
    await toggle.run(tier);
  };

  return (
    <>
      <PageHeader
        title="Memberships"
        description="Tiers that give customers an automatic discount at the till."
        actions={
          <Button
            leftIcon={<Plus />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New tier
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Tiers offered" value={db.memberships.filter((m) => m.active).length} icon={<BadgePercent />} />
        <StatCard label="Active members" value={summary.activeCount} icon={<Users />} />
        <StatCard
          label="Expiring in 30 days"
          value={summary.expiringSoon}
          tone={summary.expiringSoon > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Membership revenue"
          value={formatCurrency(summary.revenue, { compact: true })}
          hint="Value of active tiers"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {db.memberships.map((tier) => {
          const holders = membershipHolderCount(tier.id);

          return (
            <Card key={tier.id} className={cn('flex flex-col', !tier.active && 'opacity-70')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    {tier.name}
                    {!tier.active && <Badge tone="neutral">Inactive</Badge>}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-muted">{tier.description}</p>
                </div>

                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"
                  aria-hidden
                >
                  <BadgePercent className="h-5 w-5" />
                </span>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold tabular-nums text-ink">
                  {formatCurrency(tier.price)}
                </span>
                <span className="text-[13px] text-muted">
                  for {tier.validityDays >= 365 ? '1 year' : `${tier.validityDays} days`}
                </span>
              </div>

              <div className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-ok-soft px-2.5 py-1">
                <span className="text-[13px] font-semibold text-ok">{tier.discountPct}% off</span>
                <span className="text-xs text-ok/80">every service</span>
              </div>

              <ul className="mt-4 flex-1 space-y-1.5 border-t border-line pt-3">
                {tier.benefits.map((benefit) => (
                  <li key={benefit} className="flex gap-2 text-[13px] text-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
                    {benefit}
                  </li>
                ))}
              </ul>

              {tier.includedServiceIds.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Included free
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tier.includedServiceIds.map((id) => (
                      <Badge key={id} tone="brand">
                        {db.services.find((s) => s.id === id)?.name ?? 'Removed service'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {holders} {holders === 1 ? 'member' : 'members'}
                </span>

                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Pencil />}
                    onClick={() => {
                      setEditing(tier);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void onToggle(tier)}>
                    {tier.active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void del({
                        title: `Delete ${tier.name}?`,
                        run: () => deleteService.deleteMembership(tier.id),
                        done: `${tier.name} deleted.`,
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

      {/* ---------------- Members list ---------------- */}
      <Card className="mt-5" flush>
        <div className="p-5 pb-0">
          <CardHeader title="Current members" description="Who holds a tier and when it lapses" />
        </div>

        <MemberList />
      </Card>

      <MembershipFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        membership={editing}
      />
    </>
  );
}

function MemberList(): JSX.Element {
  const db = useDb();

  const rows = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return db.customerMemberships
      .filter((m) => m.status === 'active' && m.expiresOn >= today)
      .map((held) => ({
        held,
        customer: db.customers.find((c) => c.id === held.customerId),
        tier: db.memberships.find((t) => t.id === held.membershipId),
        daysLeft: Math.ceil((new Date(held.expiresOn).getTime() - Date.now()) / 86400000),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [db.customerMemberships, db.customers, db.memberships]);

  if (rows.length === 0) {
    return <EmptyState title="No active memberships" description="Assign one from a customer's profile." />;
  }

  return (
    <ul className="mt-4 divide-y divide-line">
      {rows.slice(0, 12).map(({ held, customer, tier, daysLeft }) => (
        <li key={held.id} className="flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{customer?.name ?? 'Unknown'}</p>
            <p className="truncate text-xs text-muted">
              {db.shops.find((s) => s.id === held.shopId)?.name ?? '—'}
            </p>
          </div>

          <Badge tone="brand">{tier?.name ?? '—'}</Badge>

          <div className="w-32 shrink-0 text-right">
            <p className="text-[13px] text-ink">{formatDate(held.expiresOn)}</p>
            <p
              className={cn(
                'text-xs tabular-nums',
                daysLeft <= 30 ? 'text-warn' : 'text-subtle',
              )}
            >
              {daysLeft} days left
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MembershipFormModal({
  open,
  onClose,
  membership,
}: {
  open: boolean;
  onClose: () => void;
  membership: Membership | null;
}): JSX.Element {
  const db = useDb();
  const isEdit = Boolean(membership);

  const [name, setName] = useState<Membership['name']>('Silver');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [validityDays, setValidityDays] = useState('365');
  const [discountPct, setDiscountPct] = useState('10');
  const [benefits, setBenefits] = useState('');
  const [includedServiceIds, setIncludedServiceIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(membership?.name ?? 'Silver');
    setDescription(membership?.description ?? '');
    setPrice(String(membership?.price ?? ''));
    setValidityDays(String(membership?.validityDays ?? 365));
    setDiscountPct(String(membership?.discountPct ?? 10));
    setBenefits((membership?.benefits ?? []).join('\n'));
    setIncludedServiceIds(membership?.includedServiceIds ?? []);
  }, [open, membership]);

  const save = useAsyncAction(
    async () => {
      const payload = {
        name,
        description,
        price: Number(price) || 0,
        validityDays: Number(validityDays) || 365,
        discountPct: Number(discountPct) || 0,
        benefits: benefits
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        includedServiceIds,
      };
      return membership
        ? catalogService.updateMembership(membership.id, payload)
        : catalogService.createMembership(payload);
    },
    {
      successMessage: (saved) => (isEdit ? `${saved.name} was updated.` : `${saved.name} was created.`),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!save.pending}
      size="lg"
      title={isEdit ? 'Edit membership tier' : 'New membership tier'}
      description="The discount here is applied automatically to every bill a member pays."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button loading={save.pending} onClick={() => void save.run()}>
            {isEdit ? 'Save changes' : 'Create tier'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tier"
            required
            value={name}
            onChange={(e) => setName(e.target.value as Membership['name'])}
            options={[
              { value: 'Silver', label: 'Silver' },
              { value: 'Gold', label: 'Gold' },
              { value: 'Platinum', label: 'Platinum' },
            ]}
          />

          <Input
            label="Price"
            required
            type="number"
            min={0}
            step={500}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

        <Textarea
          label="Description"
          rows={2}
          placeholder="Who this tier suits"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Validity (days)"
            required
            type="number"
            min={30}
            step={30}
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            hint="365 for a yearly membership"
          />

          <Input
            label="Discount %"
            required
            type="number"
            min={0}
            max={50}
            value={discountPct}
            onChange={(e) => setDiscountPct(e.target.value)}
            hint="Applied to every service on the bill"
          />
        </div>

        <Textarea
          label="Benefits"
          rows={5}
          placeholder={'One benefit per line\ne.g. Priority booking on weekdays'}
          hint="Each line becomes a bullet on the membership card."
          value={benefits}
          onChange={(e) => setBenefits(e.target.value)}
        />

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink">
            Services included at no charge
          </legend>

          <div className="grid max-h-44 gap-2 overflow-y-auto rounded-xl border border-line p-3 sm:grid-cols-2">
            {db.services
              .filter((s) => s.active)
              .map((service) => (
                <Checkbox
                  key={service.id}
                  label={service.name}
                  description={formatCurrency(service.price)}
                  checked={includedServiceIds.includes(service.id)}
                  onChange={() =>
                    setIncludedServiceIds((current) =>
                      current.includes(service.id)
                        ? current.filter((id) => id !== service.id)
                        : [...current, service.id],
                    )
                  }
                />
              ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

export default MembershipsPage;
