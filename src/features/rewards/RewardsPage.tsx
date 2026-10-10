import { useMemo, useState } from 'react';
import { Gift, MessageCircle, Pencil, Plus, TicketPercent, Trash2 } from 'lucide-react';
import type { Coupon, Voucher } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDate } from '@/utils/date';
import { matches } from '@/utils/text';
import { openWhatsApp } from '@/utils/whatsapp';
import { timestampedName } from '@/utils/export';
import { downloadExcel } from '@/utils/excel';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import { useAuthStore } from '@/store/authStore';
import * as rewards from '@/services/rewardsService';
import { deleteVoucher } from '@/services/deleteService';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Switch } from '@/components/ui/Switch';
import { EmptyState } from '@/components/ui/States';
import { StatCard } from '@/components/ui/StatCard';

export function RewardsPage(): JSX.Element {
  const [tab, setTab] = useState<'vouchers' | 'coupons'>('vouchers');
  return (
    <>
      <PageHeader
        title="Vouchers & coupons"
        description="Gift vouchers customers buy for others, and promotion codes for the till."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'vouchers', label: 'Gift vouchers' },
          { value: 'coupons', label: 'Coupons' },
        ]}
        className="mb-4"
      />
      <TabPanel active={tab === 'vouchers'}>
        <VouchersTab />
      </TabPanel>
      <TabPanel active={tab === 'coupons'}>
        <CouponsTab />
      </TabPanel>
    </>
  );
}

// ---------------------------------------------------------------- vouchers

