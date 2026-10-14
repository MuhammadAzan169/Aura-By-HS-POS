import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, CheckCircle2, Copy, FileImage, Landmark, MessageCircle, Smartphone, Wallet, XCircle } from 'lucide-react';
import type { MoneyMethod, OnlineMethod, OnlinePayment, OnlinePaymentStatus } from '@/types';
import { formatDateTime, toISODate } from '@/utils/date';
import { formatCurrency } from '@/utils/money';
import { matches } from '@/utils/text';
import { openWhatsApp } from '@/utils/whatsapp';
import { downloadExcel } from '@/utils/excel';
import { timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import * as online from '@/services/onlinePaymentService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { StatCard } from '@/components/ui/StatCard';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/States';

const STATUS_TONE: Record<OnlinePaymentStatus, 'neutral' | 'info' | 'brand' | 'ok' | 'warn' | 'danger'> = {
  pending: 'neutral',
  processing: 'info',
  verifying: 'warn',
  paid: 'ok',
  failed: 'danger',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
};
const STATUS_LABEL: Record<OnlinePaymentStatus, string> = {
  pending: 'Waiting for customer',
  processing: 'With gateway',
  verifying: 'Receipt to check',
  paid: 'Paid',
  failed: 'Failed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};
const PURPOSE_LABEL = { appointment: 'Appointment', bridal: 'Bridal', sale: 'Bill balance', voucher: 'Gift voucher' } as const;
const METHOD_ICON: Record<MoneyMethod, JSX.Element> = {
  cash: <Banknote />,
  card: <Wallet />,
  'bank-transfer': <Landmark />,
  jazzcash: <Smartphone />,
  easypaisa: <Smartphone />,
  other: <Wallet />,
};

export function OnlinePaymentsPage(): JSX.Element {
  const db = useDb();
  const { shopId } = useShopScope();
  const actor = useAuthStore((s) => s.user);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'payments' | 'platforms'>('payments');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | OnlinePaymentStatus | 'open'>('');
  const [method, setMethod] = useState('');
  const [openId, setOpenId] = useState<string | null>(params.get('id'));
  const [slip, setSlip] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ method: OnlineMethod; reference: string } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const today = toISODate(new Date());
  const [from, setFrom] = useState(toISODate(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(today);
  const branch = (id: string): string => db.shops.find((s) => s.id === id)?.name ?? '';

  const scoped = useMemo(() => db.onlinePayments.filter((p) => shopId === null || p.shopId === shopId), [db.onlinePayments, shopId]);
  const rows = useMemo(
    () =>
      scoped
        .filter((p) => (status === 'open' ? ['pending', 'processing', 'verifying'].includes(p.status) : !status || p.status === status))
        .filter((p) => !method || p.method === method)
        .filter((p) => !search || matches(`${p.customerName} ${p.customerPhone} ${p.paymentNo} ${p.refLabel} ${p.gatewayRef ?? ''}`, search))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [scoped, status, method, search],
  );
  const current = openId ? db.onlinePayments.find((p) => p.id === openId) ?? null : null;
  const paidToday = scoped.filter((p) => p.status === 'paid' && (p.paidAt ?? '').slice(0, 10) === today);

  useEffect(() => {
    setSlip(null);
    if (current?.slipPath) void online.slipUrl(current).then(setSlip);
  }, [current?.id, current?.slipPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const ledger = useMemo(() => online.moneyLedger(shopId, from, to, db), [shopId, from, to, db]);
  const byMethod = online.totalsByMethod(ledger);
  const onlineTotal = ledger.filter((r) => r.channel === 'online').reduce((s, r) => s + r.amount, 0);

  const close = (): void => {
    setOpenId(null);
    setVerify(null);
    if (params.get('id')) {
      params.delete('id');
      setParams(params, { replace: true });
    }
  };

  const doVerify = async (p: OnlinePayment): Promise<void> => {
    if (!actor || !verify) return;
    try {
      await online.markReceived(p.id, verify, actor);
      toast.success(`${formatCurrency(p.amount)} recorded on ${p.refLabel}.`);
      setVerify(null);
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <>
      <PageHeader
        title="Online payments"
        description="Money paid from the app, the website and payment links — JazzCash, Easypaisa, card and bank transfer."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              void (tab === 'payments'
                ? downloadExcel(
                    rows,
                    [
                      { header: 'Created', value: (p) => formatDateTime(p.createdAt) },
                      { header: 'Payment no.', value: (p) => p.paymentNo },
                      { header: 'Branch', value: (p) => branch(p.shopId) },
                      { header: 'Customer', value: (p) => p.customerName },
                      { header: 'Phone', value: (p) => p.customerPhone },
                      { header: 'For', value: (p) => p.refLabel },
                      { header: 'Amount', value: (p) => p.amount },
                      { header: 'Method', value: (p) => (p.method ? online.METHOD_LABEL[p.method] : '') },
                      { header: 'Status', value: (p) => STATUS_LABEL[p.status] },
                      { header: 'Gateway ref', value: (p) => p.gatewayRef ?? '' },
                      { header: 'Paid at', value: (p) => (p.paidAt ? formatDateTime(p.paidAt) : '') },
                    ],
                    timestampedName('online-payments'),
                  )
                : downloadExcel(
                    ledger,
                    [
                      { header: 'Date', value: (r) => formatDateTime(r.at) },
                      { header: 'Branch', value: (r) => branch(r.shopId) },
                      { header: 'Customer', value: (r) => r.customerName },
                      { header: 'Platform', value: (r) => online.MONEY_METHOD_LABEL[r.method] },
                      { header: 'Amount', value: (r) => r.amount },
                      { header: 'For', value: (r) => r.kind },
                      { header: 'Where', value: (r) => (r.channel === 'online' ? 'Online' : 'At the counter') },
                      { header: 'Reference', value: (r) => r.reference },
                    ],
                    timestampedName('money-by-platform'),
                  ))
            }
          >
            Export
          </Button>
        }
      />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'payments', label: 'Payments', count: scoped.filter((p) => p.status === 'verifying').length || undefined },
          { value: 'platforms', label: 'Money by platform' },
        ]}
      />

      {tab === 'payments' ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-4">
            <StatCard label="Receipts to check" value={scoped.filter((p) => p.status === 'verifying').length} icon={<FileImage />} />
            <StatCard label="Paid today" value={formatCurrency(paidToday.reduce((s, p) => s + p.amount, 0))} hint={`${paidToday.length} payments`} />
            <StatCard label="Waiting for customer" value={scoped.filter((p) => p.status === 'pending' || p.status === 'processing').length} />
            <StatCard label="Paid online (all time)" value={formatCurrency(scoped.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0))} />
          </div>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <SearchBar value={search} onChange={setSearch} placeholder="Customer, phone, payment no. or reference" />
            <Select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              options={[{ value: '', label: 'Any status' }, { value: 'open', label: 'Open' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]}
            />
            <Select aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: '', label: 'Any method' }, ...Object.entries(online.METHOD_LABEL).map(([value, label]) => ({ value, label }))]} />
          </div>
          <Card flush>
            {rows.length === 0 ? (
              <EmptyState icon={<Smartphone />} title="No online payments yet" description="Payments from the Aura app and the links you send appear here the moment they are made." />
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setOpenId(p.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left hover:bg-canvas">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">
                          {p.customerName} · {formatCurrency(p.amount)}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {PURPOSE_LABEL[p.purpose]} · {p.refLabel} · {p.paymentNo}
                          {shopId === null && ` · ${branch(p.shopId)}`}
                        </span>
                      </span>
                      <span className="text-xs text-subtle">
                        {p.method ? online.METHOD_LABEL[p.method] : 'not chosen'} · {p.channel === 'link' ? `link by ${p.createdBy}` : p.channel} · {formatDateTime(p.createdAt)}
                      </span>
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(Object.keys(byMethod) as MoneyMethod[]).map((m) => (
              <StatCard key={m} label={online.MONEY_METHOD_LABEL[m]} value={formatCurrency(Math.round(byMethod[m]))} icon={METHOD_ICON[m]} hint={`${ledger.filter((r) => r.method === m).length} payments`} />
            ))}
          </div>
          <p className="mb-3 text-sm text-muted">
            {formatCurrency(Math.round(ledger.reduce((s, r) => s + r.amount, 0)))} received in this period · {formatCurrency(onlineTotal)} of it online. Spending from advances, vouchers and points is not counted twice.
          </p>
          <Card flush>
            {ledger.length === 0 ? (
              <EmptyState icon={<Wallet />} title="Nothing received in this period" description="Choose other dates." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-5 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Customer</th>
                      <th className="px-3 py-2.5">Platform</th>
                      <th className="px-3 py-2.5">For</th>
                      <th className="px-3 py-2.5">Where</th>
                      {shopId === null && <th className="px-3 py-2.5">Branch</th>}
                      <th className="px-5 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ledger.slice(0, 500).map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-5 py-2.5 text-muted">{formatDateTime(r.at)}</td>
                        <td className="px-3 py-2.5 text-ink">{r.customerName}</td>
                        <td className="px-3 py-2.5">{online.MONEY_METHOD_LABEL[r.method]}</td>
                        <td className="px-3 py-2.5 text-muted">{r.kind} · {r.reference.slice(0, 40)}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={r.channel === 'online' ? 'brand' : 'neutral'}>{r.channel === 'online' ? 'Online' : 'Counter'}</Badge>
                        </td>
                        {shopId === null && <td className="px-3 py-2.5 text-muted">{branch(r.shopId)}</td>}
                        <td className="px-5 py-2.5 text-right font-medium text-ink">{formatCurrency(Math.round(r.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={current !== null}
        onClose={close}
        title={current ? `${formatCurrency(current.amount)} · ${current.customerName}` : ''}
        description={current ? `${current.paymentNo} · ${PURPOSE_LABEL[current.purpose]} · ${current.refLabel}` : undefined}
        size="md"
        footer={<Button onClick={close}>Close</Button>}
      >
        {current && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[current.status]}>{STATUS_LABEL[current.status]}</Badge>
              {current.method && <Badge tone="info">{online.METHOD_LABEL[current.method]}</Badge>}
              {current.gateway === 'simulator' && <Badge tone="warn">test checkout</Badge>}
            </div>
            <dl className="space-y-1 rounded-xl bg-canvas p-3.5 text-sm">
              <Row k="Branch" v={branch(current.shopId)} />
              <Row k="Phone" v={current.customerPhone || '—'} />
              <Row k="Made by" v={current.channel === 'link' ? `${current.createdBy} (payment link)` : current.channel === 'app' ? 'Customer, in the app' : 'Website'} />
              <Row k="Created" v={formatDateTime(current.createdAt)} />
              {current.paidAt && <Row k="Paid" v={`${formatDateTime(current.paidAt)}${current.verifiedBy ? ` · ${current.verifiedBy}` : ''}`} />}
              {current.gatewayRef && <Row k="Gateway ref" v={current.gatewayRef} />}
              {current.gatewayMessage && <Row k="Gateway says" v={current.gatewayMessage} />}
              {current.payerNote && <Row k="Customer note" v={current.payerNote} />}
              {current.rejectReason && <Row k="Rejected because" v={current.rejectReason} />}
              {current.voucher?.code && <Row k="Voucher issued" v={current.voucher.code} />}
            </dl>

            {current.slipPath && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Transfer receipt</p>
                {slip ? (
                  /\.pdf$/i.test(current.slipPath) ? (
                    <a className="text-sm text-brand underline" href={slip} target="_blank" rel="noreferrer">Open the PDF receipt</a>
                  ) : (
                    <a href={slip} target="_blank" rel="noreferrer">
                      <img src={slip} alt="Bank transfer receipt" className="max-h-80 rounded-xl border border-line object-contain" />
                    </a>
                  )
                ) : (
                  <p className="text-sm text-muted">The receipt is stored online; it shows here when the POS is connected to the database.</p>
                )}
              </div>
            )}

            {!current.appliedAt && ['verifying', 'pending', 'processing', 'failed'].includes(current.status) && (
              <div className="rounded-xl border border-line p-3.5">
                {verify ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      label="Received by"
                      value={verify.method}
                      onChange={(e) => setVerify({ ...verify, method: e.target.value as OnlineMethod })}
                      options={Object.entries(online.METHOD_LABEL).map(([value, label]) => ({ value, label }))}
                    />
                    <Input label="Transaction / bank reference" value={verify.reference} onChange={(e) => setVerify({ ...verify, reference: e.target.value })} />
                    <div className="flex gap-2 sm:col-span-2">
                      <Button leftIcon={<CheckCircle2 />} onClick={() => void doVerify(current)}>
                        Record {formatCurrency(current.amount)}
                      </Button>
                      <Button variant="ghost" onClick={() => setVerify(null)}>
                        Back
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button leftIcon={<CheckCircle2 />} onClick={() => setVerify({ method: current.method ?? 'bank-transfer', reference: current.gatewayRef ?? '' })}>
                      {current.status === 'verifying' ? 'Money received — verify' : 'Mark as received'}
                    </Button>
                    {current.status === 'verifying' && (
                      <Button variant="danger" leftIcon={<XCircle />} onClick={() => setRejecting('')}>
                        Reject receipt
                      </Button>
                    )}
                    {current.status !== 'verifying' && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void online.cancel(current.id).then(
                            () => toast.success('Link cancelled.'),
                            (e: unknown) => toast.fromError(e),
                          )
                        }
                      >
                        Cancel link
                      </Button>
                    )}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted">Only verify once the money shows in the bank or wallet statement.</p>
              </div>
            )}

            {['pending', 'failed'].includes(current.status) && !online.payLinkReady(db) && (
              <p className="text-xs text-warn">
                Add the payments API address in Settings → Online payments before resending — there
                is no link to send without it.
              </p>
            )}

            {['pending', 'failed'].includes(current.status) && online.payLinkReady(db) && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<MessageCircle />}
                  onClick={() =>
                    openWhatsApp(
                      current.customerPhone,
                      `Assalam o Alaikum ${current.customerName}! Your payment link from ${db.settings.business.name} for ${formatCurrency(current.amount)}:\n${online.payUrl(current, db)}`,
                    )
                  }
                >
                  Resend on WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Copy />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(online.payUrl(current, db));
                    toast.success('Link copied.');
                  }}
                >
                  Copy link
                </Button>
              </div>
            )}

            {current.attempts.length > 0 && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">History ({current.attempts.length})</summary>
                <ul className="mt-2 space-y-1">
                  {current.attempts.map((a, i) => (
                    <li key={i}>
                      {formatDateTime(a.at)} · {a.status} · {a.gateway ?? ''} {a.gatewayMessage ?? ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={rejecting !== null && current !== null}
        onClose={() => setRejecting(null)}
        title="Reject this receipt?"
        description="The customer sees your reason in the app and can upload another receipt or pay another way."
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!current || !actor) return;
                void online.reject(current.id, rejecting ?? '', actor).then(
                  () => {
                    toast.success('Receipt rejected.');
                    setRejecting(null);
                  },
                  (e: unknown) => toast.fromError(e),
                );
              }}
            >
              Reject
            </Button>
          </>
        }
      >
        <Textarea label="Reason" rows={3} placeholder="e.g. Amount does not match / money not received" value={rejecting ?? ''} onChange={(e) => setRejecting(e.target.value)} />
      </Modal>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </div>
  );
}

export default OnlinePaymentsPage;
