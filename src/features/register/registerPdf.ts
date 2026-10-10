import { jsPDF } from 'jspdf';
import type { RegisterSession, Shop } from '@/types';
import type { RegisterSummary } from '@/services/registerService';
import { formatDateTime } from '@/utils/date';

/** The end-of-day ("Z") report: one A4 page the owner can file or WhatsApp. */
export function downloadRegisterPdf(session: RegisterSession, summary: RegisterSummary, shop: Shop | undefined): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 16;
  let y = 20;
  const rs = (n: number): string => `Rs ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const row = (label: string, value: string, bold = false): void => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, M, y);
    doc.text(value, W - M, y, { align: 'right' });
    y += 6.5;
  };
  const heading = (t: string): void => {
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(122, 24, 28);
    doc.text(t.toUpperCase(), M, y);
    doc.setTextColor(30, 26, 23);
    doc.setDrawColor(201, 164, 92);
    doc.line(M, y + 1.5, W - M, y + 1.5);
    y += 8;
  };

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(122, 24, 28);
  doc.text('Day close report', M, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(30, 26, 23);
  doc.setFont('helvetica', 'normal');
  doc.text(shop?.name ?? '', M, y);
  y += 5.5;
  doc.text(`Opened ${formatDateTime(session.openedAt)} by ${session.openedBy}`, M, y);
  y += 5.5;
  if (session.closedAt) doc.text(`Closed ${formatDateTime(session.closedAt)} by ${session.closedBy ?? ''}`, M, y);
  y += 4;

  heading('Sales');
  row('Bills', String(summary.bills));
  row('Sales value', rs(summary.grossSales));
  row('Discounts given', rs(summary.discounts));
  row('Tax collected', rs(summary.tax));
  row('Tips', rs(summary.tips));
  row(`Refunds (${summary.refunds})`, rs(summary.refundedValue));

  heading('Money received');
  const labels: Record<string, string> = {
    cash: 'Cash', card: 'Card', 'bank-transfer': 'Bank transfer', other: 'Other',
    voucher: 'Gift vouchers redeemed', points: 'Loyalty points redeemed', wallet: 'Advances used',
  };
  for (const [k, v] of Object.entries(summary.byMethod)) if (v) row(labels[k] ?? k, rs(v));

  heading('Cash drawer');
  row('Opening float', rs(session.openingFloat));
  row('Cash from bills', rs(summary.cashSales));
  if (summary.voucherSalesCash) row('Gift vouchers sold (cash)', rs(summary.voucherSalesCash));
  if (summary.advancesCash) row('Advances taken (cash)', rs(summary.advancesCash));
  if (summary.refundCash) row('Refunded in cash', `-${rs(summary.refundCash)}`);
  if (summary.advanceRefundsCash) row('Advances returned', `-${rs(summary.advanceRefundsCash)}`);
  row('Cash put in', rs(summary.cashIn));
  row('Cash taken out', `-${rs(summary.cashOut)}`);
  row('Expected in drawer', rs(session.expectedCash ?? summary.expectedCash), true);
  if (session.countedCash !== null) {
    row('Counted', rs(session.countedCash), true);
    const d = session.difference ?? 0;
    row(d === 0 ? 'Balanced' : d > 0 ? 'Over' : 'Short', rs(Math.abs(d)), true);
  }

  if (session.movements.length) {
    heading('Cash in / out');
    doc.setFontSize(9);
    for (const m of session.movements) {
      row(`${formatDateTime(m.at)} · ${m.type === 'in' ? 'In' : 'Out'} · ${m.reason} (${m.byUserName})`, rs(m.amount));
    }
  }
  if (session.closingNotes) {
    heading('Notes');
    doc.setFont('helvetica', 'normal');
    doc.text(session.closingNotes, M, y, { maxWidth: W - 2 * M });
  }
  doc.save(`day-close-${(session.closedAt ?? session.openedAt).slice(0, 10)}.pdf`);
}
