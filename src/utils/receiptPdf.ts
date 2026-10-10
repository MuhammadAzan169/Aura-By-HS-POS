import { jsPDF } from 'jspdf';
import type { Sale, Settings, Shop, Staff } from '@/types';
import { formatDateTime } from './date';

/**
 * A real PDF bill, generated in the browser — no server, no print dialog.
 * One click downloads `<receipt-no>.pdf`, ready to send on WhatsApp.
 *
 * jsPDF's built-in fonts are Latin-1 only, so the currency is written with
 * whichever of the symbol and the ISO code survives that (e.g. "Rs" or "PKR").
 */
export interface ReceiptPdfInput {
  sale: Sale;
  shop: Shop | undefined;
  staff: Staff | undefined;
  settings: Settings;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  'bank-transfer': 'Bank transfer',
  other: 'Other',
};

function paymentMethodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

const MAROON: [number, number, number] = [122, 24, 28];
const GOLD: [number, number, number] = [201, 164, 92];
const MUTED: [number, number, number] = [110, 100, 95];

function money(value: number, settings: Settings): string {
  const symbol = /^[\x20-\x7E]+$/.test(settings.billing.currency)
    ? settings.billing.currency
    : settings.billing.currencyCode;
  const amount = value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${symbol} ${amount}`;
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return null;
}

export function buildReceiptPdf({ sale, shop, staff, settings }: ReceiptPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = 14;

  // ---- Header band
  doc.setFillColor(...MAROON);
  doc.rect(0, 0, W, 30, 'F');
  const logo = shop?.logoUrl ?? settings.business.logoUrl;
  const fmt = logo ? imageFormat(logo) : null;
  let textX = M;
  if (logo && fmt) {
    try {
      doc.addImage(logo, fmt, M, 6, 18, 18);
      textX = M + 22;
    } catch {
      /* an unreadable logo never blocks the bill */
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(settings.business.name || 'Aura by HS', textX, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(shop?.name ?? settings.billing.receiptHeader, textX, 18.5);
  const contact = [shop?.addressLine, shop?.city, shop?.phone].filter(Boolean).join(' · ');
  if (contact) doc.text(contact, textX, 23, { maxWidth: W - textX - M });

  y = 40;
  doc.setTextColor(...MAROON);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(sale.status === 'refunded' ? 'REFUNDED BILL' : 'INVOICE', M, y);
  doc.setFontSize(9);
  doc.setTextColor(30, 26, 23);
  doc.text(sale.receiptNo, W - M, y, { align: 'right' });

  // ---- Meta
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const meta: Array<[string, string]> = [
    ['Date', formatDateTime(sale.soldAt)],
    ['Customer', sale.customerName || 'Walk-in'],
    ['Served by', staff?.name ?? '-'],
  ];
  for (const [label, value] of meta) {
    doc.setTextColor(...MUTED);
    doc.text(label, M, y);
    doc.setTextColor(30, 26, 23);
    doc.text(value, M + 24, y);
    y += 5;
  }

  // ---- Lines
  y += 3;
  const cols = { item: M, qty: W - M - 52, price: W - M - 26, total: W - M };
  doc.setFillColor(251, 247, 242);
  doc.rect(M - 2, y - 4.5, W - 2 * M + 4, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('ITEM', cols.item, y);
  doc.text('QTY', cols.qty, y, { align: 'center' });
  doc.text('PRICE', cols.price, y, { align: 'right' });
  doc.text('TOTAL', cols.total, y, { align: 'right' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const item of sale.items) {
    if (y > H - 50) {
      doc.addPage();
      y = 16;
    }
    doc.setTextColor(30, 26, 23);
    const name = doc.splitTextToSize(item.name, cols.qty - cols.item - 6) as string[];
    doc.text(name, cols.item, y);
    doc.text(String(item.quantity), cols.qty, y, { align: 'center' });
    doc.text(money(item.unitPrice, settings), cols.price, y, { align: 'right' });
    doc.text(money(item.lineTotal, settings), cols.total, y, { align: 'right' });
    y += 4.5 * name.length;
    if (item.discount > 0) {
      doc.setTextColor(46, 125, 50);
      doc.setFontSize(7.5);
      doc.text(`less ${money(item.discount, settings)}`, cols.item, y - 0.5);
      doc.setFontSize(8.5);
      y += 3.5;
    }
    y += 1.5;
  }

  // ---- Totals
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 6;
  const totals: Array<[string, string]> = [['Subtotal', money(sale.subtotal, settings)]];
  if (sale.membershipDiscount > 0) totals.push(['Membership discount', `-${money(sale.membershipDiscount, settings)}`]);
  if (sale.billDiscount > 0) totals.push(['Bill discount', `-${money(sale.billDiscount, settings)}`]);
  totals.push([`Tax (${sale.taxRate}%)`, money(sale.taxAmount, settings)]);
  for (const [label, value] of totals) {
    doc.setTextColor(...MUTED);
    doc.text(label, W - M - 60, y);
    doc.setTextColor(30, 26, 23);
    doc.text(value, W - M, y, { align: 'right' });
    y += 5;
  }
  y += 4;
  doc.setFillColor(...MAROON);
  doc.rect(W - M - 64, y - 5, 66, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('TOTAL', W - M - 60, y + 1);
  doc.text(money(sale.total, settings), W - M, y + 1, { align: 'right' });
  y += 12;

  // ---- Payments
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const p of sale.payments) {
    doc.setTextColor(...MUTED);
    doc.text(`Paid by ${paymentMethodLabel(p.method)}${p.reference ? ` (${p.reference})` : ''}`, M, y);
    doc.setTextColor(30, 26, 23);
    doc.text(money(p.tendered ?? p.amount, settings), W - M, y, { align: 'right' });
    y += 5;
  }
  if (sale.changeGiven > 0) {
    doc.setTextColor(...MUTED);
    doc.text('Change given', M, y);
    doc.setTextColor(30, 26, 23);
    doc.text(money(sale.changeGiven, settings), W - M, y, { align: 'right' });
    y += 5;
  }
  if (sale.status === 'refunded' && sale.refundReason) {
    y += 2;
    doc.setTextColor(180, 30, 40);
    doc.text(`Refunded: ${sale.refundReason}`, M, y, { maxWidth: W - 2 * M });
  }

  // ---- Footer
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  const footer = [shop?.receiptFooter, settings.billing.receiptFooter].filter(Boolean).join('\n');
  doc.text(footer, W / 2, H - 14, { align: 'center', maxWidth: W - 2 * M });
  doc.setDrawColor(...GOLD);
  doc.line(M, H - 20, W - M, H - 20);
  return doc;
}

export function downloadReceiptPdf(input: ReceiptPdfInput): void {
  buildReceiptPdf(input).save(`${input.sale.receiptNo}.pdf`);
}
