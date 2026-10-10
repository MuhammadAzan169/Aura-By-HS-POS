import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarCheck, Clock, Download, LogIn, LogOut, Wallet } from 'lucide-react';
import type { AttendanceStatus } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatTime, toISODate } from '@/utils/date';
import { downloadExcel } from '@/utils/excel';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import * as attendance from '@/services/attendanceService';
import type { PayrollLine } from '@/services/attendanceService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { PickBranch } from '@/components/shared/PickBranch';

const STATUS_TONE: Record<AttendanceStatus, 'ok' | 'warn' | 'danger' | 'info' | 'neutral'> = {
  present: 'ok',
  late: 'warn',
  'half-day': 'info',
  absent: 'danger',
  leave: 'neutral',
};

export function TeamPage(): JSX.Element {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [tab, setTab] = useState<'attendance' | 'payroll'>('attendance');
  const { shopId } = useShopScope();
  return (
    <>
      <PageHeader
        title="Attendance & payroll"
        description="Daily clock-in, monthly attendance, and salary with commission and tips."
      />
      {isAdmin && (
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'attendance', label: 'Attendance' },
            { value: 'payroll', label: 'Payroll' },
          ]}
          className="mb-4"
        />
      )}
      {!shopId ? (
        <PickBranch what="Attendance and payroll" />
      ) : (
        <>
          <TabPanel active={tab === 'attendance' || !isAdmin}>
            <AttendanceTab shopId={shopId} />
          </TabPanel>
          {isAdmin && (
            <TabPanel active={tab === 'payroll'}>
              <PayrollTab shopId={shopId} />
            </TabPanel>
          )}
        </>
      )}
    </>
  );
}

