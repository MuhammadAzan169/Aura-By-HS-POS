import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Download, Lock, MessageCircle, Unlock, Wallet } from 'lucide-react';
import { openWhatsApp } from '@/utils/whatsapp';
import type { RegisterSession } from '@/types';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/money';
import { formatDateTime } from '@/utils/date';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthStore } from '@/store/authStore';
import * as registerService from '@/services/registerService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { PickBranch } from '@/components/shared/PickBranch';

export function RegisterPage(): JSX.Element {
  const db = useDb();
  const { shopId, shop } = useShopScope();
  const actor = useAuthStore((s) => s.user);

  const [float, setFloat] = useState('5000');
  const [movement, setMovement] = useState<'in' | 'out' | null>(null);
  const [mvAmount, setMvAmount] = useState('');
  const [mvReason, setMvReason] = useState('');
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');

  const session = shopId ? registerService.openSession(shopId, db) : null;
  const summary = session ? registerService.summarise(session, db) : null;
  const history = shopId ? registerService.sessionsFor(shopId, db).filter((s) => s.closedAt) : [];

  const openTill = useAsyncAction(
    async () => {
      if (!shopId || !actor) throw new Error('Pick a branch.');
      return registerService.open(shopId, Number(float), actor);
    },
    { successMessage: 'Till opened. Have a good day!' },
  );

  const move = useAsyncAction(
    async () => {
      if (!session || !actor || !movement) throw new Error('The till is not open.');
      return registerService.addMovement(session.id, movement, Number(mvAmount), mvReason, actor);
    },
    {
      successMessage: 'Recorded.',
      onSuccess: () => {
        setMovement(null);
        setMvAmount('');
        setMvReason('');
      },
    },
  );

  const closeTill = useAsyncAction(
    async () => {
      if (!session || !actor) throw new Error('The till is not open.');
      return registerService.close(session.id, Number(counted), notes, actor);
    },
    {
      successMessage: (s) =>
        s.difference === 0
          ? 'Till closed — the drawer balances.'
          : `Till closed — ${formatCurrency(Math.abs(s.difference ?? 0))} ${(s.difference ?? 0) > 0 ? 'over' : 'short'}.`,
      onSuccess: (s) => {
        setClosing(false);
        setCounted('');
        setNotes('');
        void downloadZ(s);
      },
    },
  );

  const sendSummary = (s: RegisterSession): void => {
    const sum = registerService.summarise(s, db);
    const d = s.difference ?? 0;
    const lines = [
      `*Day close — ${db.shops.find((x) => x.id === s.shopId)?.name ?? ''}*`,
      formatDateTime(s.closedAt ?? s.openedAt),
      '',
      `Bills: ${sum.bills}  ·  Sales: ${formatCurrency(sum.grossSales)}`,
      `Cash ${formatCurrency(sum.byMethod.cash)} · Card ${formatCurrency(sum.byMethod.card)} · Transfer ${formatCurrency(sum.byMethod['bank-transfer'])}`,
      `Discounts ${formatCurrency(sum.discounts)} · Tips ${formatCurrency(sum.tips)} · Refunds ${formatCurrency(sum.refundedValue)}`,
      '',
      `Expected cash: ${formatCurrency(s.expectedCash ?? sum.expectedCash)}`,
      s.countedCash !== null ? `Counted: ${formatCurrency(s.countedCash)} (${d === 0 ? 'balanced' : `${d > 0 ? 'over' : 'short'} ${formatCurrency(Math.abs(d))}`})` : '',
      `Closed by ${s.closedBy ?? ''}`,
    ].filter((l) => l !== null);
    openWhatsApp(db.settings.business.phone, lines.join('\n'));
  };

  const downloadZ = async (s: RegisterSession): Promise<void> => {
    const { downloadRegisterPdf } = await import('./registerPdf');
    downloadRegisterPdf(s, registerService.summarise(s, db), db.shops.find((x) => x.id === s.shopId));
  };

  if (!shopId) {
    return (
      <>
        <PageHeader title="Day close" description="Open the till each morning and count it each night." />
        <PickBranch what="The cash drawer" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Day close"
        description={`Cash drawer for ${shop?.name ?? 'this branch'} — float, cash in and out, and the nightly count.`}
        actions={
          session && (
            <>
              <Button variant="outline" leftIcon={<ArrowDownCircle />} onClick={() => setMovement('in')}>
                Cash in
              </Button>
              <Button variant="outline" leftIcon={<ArrowUpCircle />} onClick={() => setMovement('out')}>
                Cash out
              </Button>
              <Button
                leftIcon={<Lock />}
                onClick={() => {
                  setCounted('');
                  setClosing(true);
                }}
              >
                Close till
              </Button>
            </>
          )
        }
      />

      {!session ? (
        <Card className="max-w-lg">
          <CardHeader title="The till is closed" description="Count the cash in the drawer and open the till to start the day." />
          <div className="mt-5 flex items-end gap-3">
            <Input label="Opening float" type="number" min={0} value={float} onChange={(e) => setFloat(e.target.value)} />
            <Button leftIcon={<Unlock />} loading={openTill.pending} onClick={() => void openTill.run()}>
              Open till
            </Button>
          </div>
        </Card>
      ) : (
        summary && (
          <>
            <p className="mb-4 text-sm text-muted">
              Opened {formatDateTime(session.openedAt)} by {session.openedBy} with {formatCurrency(session.openingFloat)}.
            </p>
            <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Expected cash in drawer" value={formatCurrency(summary.expectedCash)} icon={<Wallet />} />
              <StatCard label="Bills today" value={summary.bills} />
              <StatCard label="Sales value" value={formatCurrency(summary.grossSales)} />
              <StatCard label="Tips" value={formatCurrency(summary.tips)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Money received" description="By payment method since the till opened." />
                <dl className="mt-4 space-y-2 text-sm">
                  {(
                    [
                      ['cash', 'Cash'],
                      ['card', 'Card'],
                      ['bank-transfer', 'Bank transfer'],
                      ['other', 'Other'],
                      ['voucher', 'Gift vouchers redeemed'],
                      ['points', 'Loyalty points redeemed'],
                      ['wallet', 'Advances used'],
                    ] as const
                  ).map(([k, label]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-muted">{label}</dt>
                      <dd className="tabular-nums text-ink">{formatCurrency(summary.byMethod[k])}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card>
                <CardHeader title="Cash drawer" description="What should be in the drawer right now." />
                <dl className="mt-4 space-y-2 text-sm">
                  <Row label="Opening float" value={session.openingFloat} />
                  <Row label="Cash from bills" value={summary.cashSales} />
                  <Row label="Gift vouchers sold (cash)" value={summary.voucherSalesCash} />
                  <Row label="Advances taken (cash)" value={summary.advancesCash} />
                  <Row label="Refunded in cash" value={-summary.refundCash} />
                  <Row label="Advances returned" value={-summary.advanceRefundsCash} />
                  <Row label="Cash put in" value={summary.cashIn} />
                  <Row label="Cash taken out" value={-summary.cashOut} />
                  <div className="flex justify-between border-t border-line pt-2 font-semibold">
                    <dt className="text-ink">Expected</dt>
                    <dd className="tabular-nums text-ink">{formatCurrency(summary.expectedCash)}</dd>
                  </div>
                </dl>
                {session.movements.length > 0 && (
                  <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-muted">
                    {session.movements.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span>
                          {formatDateTime(m.at)} · {m.reason} · {m.byUserName}
                        </span>
                        <span className={cn('tabular-nums', m.type === 'in' ? 'text-ok' : 'text-danger')}>
                          {m.type === 'in' ? '+' : '−'}
                          {formatCurrency(m.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )
      )}

      <Card className="mt-4" flush>
        <div className="p-5">
          <CardHeader title="Previous days" description="Every closed till, with its count." />
        </div>
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">No closed tills yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-y border-line bg-canvas text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Closed</th>
                  <th className="px-3 py-2.5 font-medium">By</th>
                  <th className="px-3 py-2.5 text-right font-medium">Expected</th>
                  <th className="px-3 py-2.5 text-right font-medium">Counted</th>
                  <th className="px-3 py-2.5 text-right font-medium">Difference</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.slice(0, 60).map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-2.5 text-ink">{formatDateTime(s.closedAt ?? s.openedAt)}</td>
                    <td className="px-3 py-2.5 text-muted">{s.closedBy}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(s.expectedCash ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(s.countedCash ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {(s.difference ?? 0) === 0 ? (
                        <Badge tone="ok">Balanced</Badge>
                      ) : (
                        <Badge tone={(s.difference ?? 0) > 0 ? 'warn' : 'danger'}>
                          {(s.difference ?? 0) > 0 ? 'Over' : 'Short'} {formatCurrency(Math.abs(s.difference ?? 0))}
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Button variant="ghost" size="sm" leftIcon={<Download />} onClick={() => void downloadZ(s)}>
                        PDF
                      </Button>
                      <Button variant="ghost" size="sm" leftIcon={<MessageCircle />} onClick={() => sendSummary(s)}>
                        WhatsApp
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={movement !== null}
        onClose={() => setMovement(null)}
        title={movement === 'in' ? 'Put cash in' : 'Take cash out'}
        description={movement === 'in' ? 'e.g. extra change from the bank.' : 'e.g. petty cash for tea, or a bank deposit.'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setMovement(null)}>
              Cancel
            </Button>
            <Button loading={move.pending} onClick={() => void move.run()}>
              Record
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Amount" type="number" min={0} value={mvAmount} onChange={(e) => setMvAmount(e.target.value)} />
          <Input label="Reason" value={mvReason} onChange={(e) => setMvReason(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        title="Close the till"
        description="Count every note and coin in the drawer and enter the total."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setClosing(false)}>
              Cancel
            </Button>
            <Button loading={closeTill.pending} disabled={counted === ''} onClick={() => void closeTill.run()}>
              Close & download report
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {summary && (
            <p className="rounded-xl bg-canvas px-3.5 py-3 text-sm text-ink">
              Expected in the drawer: <strong className="tabular-nums">{formatCurrency(summary.expectedCash)}</strong>
              {counted !== '' && (
                <span className="mt-1 block text-xs text-muted">
                  Difference: {formatCurrency(Number(counted) - summary.expectedCash)}
                </span>
              )}
            </p>
          )}
          <Input label="Cash counted" type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} />
          <Textarea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }): JSX.Element | null {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{formatCurrency(value)}</dd>
    </div>
  );
}

export default RegisterPage;