function VouchersTab(): JSX.Element {
  const db = useDb();
  const { shopId } = useShopScope();
  const actor = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const del = useDeleteAction();
  const [form, setForm] = useState({
    value: '5000',
    recipientName: '',
    recipientPhone: '',
    purchasedBy: '',
    expiresOn: '',
    notes: '',
    paidBy: 'cash' as 'cash' | 'card' | 'bank-transfer' | 'other',
  });

  const rows = useMemo(
    () =>
      db.vouchers.filter(
        (v) => !search || matches(`${v.code} ${v.recipientName} ${v.recipientPhone} ${v.purchasedBy}`, search),
      ),
    [db.vouchers, search],
  );
  const outstanding = db.vouchers.filter((v) => v.active).reduce((s, v) => s + v.balance, 0);

  const sell = useAsyncAction(
    async () => {
      if (!shopId || !actor) throw new Error('Pick a branch first.');
      return rewards.sellVoucher(
        {
          shopId,
          value: Number(form.value),
          recipientName: form.recipientName,
          recipientPhone: form.recipientPhone,
          purchasedBy: form.purchasedBy,
          expiresOn: form.expiresOn || null,
          notes: form.notes,
          paidBy: form.paidBy,
        },
        actor,
      );
    },
    {
      successMessage: (v) => `Voucher ${v.code} issued for ${formatCurrency(v.initialValue)}.`,
      onSuccess: () => setOpen(false),
    },
  );

  const share = (v: Voucher): void =>
    openWhatsApp(
      v.recipientPhone,
      `🎁 *Gift voucher from ${db.settings.business.name}*\n\nDear ${v.recipientName},\n${
        v.purchasedBy ? `${v.purchasedBy} has sent you` : 'You have'
      } a gift voucher worth *${formatCurrency(v.initialValue)}*.\n\nVoucher code: *${v.code}*${
        v.expiresOn ? `\nValid until ${formatDate(v.expiresOn)}` : ''
      }\n\nBook your appointment and show this code at the counter. 💐`,
    );

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        <StatCard label="Vouchers issued" value={db.vouchers.length} icon={<Gift />} />
        <StatCard label="Unspent balance" value={formatCurrency(outstanding)} hint="Owed to customers as services" />
        <StatCard
          label="Redeemed so far"
          value={formatCurrency(db.vouchers.reduce((s, v) => s + (v.initialValue - v.balance), 0))}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Search code, name or phone" />
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void downloadExcel(
                rows,
                [
                  { header: 'Code', value: (v) => v.code },
                  { header: 'For', value: (v) => v.recipientName },
                  { header: 'Phone', value: (v) => v.recipientPhone },
                  { header: 'Bought by', value: (v) => v.purchasedBy },
                  { header: 'Value', value: (v) => v.initialValue },
                  { header: 'Balance', value: (v) => v.balance },
                  { header: 'Expires', value: (v) => v.expiresOn ?? '' },
                  { header: 'Issued', value: (v) => v.createdAt.slice(0, 10) },
                ],
                timestampedName('gift-vouchers'),
              )
            }
          >
            Export
          </Button>
          <Button
            leftIcon={<Plus />}
            disabled={!shopId}
            title={!shopId ? 'Pick a single branch first' : undefined}
            onClick={() => setOpen(true)}
          >
            Sell voucher
          </Button>
        </div>
      </div>

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={<Gift />} title="No gift vouchers yet" description="Sell one when a customer wants to gift a visit." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium">For</th>
                  <th className="px-3 py-2.5 text-right font-medium">Value</th>
                  <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-3 py-2.5 font-medium">Expires</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((v) => {
                  const expired = v.expiresOn !== null && v.expiresOn < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={v.id}>
                      <td className="px-5 py-2.5 font-mono font-medium text-ink">{v.code}</td>
                      <td className="px-3 py-2.5 text-ink">
                        {v.recipientName}
                        <span className="block text-xs text-muted">{v.recipientPhone}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(v.initialValue)}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrency(v.balance)}</td>
                      <td className="px-3 py-2.5 text-muted">{v.expiresOn ? formatDate(v.expiresOn) : 'No expiry'}</td>
                      <td className="px-3 py-2.5">
                        {!v.active ? (
                          <Badge tone="neutral">Cancelled</Badge>
                        ) : expired ? (
                          <Badge tone="danger">Expired</Badge>
                        ) : v.balance <= 0 ? (
                          <Badge tone="neutral">Used</Badge>
                        ) : (
                          <Badge tone="ok">Active</Badge>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Button variant="ghost" size="sm" leftIcon={<MessageCircle />} onClick={() => share(v)}>
                          Send
                        </Button>
                        {actor?.role === 'admin' && (
                          <Button variant="ghost" size="sm" onClick={() => void rewards.setVoucherActive(v.id, !v.active)}>
                            {v.active ? 'Cancel' : 'Restore'}
                          </Button>
                        )}
                        {actor?.role === 'admin' && v.balance === v.initialValue && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void del({
                                title: `Delete voucher ${v.code}?`,
                                description: 'For a voucher issued by mistake. Give the customer their money back separately.',
                                run: () => deleteVoucher(v.id),
                                done: 'Voucher deleted.',
                              })
                            }
                          >
                            Delete
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Sell a gift voucher"
        description="The voucher is not counted as revenue until it is spent on a bill."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={sell.pending} onClick={() => void sell.run()}>
              Issue voucher
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Value" type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <Select
            label="Paid by"
            value={form.paidBy}
            onChange={(e) => setForm({ ...form, paidBy: e.target.value as typeof form.paidBy })}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' },
              { value: 'bank-transfer', label: 'Bank transfer' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <Input label="For (recipient)" value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
          <Input label="Recipient's phone" value={form.recipientPhone} onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })} />
          <Input label="Bought by" value={form.purchasedBy} onChange={(e) => setForm({ ...form, purchasedBy: e.target.value })} />
          <Input label="Expires on (optional)" type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} />
          <div className="sm:col-span-2">
            <Textarea label="Message / notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </Modal>
    </>
  );
}

// ----------------------------------------------------------------- coupons

const blankCoupon: rewards.CouponInput = {
  code: '',
  name: '',
  mode: 'percent',
  value: 10,
  minSpend: 0,
  startsOn: null,
  endsOn: null,
  maxUses: 0,
  shopId: null,
  active: true,
};