function AttendanceTab({ shopId }: { shopId: string }): JSX.Element {
  const db = useDb();
  const toast = useToast();
  const [date, setDate] = useState(toISODate(new Date()));
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const team = db.staff.filter((s) => s.shopId === shopId && s.active);
  const isToday = date === toISODate(new Date());

  const act = async (fn: () => Promise<unknown>, ok: string): Promise<void> => {
    try {
      await fn();
      toast.success(ok);
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <div className="space-y-4">
      <Card flush>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5">
          <div>
            <p className="font-display text-lg font-semibold text-ink">Daily register</p>
            <p className="text-sm text-muted">Clock staff in and out, or mark absence and leave.</p>
          </div>
          <Input label="Date" type="date" value={date} max={toISODate(new Date())} onChange={(e) => setDate(e.target.value)} />
        </div>
        {team.length === 0 ? (
          <EmptyState icon={<CalendarCheck />} title="No staff at this branch" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-y border-line bg-canvas text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Staff</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">In</th>
                  <th className="px-3 py-2.5 font-medium">Out</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {team.map((s) => {
                  const entry = db.attendance.find((a) => a.staffId === s.id && a.date === date);
                  return (
                    <tr key={s.id}>
                      <td className="px-5 py-2.5 text-ink">
                        {s.name}
                        <span className="block text-xs text-muted">{s.role}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {entry ? <Badge tone={STATUS_TONE[entry.status]}>{entry.status}</Badge> : <span className="text-xs text-subtle">Not marked</span>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{entry?.clockIn ? formatTime(entry.clockIn) : '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{entry?.clockOut ? formatTime(entry.clockOut) : '—'}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {isToday && !entry?.clockIn && (
                            <Button size="sm" leftIcon={<LogIn />} onClick={() => void act(() => attendance.clockIn(shopId, s.id), `${s.name} clocked in.`)}>
                              Clock in
                            </Button>
                          )}
                          {isToday && entry?.clockIn && !entry.clockOut && (
                            <Button size="sm" variant="outline" leftIcon={<LogOut />} onClick={() => void act(() => attendance.clockOut(shopId, s.id), `${s.name} clocked out.`)}>
                              Clock out
                            </Button>
                          )}
                          <Select
                            aria-label={`Mark ${s.name}`}
                            value=""
                            onChange={(e) =>
                              e.target.value &&
                              void act(
                                () => attendance.mark(shopId, s.id, date, { status: e.target.value as AttendanceStatus }),
                                `${s.name} marked ${e.target.value}.`,
                              )
                            }
                            options={[
                              { value: '', label: 'Mark as…' },
                              { value: 'present', label: 'Present' },
                              { value: 'late', label: 'Late' },
                              { value: 'half-day', label: 'Half day' },
                              { value: 'absent', label: 'Absent' },
                              { value: 'leave', label: 'On leave' },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card flush>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5">
          <div>
            <p className="font-display text-lg font-semibold text-ink">Monthly summary</p>
            <p className="text-sm text-muted">Days present, late, absent and hours worked.</p>
          </div>
          <div className="flex items-end gap-2">
            <Input label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <Button
              variant="outline"
              leftIcon={<Download />}
              onClick={() =>
                void downloadExcel(
                  team.map((s) => ({ s, m: attendance.monthSummary(s.id, month) })),
                  [
                    { header: 'Staff', value: (r) => r.s.name },
                    { header: 'Present', value: (r) => r.m.present },
                    { header: 'Late', value: (r) => r.m.late },
                    { header: 'Half days', value: (r) => r.m.halfDay },
                    { header: 'Absent', value: (r) => r.m.absent },
                    { header: 'Leave', value: (r) => r.m.leave },
                    { header: 'Hours', value: (r) => r.m.hours },
                  ],
                  `attendance-${month}`,
                )
              }
            >
              Export
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-y border-line bg-canvas text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-5 py-2.5 font-medium">Staff</th>
                {['Present', 'Late', 'Half', 'Absent', 'Leave', 'Hours'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {team.map((s) => {
                const m = attendance.monthSummary(s.id, month);
                return (
                  <tr key={s.id}>
                    <td className="px-5 py-2.5 text-ink">{s.name}</td>
                    {[m.present, m.late, m.halfDay, m.absent, m.leave, m.hours].map((v, i) => (
                      <td key={i} className="px-3 py-2.5 text-right tabular-nums">{v}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PayrollTab({ shopId }: { shopId: string }): JSX.Element {
  const db = useDb();
  const actor = useAuthStore((s) => s.user);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [paying, setPaying] = useState<PayrollLine | null>(null);
  const [bonus, setBonus] = useState('0');
  const [deductions, setDeductions] = useState('0');
  const [note, setNote] = useState('');

  // `db` in the deps keeps the sheet live as bills and attendance change.
  const lines = useMemo(() => attendance.payrollFor(shopId, month), [shopId, month, db]);
  const total = lines.reduce((s, l) => s + (l.paid?.netPay ?? l.suggestedNet), 0);

  const pay = useAsyncAction(
    async () => {
      if (!paying || !actor) throw new Error('Nothing to pay.');
      return attendance.pay(
        {
          shopId,
          staffId: paying.staffId,
          month,
          baseSalary: paying.baseSalary,
          commission: paying.commission,
          tips: paying.tips,
          bonus: Number(bonus) || 0,
          deductions: Number(deductions) || 0,
          note,
        },
        actor,
      );
    },
    {
      successMessage: (r) => `Salary of ${formatCurrency(r.netPay)} recorded and added to expenses.`,
      onSuccess: (r) => {
        setPaying(null);
        void import('./payslipPdf').then(({ downloadPayslip }) =>
          downloadPayslip(r, db.staff.find((s) => s.id === r.staffId), db.shops.find((s) => s.id === shopId), db.settings.business.name),
        );
      },
    },
  );

  return (
    <Card flush>
      <div className="flex flex-wrap items-end justify-between gap-3 p-5">
        <div>
          <p className="font-display text-lg font-semibold text-ink">Salary sheet</p>
          <p className="text-sm text-muted">
            Base salary (set on each staff profile) + commission on services + tips − absences. Total {formatCurrency(total)}.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Input label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Button
            variant="outline"
            leftIcon={<Download />}
            onClick={() =>
              void downloadExcel(
                lines,
                [
                  { header: 'Staff', value: (l) => l.name },
                  { header: 'Role', value: (l) => l.role },
                  { header: 'Base salary', value: (l) => l.baseSalary },
                  { header: 'Commission', value: (l) => l.commission },
                  { header: 'Tips', value: (l) => l.tips },
                  { header: 'Days absent', value: (l) => l.attendance.absent },
                  { header: 'Absence deduction', value: (l) => l.absenceDeduction },
                  { header: 'Net pay', value: (l) => l.paid?.netPay ?? l.suggestedNet },
                  { header: 'Paid on', value: (l) => l.paid?.paidOn ?? '' },
                ],
                `payroll-${month}`,
              )
            }
          >
            Export
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-y border-line bg-canvas text-left text-xs uppercase tracking-wide text-subtle">
            <tr>
              <th className="px-5 py-2.5 font-medium">Staff</th>
              <th className="px-3 py-2.5 text-right font-medium">Base</th>
              <th className="px-3 py-2.5 text-right font-medium">Commission</th>
              <th className="px-3 py-2.5 text-right font-medium">Tips</th>
              <th className="px-3 py-2.5 text-right font-medium">Absences</th>
              <th className="px-3 py-2.5 text-right font-medium">Net</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.staffId}>
                <td className="px-5 py-2.5 text-ink">
                  {l.name}
                  <span className="block text-xs text-muted">
                    {l.role}
                    {l.baseSalary === 0 && ' · no base salary set'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(l.baseSalary)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(l.commission)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(l.tips)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-danger">
                  {l.absenceDeduction > 0 ? `−${formatCurrency(l.absenceDeduction)}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(l.paid?.netPay ?? l.suggestedNet)}</td>
                <td className="px-5 py-2.5 text-right">
                  {l.paid ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <Badge tone="ok">Paid {l.paid.paidOn}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Download />}
                        onClick={() =>
                          void import('./payslipPdf').then(({ downloadPayslip }) =>
                            downloadPayslip(l.paid!, db.staff.find((s) => s.id === l.staffId), db.shops.find((s) => s.id === shopId), db.settings.business.name),
                          )
                        }
                      >
                        Payslip
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      leftIcon={<Wallet />}
                      onClick={() => {
                        setBonus('0');
                        setDeductions(String(l.absenceDeduction));
                        setNote('');
                        setPaying(l);
                      }}
                    >
                      Pay
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={paying !== null}
        onClose={() => setPaying(null)}
        title={`Pay ${paying?.name ?? ''} for ${month}`}
        description="Recorded once per month, added to Expenses as Salaries, and a payslip PDF is downloaded."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button loading={pay.pending} onClick={() => void pay.run()}>
              Record payment
            </Button>
          </>
        }
      >
        {paying && (
          <div className="space-y-4">
            <dl className="space-y-1.5 rounded-xl bg-canvas p-3.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Base salary</dt><dd>{formatCurrency(paying.baseSalary)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Commission</dt><dd>{formatCurrency(paying.commission)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Tips</dt><dd>{formatCurrency(paying.tips)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted"><Clock className="mr-1 inline h-3.5 w-3.5" />Hours this month</dt><dd>{paying.attendance.hours}</dd></div>
            </dl>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Bonus" type="number" min={0} value={bonus} onChange={(e) => setBonus(e.target.value)} />
              <Input label="Deductions" type="number" min={0} value={deductions} onChange={(e) => setDeductions(e.target.value)} hint="Absences, advances taken" />
            </div>
            <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="text-right font-display text-xl font-semibold text-ink">
              Net {formatCurrency(paying.baseSalary + paying.commission + paying.tips + (Number(bonus) || 0) - (Number(deductions) || 0))}
            </p>
          </div>
        )}
      </Modal>
    </Card>
  );
}

export default TeamPage;
