import { jsPDF } from 'jspdf';
import type { PayrollRun, Shop, Staff } from '@/types';

export function downloadPayslip(run: PayrollRun, staff: Staff | undefined, shop: Shop | undefined, business: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;
  let y = 18;
  const rs = (n: number): string => `Rs ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  doc.setFillColor(122, 24, 28);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(business, M, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${shop?.name ?? ''} · Payslip for ${run.month}`, M, 19);
  y = 38;
  doc.setTextColor(30, 26, 23);
  doc.setFontSize(10);
  doc.text(`Name: ${staff?.name ?? ''}`, M, y);
  doc.text(`Role: ${staff?.role ?? ''}`, M, y + 6);
  doc.text(`Paid on: ${run.paidOn}`, M, y + 12);
  y += 24;
  const rows: Array<[string, number]> = [
    ['Base salary', run.baseSalary],
    ['Commission', run.commission],
    ['Tips', run.tips],
    ['Bonus', run.bonus],
    ['Deductions', -run.deductions],
  ];
  for (const [label, v] of rows) {
    doc.text(label, M, y);
    doc.text(rs(v), W - M, y, { align: 'right' });
    y += 7;
  }
  doc.setDrawColor(201, 164, 92);
  doc.line(M, y - 3, W - M, y - 3);
  doc.setFont('helvetica', 'bold');
  doc.text('Net pay', M, y + 3);
  doc.text(rs(run.netPay), W - M, y + 3, { align: 'right' });
  if (run.note) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(run.note, M, y + 14, { maxWidth: W - 2 * M });
  }
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Employee signature: ____________________', M, 190);
  doc.save(`payslip-${(staff?.name ?? 'staff').replace(/\s+/g, '-').toLowerCase()}-${run.month}.pdf`);
}