function CouponsTab(): JSX.Element {
  const db = useDb();
  const confirm = useConfirm();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<rewards.CouponInput>(blankCoupon);

  const save = useAsyncAction(async () => rewards.saveCoupon(form, editing?.id ?? null), {
    successMessage: (c) => `Coupon ${c.code} saved.`,
    onSuccess: () => setOpen(false),
  });

  const edit = (c: Coupon | null): void => {
    setEditing(c);
    setForm(c ? { ...c } : blankCoupon);
    setOpen(true);
  };

  const remove = async (c: Coupon): Promise<void> => {
    const r = await confirm({ title: `Delete ${c.code}?`, description: 'Bills that used it keep their discount.', confirmLabel: 'Delete', tone: 'danger' });
    if (r.confirmed) await rewards.deleteCoupon(c.id);
  };

  return (
    <>
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <Button leftIcon={<Plus />} onClick={() => edit(null)}>
            New coupon
          </Button>
        </div>
      )}
      <Card flush>
        {db.coupons.length === 0 ? (
          <EmptyState
            icon={<TicketPercent />}
            title="No coupons yet"
            description={isAdmin ? 'Create codes like EID25 for campaigns; the till checks dates, uses and minimum spend.' : 'The owner has not created any coupons.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium">Discount</th>
                  <th className="px-3 py-2.5 font-medium">Valid</th>
                  <th className="px-3 py-2.5 text-right font-medium">Used</th>
                  <th className="px-3 py-2.5 font-medium">Branch</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  {isAdmin && <th className="px-5 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {db.coupons.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-2.5">
                      <span className="font-mono font-medium text-ink">{c.code}</span>
                      <span className="block text-xs text-muted">{c.name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-ink">
                      {c.mode === 'percent' ? `${c.value}%` : formatCurrency(c.value)}
                      {c.minSpend > 0 && <span className="block text-xs text-muted">min {formatCurrency(c.minSpend)}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {c.startsOn ? formatDate(c.startsOn) : 'Any time'} – {c.endsOn ? formatDate(c.endsOn) : 'no end'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {rewards.couponUses(c.code, db)}
                      {c.maxUses > 0 && ` / ${c.maxUses}`}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{c.shopId ? db.shops.find((s) => s.id === c.shopId)?.name : 'All'}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={c.active ? 'ok' : 'neutral'}>{c.active ? 'Active' : 'Off'}</Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-2.5 text-right">
                        <Button variant="ghost" size="sm" leftIcon={<Pencil />} onClick={() => edit(c)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" leftIcon={<Trash2 />} onClick={() => void remove(c)}>
                          Delete
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'New coupon'}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={save.pending} onClick={() => void save.run()}>
              Save coupon
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Code" placeholder="EID25" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <Input label="Name" placeholder="Eid special" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select
            label="Type"
            value={form.mode}
            onChange={(e) => setForm({ ...form, mode: e.target.value as 'percent' | 'amount' })}
            options={[
              { value: 'percent', label: 'Percentage off' },
              { value: 'amount', label: 'Fixed amount off' },
            ]}
          />
          <Input label={form.mode === 'percent' ? 'Percent off' : 'Amount off'} type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
          <Input label="Minimum bill" type="number" min={0} value={form.minSpend} onChange={(e) => setForm({ ...form, minSpend: Number(e.target.value) })} />
          <Input label="Maximum uses (0 = unlimited)" type="number" min={0} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} />
          <Input label="Starts on" type="date" value={form.startsOn ?? ''} onChange={(e) => setForm({ ...form, startsOn: e.target.value || null })} />
          <Input label="Ends on" type="date" value={form.endsOn ?? ''} onChange={(e) => setForm({ ...form, endsOn: e.target.value || null })} />
          <Select
            label="Branch"
            value={form.shopId ?? ''}
            onChange={(e) => setForm({ ...form, shopId: e.target.value || null })}
            options={[{ value: '', label: 'All branches' }, ...db.shops.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <div className="flex items-end pb-2">
            <Switch label="Active" checked={form.active} onChange={(active) => setForm({ ...form, active })} />
          </div>
        </div>
      </Modal>
    </>
  );
}

export default RewardsPage;
