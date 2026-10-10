import { jsPDF } from 'jspdf';
import type { BridalBooking, Settings, Shop, Staff } from '@/types';
import { balanceOf, paidOf } from '@/services/bridalService';
import { designFor } from '@/services/billDesign';
import { formatDate } from '@/utils/date';
import { amountInWords } from '@/utils/numberWords';

/** The booking as a quotation / confirmation the bride can keep. */
export function downloadQuotation(b: BridalBooking, shop: Shop | undefined, staff: Staff[], settings: Settings): void {
  const d = designFor(settings, shop);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const m = /^#?([0-9a-f]{6})$/i.exec(d.accentColor);
  const n = m && m[1] ? parseInt(m[1], 16) : 0x7a181c;
  const accent: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const rs = (v: number): string => `Rs ${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  let y = 0;

  doc.setFillColor(...accent);
  doc.rect(0, 0, W, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(settings.business.name || 'Aura by HS', M, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text([shop?.name, shop?.addressLine, shop?.phone].filter(Boolean).join(' · '), M, 22);
  doc.setFontSize(11);
  doc.text(b.status === 'tentative' ? 'BRIDAL QUOTATION' : 'BRIDAL BOOKING CONFIRMATION', M, 29);

  y = 46;
  doc.setTextColor(30, 26, 23);
  doc.setFontSize(10);
  const meta: Array<[string, string]> = [
    ['Booking no.', b.bookingNo],
    ['Bride', b.brideName],
    ['Phone', b.phone],
    ['Package', b.packageName],
    ['Status', b.status[0]?.toUpperCase() + b.status.slice(1)],
  ];
  for (const [k, v] of meta) {
    doc.setTextColor(110, 100, 95);
    doc.text(k, M, y);
    doc.setTextColor(30, 26, 23);
    doc.text(v, M + 32, y);
    y += 6;
  }

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...accent);
  doc.text('EVENTS', M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 26, 23);
  doc.setFontSize(9.5);
  for (const e of [...b.events].sort((a, c) => a.date.localeCompare(c.date))) {
    const artist = staff.find((s) => s.id === e.artistId)?.name ?? 'Artist to be confirmed';
    const where = e.location === 'on-location' ? `On location — ${e.venue}` : 'At the salon';
    doc.text(`${e.type}`, M, y);
    doc.text(`${e.date ? formatDate(e.date) : 'Date TBC'} · ready by ${e.readyBy}`, M + 30, y);
    doc.text(artist, W - M, y, { align: 'right' });
    y += 5;
    doc.setTextColor(110, 100, 95);
    doc.text(`${where}${e.lookNotes ? ` · ${e.lookNotes}` : ''}`.slice(0, 120), M + 30, y);
    doc.setTextColor(30, 26, 23);
    y += 7;
  }

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...accent);
  doc.setFontSize(10);
  doc.text('CHARGES', M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 26, 23);
  const line = (k: string, v: string, bold = false): void => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(k, M, y);
    doc.text(v, W - M, y, { align: 'right' });
    y += 6;
  };
  line(b.packageName, rs(b.packagePrice));
  for (const x of b.extras) line(x.name, rs(x.price));
  if (b.travelCharge) line('Travel / on-location', rs(b.travelCharge));
  if (b.discount) line('Discount', `-${rs(b.discount)}`);
  doc.setDrawColor(201, 164, 92);
  doc.line(M, y - 3, W - M, y - 3);
  line('Total', rs(b.total), true);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(110, 100, 95);
  doc.text(amountInWords(b.total), M, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(30, 26, 23);
  if (b.advanceRequired) line('Advance to hold the dates', rs(b.advanceRequired));
  for (const p of b.payments) line(`${p.kind === 'refund' ? 'Refunded' : 'Paid'} ${formatDate(p.at)} (${p.method})`, `${p.kind === 'refund' ? '-' : ''}${rs(p.amount)}`);
  line('Paid so far', rs(paidOf(b)), true);
  line('Balance', rs(balanceOf(b)), true);

  if (b.notes) {
    y += 3;
    doc.setFontSize(9);
    doc.setTextColor(110, 100, 95);
    doc.text(doc.splitTextToSize(`Notes: ${b.notes}`, W - 2 * M) as string[], M, y);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 100, 95);
  const terms = [
    d.terms,
    'The advance holds your dates and is non-refundable within 30 days of the first event.',
    'Please arrive with clean, moisturised skin and hair washed the day before.',
  ].filter(Boolean);
  doc.text(doc.splitTextToSize(terms.join('\n'), W - 2 * M) as string[], M, H - 34);
  doc.line(M, H - 16, M + 60, H - 16);
  doc.line(W - M - 60, H - 16, W - M, H - 16);
  doc.text('For the salon', M, H - 12);
  doc.text('Bride / family', W - M - 60, H - 12);
  doc.save(`${b.bookingNo}.pdf`);
}
