import { eachDayOfInterval, endOfMonth, parseISO, startOfMonth } from 'date-fns';
import type { Attendance, AttendanceStatus, PayrollRun, User } from '@/types';
import { uid } from '@/utils/id';
import { round2 } from '@/utils/money';
import { toISODate } from '@/utils/date';
import { commit, nowISO, read, ServiceError, stamped } from './db';
import { performance } from './staffService';

/** Attendance for one person on one day, or undefined if nothing recorded. */
export function entryFor(staffId: string, date: string): Attendance | undefined {
  return read().attendance.find((a) => a.staffId === staffId && a.date === date);
}

/** Sets the day's status, creating the row if needed. */
export async function mark(
  shopId: string,
  staffId: string,
  date: string,
  patch: Partial<Pick<Attendance, 'status' | 'clockIn' | 'clockOut' | 'note'>>,
): Promise<Attendance> {
  const existing = entryFor(staffId, date);
  return commit((db) => {
    if (existing) {
      const next = { ...existing, ...patch, updatedAt: nowISO() };
      db.attendance = db.attendance.map((a) => (a.id === existing.id ? next : a));
      return next;
    }
    const row: Attendance = stamped({
      id: uid('att'),
      shopId,
      staffId,
      date,
      status: 'present' as AttendanceStatus,
      clockIn: null,
      clockOut: null,
      note: '',
      ...patch,
    });
    db.attendance = [row, ...db.attendance];
    return row;
  });
}

export function clockIn(shopId: string, staffId: string): Promise<Attendance> {
  const now = new Date();
  const date = toISODate(now);
  const existing = entryFor(staffId, date);
  if (existing?.clockIn) throw new ServiceError('Already clocked in today.', 'conflict');
  // Late after the rostered start time, with ten minutes' grace.
  const staff = read().staff.find((s) => s.id === staffId);
  const shift = staff?.schedule.find((s) => s.weekday === now.getDay());
  let status: AttendanceStatus = 'present';
  if (shift?.working) {
    const [h, m] = shift.start.split(':').map(Number);
    const start = new Date(now);
    start.setHours(h ?? 0, (m ?? 0) + 10, 0, 0);
    if (now > start) status = 'late';
  }
  return mark(shopId, staffId, date, { status, clockIn: now.toISOString() });
}

export function clockOut(shopId: string, staffId: string): Promise<Attendance> {
  const date = toISODate(new Date());
  const existing = entryFor(staffId, date);
  if (!existing?.clockIn) throw new ServiceError('Clock in first.', 'validation');
  if (existing.clockOut) throw new ServiceError('Already clocked out today.', 'conflict');
  return mark(shopId, staffId, date, { clockOut: nowISO() });
}

export interface MonthSummary {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  leave: number;
  hours: number;
}

export function monthSummary(staffId: string, month: string): MonthSummary {
  const out: MonthSummary = { present: 0, late: 0, halfDay: 0, absent: 0, leave: 0, hours: 0 };
  for (const a of read().attendance) {
    if (a.staffId !== staffId || !a.date.startsWith(month)) continue;
    if (a.status === 'present') out.present += 1;
    else if (a.status === 'late') out.late += 1;
    else if (a.status === 'half-day') out.halfDay += 1;
    else if (a.status === 'absent') out.absent += 1;
    else if (a.status === 'leave') out.leave += 1;
    if (a.clockIn && a.clockOut) out.hours += (Date.parse(a.clockOut) - Date.parse(a.clockIn)) / 3_600_000;
  }
  out.hours = round2(out.hours);
  return out;
}

// ------------------------------------------------------------------ payroll

export interface PayrollLine {
  staffId: string;
  name: string;
  role: string;
  baseSalary: number;
  commission: number;
  tips: number;
  /** Salary for absences is deducted pro rata over the month's days. */
  absenceDeduction: number;
  attendance: MonthSummary;
  suggestedNet: number;
  paid: PayrollRun | undefined;
}

export function payrollFor(shopId: string | null, month: string): PayrollLine[] {
  const db = read();
  const from = startOfMonth(parseISO(`${month}-01`));
  const to = endOfMonth(from);
  const days = eachDayOfInterval({ start: from, end: to }).length;
  const perf = new Map(performance(shopId, from, to).map((p) => [p.staffId, p]));
  return db.staff
    .filter((s) => (shopId === null || s.shopId === shopId) && s.active)
    .map((s) => {
      const base = s.monthlySalary ?? 0;
      const tips = round2(
        db.sales
          .filter((x) => x.status === 'completed' && x.tipStaffId === s.id && x.soldAt.startsWith(month))
          .reduce((sum, x) => sum + (x.tip ?? 0), 0),
      );
      const att = monthSummary(s.id, month);
      const absenceDeduction = round2((base / days) * (att.absent + att.halfDay * 0.5));
      const commission = round2(perf.get(s.id)?.commission ?? 0);
      return {
        staffId: s.id,
        name: s.name,
        role: s.role,
        baseSalary: base,
        commission,
        tips,
        absenceDeduction,
        attendance: att,
        suggestedNet: round2(base + commission + tips - absenceDeduction),
        paid: db.payrollRuns.find((r) => r.staffId === s.id && r.month === month),
      };
    });
}

export interface PayInput {
  shopId: string;
  staffId: string;
  month: string;
  baseSalary: number;
  commission: number;
  tips: number;
  bonus: number;
  deductions: number;
  note: string;
}

/** Records the salary as paid and books it as a Salaries expense, once per month. */
export async function pay(input: PayInput, actor: User): Promise<PayrollRun> {
  const db0 = read();
  if (db0.payrollRuns.some((r) => r.staffId === input.staffId && r.month === input.month)) {
    throw new ServiceError('This month has already been paid.', 'conflict');
  }
  const staff = db0.staff.find((s) => s.id === input.staffId);
  const netPay = round2(input.baseSalary + input.commission + input.tips + input.bonus - input.deductions);
  if (netPay < 0) throw new ServiceError('Deductions are larger than the pay.', 'validation');
  const paidOn = toISODate(new Date());
  return commit((db) => {
    const expenseId = uid('exp');
    db.expenses = [
      stamped({
        id: expenseId,
        shopId: input.shopId,
        title: `Salary — ${staff?.name ?? 'staff'} (${input.month})`,
        category: 'Salaries' as const,
        amount: netPay,
        spentOn: paidOn,
        description: `Base ${input.baseSalary}, commission ${input.commission}, tips ${input.tips}, bonus ${input.bonus}, deductions ${input.deductions}. ${input.note}`.trim(),
        paidBy: actor.name,
      }),
      ...db.expenses,
    ];
    const row: PayrollRun = stamped({
      id: uid('pyr'),
      shopId: input.shopId,
      staffId: input.staffId,
      month: input.month,
      baseSalary: round2(input.baseSalary),
      commission: round2(input.commission),
      tips: round2(input.tips),
      bonus: round2(input.bonus),
      deductions: round2(input.deductions),
      netPay,
      paidOn,
      expenseId,
      note: input.note.trim(),
    });
    db.payrollRuns = [row, ...db.payrollRuns];
    return row;
  });
}
